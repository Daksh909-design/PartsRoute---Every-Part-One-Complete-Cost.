import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ComponentSearchInput,
  type ComponentSearchResult,
  type SearchProduct,
} from "../domain/search";
import { paise } from "../domain/optimizer";
import { TinyFishClient } from "./tinyfish";
import { StorefrontClient } from "./storefront";
import { safeRetailerUrl } from "./urls";
import { db } from "./db";

const Suggestions = z.object({
  resources: z.object({
    results: z.object({
      products: z.array(
        z.object({
          title: z.string().min(1),
          url: z.string(),
          price: z.string().optional(),
          available: z.boolean().optional(),
        }),
      ),
    }),
  }),
});
const idFor = (url: string) =>
  createHash("sha256").update(url).digest("hex").slice(0, 24);
export function productUrl(input: string, retailer: "robu" | "robocraze") {
  const url = new URL(safeRetailerUrl(input, retailer));
  if (
    !(
      retailer === "robu" ? /^\/product\/[^/]+\/?$/ : /^\/products\/[^/]+\/?$/
    ).test(url.pathname)
  )
    throw new Error("Not a retailer product page");
  url.search = "";
  url.hash = "";
  return url.toString();
}
export function robuSearchProducts(text: string): SearchProduct[] {
  const found = new Map<string, SearchProduct>();
  for (const match of text.matchAll(
    /\[([^\]\n]+)\]\((https:\/\/(?:www\.)?robu\.in\/product\/[^\s)]+)\)/g,
  )) {
    try {
      const url = productUrl(match[2], "robu");
      const title = match[1].replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim();
      if (
        title.length < 4 ||
        /^(?:image|add to cart|buy now|read more)$/i.test(title)
      )
        continue;
      if (!found.has(url))
        found.set(url, {
          id: idFor(url),
          retailer: "robu",
          title,
          url,
          pricePaise: null,
          available: null,
          variants: [],
        });
    } catch {
      /* Search pages also contain non-product links. */
    }
  }
  return [...found.values()].slice(0, 10);
}
export async function componentSearch(
  raw: unknown,
  actor: string,
  transport: typeof fetch = fetch,
  suppliedTiny?: TinyFishClient,
): Promise<ComponentSearchResult> {
  const input = ComponentSearchInput.parse(raw);
  const deadline = Date.now() + 14000;
  const products: SearchProduct[] = [],
    errors: string[] = [],
    sources: ComponentSearchResult["sources"] = [],
    originals: unknown[] = [];
  const selected = input.retailer
    ? [input.retailer]
    : (["robocraze", "robu"] as const);
  const ranking = new Map<string, number>();
  await Promise.all(
    selected.map(async (retailer) => {
      try {
        if (retailer === "robocraze") {
          const url =
            "https://robocraze.com/search/suggest.json?" +
            new URLSearchParams({
              q: input.query,
              "resources[type]": "product",
              "resources[limit]": "10",
            });
          sources.push({ retailer, url });
          const response = await transport(url, {
            redirect: "error",
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok)
            throw new Error(`Search returned HTTP ${response.status}`);
          const original = await response.json();
          originals.push({ retailer, url, original });
          const listings =
            Suggestions.parse(original).resources.results.products;
          listings.forEach((listing, index) => {
            try {
              ranking.set(
                productUrl(
                  new URL(listing.url, "https://robocraze.com").toString(),
                  "robocraze",
                ),
                index,
              );
            } catch {}
          });
          const storefront = new StorefrontClient(
            deadline,
            undefined,
            transport,
          );
          // Small concurrent batches respect retailer resources; no synthetic fallback.
          for (let offset = 0; offset < listings.length; offset += 4)
            await Promise.all(
              listings.slice(offset, offset + 4).map(async (listing) => {
                const productURL = productUrl(
                  new URL(listing.url, "https://robocraze.com").toString(),
                  retailer,
                );
                let pricePaise: number | null = null;
                if (listing.price)
                  try {
                    pricePaise = paise(listing.price);
                  } catch {}
                let variants: SearchProduct["variants"] = [];
                try {
                  const originalProduct = await storefront.product(productURL);
                  originals.push({
                    retailer,
                    url: productURL + ".js",
                    original: originalProduct,
                  });
                  variants = originalProduct.variants.map((variant) => ({
                    id: variant.id,
                    title: variant.title ?? "Standard listing",
                    sku: variant.sku,
                    pricePaise: variant.price,
                    available: variant.available,
                  }));
                } catch {
                  errors.push(
                    `Robocraze: variant details unavailable for ${listing.title}; selection is disabled until a later successful search.`,
                  );
                }
                products.push({
                  id: idFor(productURL),
                  retailer,
                  title: listing.title,
                  url: productURL,
                  pricePaise,
                  available: listing.available ?? null,
                  variants,
                });
              }),
            );
        } else {
          const url =
            "https://robu.in/?" +
            new URLSearchParams({ s: input.query, post_type: "product" });
          sources.push({ retailer, url });
          const original = await (
            suppliedTiny ?? new TinyFishClient(undefined, transport, deadline)
          ).fetchPages([url], "robu", true);
          originals.push({ retailer, url, original });
          const page = original.results.find((result) => result.url === url);
          if (!page)
            throw new Error(
              original.errors.map((error) => String(error.error)).join("; ") ||
                "No usable search page returned",
            );
          const found = robuSearchProducts(page.text);
          products.push(...found);
          if (
            !found.length &&
            /blocked|captcha|just a moment|access denied/i.test(page.text)
          )
            throw new Error("Retailer blocked search collection");
        }
      } catch (error) {
        errors.push(
          `${retailer === "robu" ? "Robu" : "Robocraze"}: ${error instanceof Error ? error.message : "Search failed"}. No replacement listings were invented.`,
        );
      }
    }),
  );
  products.sort(
    (a, b) =>
      selected.indexOf(a.retailer) - selected.indexOf(b.retailer) ||
      (ranking.get(a.url) ?? 0) - (ranking.get(b.url) ?? 0),
  );
  const result: ComponentSearchResult = {
    id: randomUUID(),
    query: input.query,
    products,
    errors,
    observedAt: new Date().toISOString(),
    sources,
  };
  await db().query(
    "INSERT INTO component_searches(id,actor,query,original,result) VALUES($1,$2,$3,$4,$5)",
    [
      result.id,
      actor,
      input.query,
      JSON.stringify(originals),
      JSON.stringify(result),
    ],
  );
  return result;
}
