import { z } from "zod";
import type {
  Basket,
  Evidence,
  Offer,
  ShippingObservation,
} from "../domain/schema";
import { paise } from "../domain/optimizer";
import { requestSignal } from "./deadline";
import { safeRetailerUrl } from "./urls";

const Integer = z.number().int().nonnegative();
const Variant = z.object({
  id: z.number().int().positive(),
  sku: z.string(),
  title: z.string().optional(),
  price: Integer,
  available: z.boolean(),
  quantity_rule: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive().nullable(),
    increment: z.number().int().positive(),
  }),
});
export const StoreProduct = z.object({
  title: z.string(),
  handle: z.string(),
  variants: z.array(Variant).min(1),
});
export type StoreProduct = z.infer<typeof StoreProduct>;
const Cart = z.object({
  currency: z.literal("INR"),
  total_price: Integer,
  items: z.array(
    z.object({
      variant_id: z.number().int().positive(),
      sku: z.string(),
      quantity: z.number().int().positive(),
      final_line_price: Integer,
    }),
  ),
});
const Rates = z.object({
  shipping_rates: z.array(
    z.object({
      name: z.string(),
      price: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
      currency: z.literal("INR"),
    }),
  ),
});

// Each instance owns a new anonymous cookie jar. No user browser, credentials,
// checkout endpoint, cart clearing, payment or order submission is involved.
export class StorefrontClient {
  private cookies = new Map<string, string>();
  constructor(
    private deadline = Infinity,
    private signal?: AbortSignal,
    private transport: typeof fetch = fetch,
  ) {}
  private async request(path: string, body?: unknown): Promise<unknown> {
    const response = await this.transport(`https://robocraze.com${path}`, {
      method: body === undefined ? "GET" : "POST",
      redirect: "error",
      signal: requestSignal(this.deadline, 6000, this.signal),
      headers: {
        "Content-Type": "application/json",
        Cookie: [...this.cookies]
          .map(([key, value]) => `${key}=${value}`)
          .join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`Storefront returned HTTP ${response.status}`);
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const split = pair.indexOf("=");
      if (split > 0)
        this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    // Shopify's product endpoint returns JSON with text/javascript MIME type.
    return response.json();
  }
  async product(url: string): Promise<StoreProduct> {
    const source = new URL(safeRetailerUrl(url, "robocraze"));
    if (!/^\/products\/[a-z0-9-]+\/?$/.test(source.pathname))
      throw new Error("Unsupported storefront product URL");
    const handle = source.pathname.split("/")[2];
    const product = StoreProduct.parse(
      await this.request(`/products/${handle}.js`),
    );
    if (product.handle !== handle)
      throw new Error("Storefront product identity changed");
    return product;
  }
  async shipping(
    basket: Basket,
    pincode: string,
    products: Map<string, StoreProduct>,
  ) {
    if (basket.retailer !== "robocraze" || !/^[1-9]\d{5}$/.test(pincode))
      throw new Error("Unsupported storefront basket or pincode");
    const lines = basket.lines.map((line) => {
      const variants =
        products
          .get(line.offer.id)
          ?.variants.filter((variant) =>
            line.offer.variantId !== undefined
              ? variant.id === line.offer.variantId
              : variant.sku === line.offer.sku,
          ) ?? [];
      if (variants.length !== 1 || !variants[0].available)
        throw new Error("Storefront variant is unavailable or ambiguous");
      return { line, variant: variants[0] };
    });
    // Resolve only geographic state from a public pincode directory. Never
    // fabricate a name, street address, phone number or other customer detail.
    const stateRequest = this.transport(
      `https://api.postalpincode.in/pincode/${pincode}`,
      {
        redirect: "error",
        signal: requestSignal(this.deadline, 6000, this.signal),
      },
    ).then(async (response) => {
      if (!response.ok) throw new Error("Pincode directory unavailable");
      const entries = z
        .array(
          z.object({
            PostOffice: z
              .array(
                z.object({
                  State: z.string().min(1),
                  Pincode: z.string(),
                  Country: z.literal("India"),
                }),
              )
              .nullable(),
          }),
        )
        .parse(await response.json());
      const offices = entries.flatMap((entry) => entry.PostOffice ?? []);
      const states = [...new Set(offices.map((office) => office.State))];
      if (
        !offices.length ||
        offices.some((office) => office.Pincode !== pincode) ||
        states.length !== 1
      )
        throw new Error("Pincode state could not be verified");
      return states[0];
    });
    const cartRequest = (async () => {
      const empty = Cart.parse(await this.request("/cart.js"));
      if (empty.items.length || empty.total_price !== 0)
        throw new Error("Guest cart was not empty; it was left unchanged");
      await this.request("/cart/add.js", {
        items: lines.map(({ line, variant }) => ({
          id: variant.id,
          quantity: line.packs,
        })),
      });
      const cart = Cart.parse(await this.request("/cart.js"));
      if (
        cart.items.length !== lines.length ||
        cart.total_price !== basket.payableItemsPaise ||
        lines.some(({ line, variant }) => {
          const matches = cart.items.filter(
            (item) => item.variant_id === variant.id,
          );
          return (
            matches.length !== 1 ||
            matches[0].sku !== line.offer.sku ||
            matches[0].quantity !== line.packs ||
            matches[0].final_line_price !== line.payablePaise
          );
        })
      )
        throw new Error(
          "Guest cart prices or composition changed; recollect the quote",
        );
      return cart;
    })();
    const [state, cart] = await Promise.all([stateRequest, cartRequest]);
    const path =
      "/cart/shipping_rates.json?" +
      new URLSearchParams({
        "shipping_address[zip]": pincode,
        "shipping_address[country]": "India",
        "shipping_address[province]": state,
      });
    const rates = Rates.parse(await this.request(path));
    const cheapest = [...rates.shipping_rates].sort(
      (a, b) => paise(a.price) - paise(b.price),
    )[0];
    // Deliberately omit anonymous cart tokens/cookies and unrelated customer
    // fields from persisted evidence. The API provides an estimate, not tax.
    return { cart, rates, state, pincode, cheapest: cheapest ?? null };
  }
}

export function storefrontOrders(
  offer: Offer,
  product: StoreProduct,
  source: Evidence,
): Offer {
  const variants = product.variants.filter((variant) =>
    offer.variantId !== undefined
      ? variant.id === offer.variantId
      : variant.sku === offer.sku,
  );
  if (
    variants.length !== 1 ||
    variants[0].price !==
      offer.priceBreaks.find((p) => p.minPacks === 1)?.packPricePaise
  )
    return {
      ...offer,
      orderingConflict: true,
      match: "insufficient_information",
      reasons: [
        ...offer.reasons,
        "Listing and storefront variant or price did not agree.",
      ],
      evidence: [...offer.evidence, source],
    };
  const { min, max, increment } = variants[0].quantity_rule;
  if (min % increment !== 0) return offer;
  if (
    (offer.minPacks !== null && offer.minPacks !== min) ||
    (offer.multiplePacks !== null && offer.multiplePacks !== increment)
  )
    return {
      ...offer,
      orderingConflict: true,
      match: "insufficient_information",
      reasons: [
        ...offer.reasons,
        "Listing and storefront ordering rules conflict.",
      ],
      evidence: [...offer.evidence, source],
    };
  return {
    ...offer,
    minPacks: min,
    multiplePacks: increment,
    stock: variants[0].available ? offer.stock : "out_of_stock",
    availablePacks:
      max === null
        ? offer.availablePacks
        : Math.min(max, offer.availablePacks ?? max),
    evidence: [...offer.evidence, source],
  };
}

export function storefrontShipping(
  basket: Basket,
  result: Awaited<ReturnType<StorefrontClient["shipping"]>>,
  source: Evidence,
): ShippingObservation {
  return {
    id: source.id,
    retailer: basket.retailer,
    basketKey: basket.key,
    items: basket.lines.map((line) => ({
      offerId: line.offer.id,
      sku: line.offer.sku,
      packs: line.packs,
    })),
    pincode: result.pincode,
    method: result.cheapest?.name ?? "Storefront estimator",
    chargePaise: result.cheapest ? paise(result.cheapest.price) : null,
    taxStatus: "unknown",
    taxRateBps: null,
    serviceable: result.cheapest ? true : null,
    status: result.cheapest ? "estimated" : "unknown",
    conditions:
      "Exact guest cart matched. Retailer shipping estimate does not disclose shipping tax or a final delivered total; checkout confirmation is required.",
    observedAt: source.retrievedAt,
    evidence: [source],
  };
}
