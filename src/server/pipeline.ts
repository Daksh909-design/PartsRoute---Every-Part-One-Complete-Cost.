import { createHash } from "node:crypto";
import { sourceFor, retailers } from "../domain/catalogue";
import {
  Offer,
  QuoteInput,
  type Evidence,
  type QuoteResult,
  type ShippingObservation,
  type ShippingRule,
  type Basket,
} from "../domain/schema";
import { matchOffer } from "../domain/matching";
import { finish } from "../domain/quote";
import { priceLine } from "../domain/optimizer";
export { finish } from "../domain/quote";
import type { AIProvider } from "./ai";
import { withProductDetails } from "./ai";
import { createAIProvider } from "./ai-provider";
import {
  db,
  phase,
  usage,
  observation,
  saveObservation,
  normalizeObservation,
  preserveObservationTime,
  saveResult,
  writeForLease,
  type Observation,
} from "./db";
import { TinyFishClient, FetchResponse } from "./tinyfish";
import { groundedOffer } from "./grounding";
import { validateBasket } from "./shipping";
import { ProviderAccessError, RunRejectedError } from "./provider-error";
import { cachedAI } from "./extraction-cache";
import { observationTtl } from "./snapshot";
import { NORMALIZATION_VERSION } from "../domain/normalization";
import {
  retailerProduct,
  hasPublishedQuantityPricing,
} from "./retailer-product";
import {
  CollectionDeadline,
  collectionWindowMs,
  waitWithinDeadline,
} from "./deadline";
import { LeaseLost, type JobLease } from "./lease";
import {
  StorefrontClient,
  storefrontOrders,
  storefrontShipping,
  type StoreProduct,
} from "./storefront";
import { productDatasheet } from "./datasheet";
import {
  checkedOrders,
  verificationCandidates,
  type CheckedOrder,
} from "./candidates";

const orderingUnknown =
  "Price, pack size or ordering constraints could not be established from source evidence.";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Collection failed";
// Originals are immutable. A changed supplemental response on recovery needs
// its own source record, rather than normalizing new facts against old bytes.
const supplementalKey = (prefix: string, original: unknown) =>
  `${prefix}:${createHash("sha256").update(JSON.stringify(original)).digest("hex")}`;
function evidence(o: Observation, excerpt = ""): Evidence {
  return {
    id: o.id,
    sourceUrl: o.source_url,
    retrievedAt: new Date(o.retrieved_at).toISOString(),
    excerpt,
    method: o.method as Evidence["method"],
    runId: o.run_id,
    observationId: o.id,
  };
}
async function pageObservation(
  jobId: string,
  retailer: "robu" | "robocraze",
  url: string,
  refresh: boolean,
  tiny: TinyFishClient,
  fetchBatch?: () => Promise<FetchResponse>,
  lease?: JobLease,
): Promise<Observation> {
  const key = `fetch:${url}`;
  const existing = await observation(jobId, key);
  if (existing) return existing;
  const ttl = observationTtl();
  if (!refresh && Number.isFinite(ttl)) {
    const cached = await db().query(
      "SELECT * FROM observations WHERE source_url=$1 AND method='tinyfish-fetch' AND retrieved_at>now()-($2 * interval '1 second') ORDER BY retrieved_at DESC LIMIT 1",
      [url, ttl],
    );
    if (
      cached.rowCount &&
      FetchResponse.safeParse(cached.rows[0].original).success &&
      FetchResponse.parse(cached.rows[0].original).results.some(
        (p) => p.url === url && p.text.length >= 500,
      )
    ) {
      const old = cached.rows[0] as Observation;
      const copy = await saveObservation(
        jobId,
        key,
        retailer,
        url,
        "tinyfish-fetch",
        old.original,
        null,
        lease,
      );
      await preserveObservationTime(copy.id, old.id, lease);
      return { ...copy, retrieved_at: old.retrieved_at };
    }
  }
  const original = await (fetchBatch?.() ??
    tiny.fetchPages([url], retailer, refresh));
  const saved = await saveObservation(
    jobId,
    key,
    retailer,
    url,
    "tinyfish-fetch",
    original,
    null,
    lease,
  );
  if (!fetchBatch)
    await usage(jobId, {
      provider: "tinyfish-fetch",
      model: "fetch",
      requestId: null,
      inputTokens: null,
      outputTokens: null,
      raw: {
        urls: [url],
        usage: original.usage ?? null,
        errors: original.errors,
      },
    });
  return saved;
}
async function verify(
  jobId: string,
  basket: Basket,
  pincode: string,
  tiny: TinyFishClient,
  deadline: number,
  lease?: JobLease,
): Promise<{ shipping: ShippingObservation | null; orders: CheckedOrder[] }> {
  if (Date.now() >= deadline) throw new CollectionDeadline();
  const key = `basket:${createHash("sha256").update(basket.key).digest("hex")}`;
  const existingObservation = await observation(jobId, key);
  if (
    existingObservation?.normalized &&
    existingObservation.normalization_version === NORMALIZATION_VERSION
  )
    return "shipping" in (existingObservation.normalized as object)
      ? (existingObservation.normalized as {
          shipping: ShippingObservation;
          orders: CheckedOrder[];
        })
      : {
          shipping: existingObservation.normalized as ShippingObservation,
          orders: [],
        };
  let op = (
    await db().query(
      "SELECT * FROM provider_operations WHERE quote_id=$1 AND operation_key=$2",
      [jobId, key],
    )
  ).rows[0];
  if (!op) {
    const inserted = await writeForLease(
      lease,
      "INSERT INTO provider_operations(quote_id,operation_key,status,payload) VALUES($1,$2,'initiating',$3) ON CONFLICT DO NOTHING RETURNING *",
      [jobId, key, JSON.stringify({ basketKey: basket.key, pincode })],
    );
    if (!inserted.rowCount)
      throw new Error(
        "Basket operation already claimed; recover the existing run.",
      );
    try {
      const started = await tiny.startBasket(basket, pincode);
      await writeForLease(
        lease,
        "UPDATE provider_operations SET status='running',run_id=$3,updated_at=now() WHERE quote_id=$1 AND operation_key=$2",
        [jobId, key, started.run_id],
      );
      op = { ...inserted.rows[0], run_id: started.run_id, status: "running" };
    } catch (error) {
      await writeForLease(
        lease,
        "UPDATE provider_operations SET status=$3,updated_at=now() WHERE quote_id=$1 AND operation_key=$2",
        [
          jobId,
          key,
          error instanceof RunRejectedError ||
          error instanceof ProviderAccessError
            ? "rejected"
            : "uncertain",
        ],
      );
      if (
        error instanceof RunRejectedError ||
        error instanceof ProviderAccessError
      )
        throw error;
      throw new Error(
        `Basket run submission is uncertain. Recover its provider ID before retrying. ${message(error)}`,
      );
    }
  }
  if (op.status === "rejected")
    throw new Error(
      "TinyFish explicitly rejected this basket run. Check account access before creating a refreshed quote; no existing run needs recovery.",
    );
  if (!op.run_id)
    throw new Error(
      "An earlier basket run may exist. Attach its TinyFish run ID with recover:run; a duplicate was not started.",
    );
  let run = op.status === "complete" ? op.result : null;
  while (!run && Date.now() < deadline) {
    const next = await tiny.getRun(op.run_id);
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(next.status)) run = next;
    else
      await waitWithinDeadline(
        Math.min(750, Math.max(0, deadline - Date.now() - 1)),
        deadline,
        lease?.signal,
      );
  }
  if (!run)
    throw new Error(
      `Shipping run ${op.run_id} is still pending. Retry will recover this run.`,
    );
  await writeForLease(
    lease,
    "UPDATE provider_operations SET status='complete',result=$3,updated_at=now() WHERE quote_id=$1 AND operation_key=$2",
    [jobId, key, JSON.stringify(run)],
  );
  const o = await saveObservation(
    jobId,
    key,
    basket.retailer,
    retailers[basket.retailer].cartUrl,
    "tinyfish-agent",
    run,
    op.run_id,
    lease,
  );
  await usage(jobId, {
    provider: "tinyfish-agent",
    model: "agent",
    requestId: op.run_id,
    inputTokens: null,
    outputTokens: null,
    raw: {
      steps: run.num_of_steps ?? null,
      usage: run.usage ?? null,
      status: run.status,
    },
  });
  if (
    run.status !== "COMPLETED" ||
    !run.result ||
    run.result.status === "failure" ||
    run.result.error
  )
    throw new Error(
      `TinyFish shipping run ${op.run_id} did not verify this basket.`,
    );
  const shipping = validateBasket(run.result, basket, pincode, evidence(o));
  const orders = checkedOrders(run.result, basket, evidence(o));
  await normalizeObservation(o.id, { shipping, orders }, lease);
  return { shipping, orders };
}
export async function processQuote(
  jobId: string,
  rawInput: unknown,
  tiny?: TinyFishClient,
  suppliedAI?: AIProvider,
  lease?: JobLease,
  suppliedStorefront?: StorefrontClient,
): Promise<QuoteResult> {
  // Leave response/persistence headroom around the bounded collection window.
  // Expiry yields a truthful partial result, never a verified substitute.
  const parsedInput = QuoteInput.parse(rawInput);
  const deadline =
    Date.now() +
    Math.min(
      300000,
      collectionWindowMs() *
        Math.max(1, Math.ceil(parsedInput.parts.length / 8)),
    );
  const collector =
    tiny ?? new TinyFishClient(undefined, undefined, deadline, lease?.signal);
  const input = parsedInput,
    offers: Offer[] = [],
    rules: ShippingRule[] = [],
    shipping: ShippingObservation[] = [],
    errors: string[] = [];
  // Injected provider tests use their own storefront transport when needed;
  // never mix a fixture collector with a real merchant request.
  const storefront =
    suppliedStorefront ??
    (tiny ? undefined : new StorefrontClient(deadline, lease?.signal));
  const products = new Map<string, StoreProduct>();
  const orderSources = new Map<string, Evidence>();
  const productRequests = new Map(
    input.parts
      .filter((part) => sourceFor(part, "robocraze"))
      .map((part) => {
        const entry = {
          id: part.catalogueId,
          urls: { robocraze: sourceFor(part, "robocraze")!.url },
        };
        const id = `robocraze:${entry.id}`;
        return [
          id,
          storefront
            ? storefront
                .product(entry.urls.robocraze)
                .then(async (product) => {
                  const o = await saveObservation(
                    jobId,
                    supplementalKey(`storefront:${entry.id}`, product),
                    "robocraze",
                    `${entry.urls.robocraze}.js`,
                    "storefront-api",
                    product,
                    null,
                    lease,
                  );
                  products.set(id, product);
                  orderSources.set(id, evidence(o, JSON.stringify(product)));
                  return product;
                })
                .catch((error) => {
                  if (error instanceof LeaseLost) throw error;
                  lease?.signal.throwIfAborted();
                  errors.push(
                    `Robocraze: published ordering rules unavailable. ${message(error)}`,
                  );
                  return null;
                })
            : Promise.resolve(null),
        ];
      }),
  );
  const datasheetRequests = new Map(
    input.parts
      .filter(
        (part) =>
          part.requiredSpecs.some((spec) => spec.key === "pins") &&
          !tiny &&
          Boolean(sourceFor(part, "robocraze")),
      )
      .map((part) => {
        const entry = {
          id: part.catalogueId,
          urls: { robocraze: sourceFor(part, "robocraze")!.url },
        };
        const id = `robocraze:${entry.id}`;
        return [
          id,
          productDatasheet(
            entry.urls.robocraze,
            "robocraze",
            part.model,
            deadline,
            lease?.signal,
          )
            .then(async (result) => {
              if (!result?.specs.length) return null;
              const o = await saveObservation(
                jobId,
                supplementalKey(`datasheet:${entry.id}`, result),
                "robocraze",
                result.sourceUrl,
                "retailer-datasheet",
                result,
                null,
                lease,
              );
              return {
                ...result,
                evidence: evidence(
                  o,
                  result.specs.map((spec) => spec.excerpt).join("\n"),
                ),
              };
            })
            .catch((error) => {
              if (error instanceof LeaseLost) throw error;
              lease?.signal.throwIfAborted();
              errors.push(
                `Robocraze: linked specification could not be read. ${message(error)}`,
              );
              return null;
            }),
        ];
      }),
  );
  const supplements = Promise.all([
    ...productRequests.values(),
    ...datasheetRequests.values(),
  ]);
  // Install a rejection handler immediately while source collection runs. The
  // awaited promise below still propagates lease cancellation to the worker.
  void supplements.catch(() => {});
  const addStorefrontOrders = async (offer: Offer): Promise<Offer> => {
    const product = await productRequests.get(offer.id);
    const source = orderSources.get(offer.id);
    const requested = input.parts.find((part) => part.id === offer.partId);
    const variantId =
      requested && sourceFor(requested, offer.retailer)?.variantId;
    const variant = product?.variants.find((item) => item.id === variantId);
    // A selected variant has its own published SKU/price. The product page's
    // lowest variant price must not replace it or create a false conflict.
    const selected =
      requested?.sources?.length && variant && source && product
        ? {
            ...offer,
            variantId: variant.id,
            title: product.title,
            sku: variant.sku,
            priceBreaks: [{ minPacks: 1, packPricePaise: variant.price }],
            stock: variant.available
              ? ("in_stock" as const)
              : ("out_of_stock" as const),
            unitsPerPack: offer.sku === variant.sku ? offer.unitsPerPack : null,
            evidence: [...offer.evidence, source],
          }
        : variantId
          ? { ...offer, variantId }
          : offer;
    const ordered =
      product && source
        ? storefrontOrders(selected, product, source)
        : selected;
    const datasheet = await datasheetRequests.get(offer.id);
    return datasheet
      ? {
          ...ordered,
          specs: [
            ...ordered.specs,
            ...datasheet.specs.map(({ key, value }) => ({ key, value })),
          ],
          evidence: [...ordered.evidence, datasheet.evidence],
        }
      : ordered;
  };
  const ai =
    suppliedAI ??
    cachedAI(
      createAIProvider((u) => usage(jobId, u), deadline, lease?.signal),
      input.refresh,
    );
  const seen = new Set<string>();
  const limit = Math.min(
    3,
    Math.max(1, Number(process.env.MAX_BROWSER_CHECKS) || 3),
  );
  let checks = 0;
  let verificationRejected = false;
  async function checkBasket(basket: Basket) {
    if (seen.has(basket.key) || checks >= limit || verificationRejected) return;
    if (Date.now() >= deadline) {
      if (
        !errors.includes(
          "Basket verification time budget reached. Resume saved runs rather than starting duplicates.",
        )
      )
        errors.push(
          "Basket verification time budget reached. Resume saved runs rather than starting duplicates.",
        );
      return;
    }
    seen.add(basket.key);
    checks++;
    await phase(
      jobId,
      `Checking quantities, delivery and shipping (${checks} of ${limit})`,
      lease,
    );
    try {
      const inspected = await verify(
        jobId,
        basket,
        input.pincode,
        collector,
        deadline,
        lease,
      );
      if (inspected.shipping) shipping.push(inspected.shipping);
      for (const order of inspected.orders) {
        const index = offers.findIndex((offer) => offer.id === order.offerId);
        if (index < 0) continue;
        const offer = offers[index];
        if (
          (offer.minPacks !== null && offer.minPacks !== order.minPacks) ||
          (offer.multiplePacks !== null &&
            offer.multiplePacks !== order.multiplePacks)
        ) {
          offers[index] = {
            ...offer,
            match: "insufficient_information",
            orderingConflict: true,
            reasons: [
              ...offer.reasons,
              "Published and browser-observed ordering constraints conflict.",
            ],
            evidence: [...offer.evidence, order.evidence],
          };
        } else
          offers[index] = {
            ...offer,
            minPacks: order.minPacks,
            multiplePacks: order.multiplePacks,
            evidence: [...offer.evidence, order.evidence],
          };
        const source = offers[index].evidence.find(
          (source) => source.method === "tinyfish-fetch",
        );
        if (
          offers[index].unitsPerPack &&
          offers[index].minPacks &&
          offers[index].multiplePacks &&
          offers[index].priceBreaks.length
        )
          offers[index].reasons = offers[index].reasons.filter(
            (reason) => reason !== orderingUnknown,
          );
        if (source)
          await normalizeObservation(
            source.observationId,
            offers[index],
            lease,
          );
      }
    } catch (error) {
      if (error instanceof LeaseLost) throw error;
      lease?.signal.throwIfAborted();
      errors.push(`${retailers[basket.retailer].name}: ${message(error)}`);
      if (
        error instanceof ProviderAccessError ||
        error instanceof RunRejectedError
      )
        verificationRejected = true;
    }
    await saveResult(
      jobId,
      finish(input, offers, rules, shipping, errors),
      lease,
    );
  }
  let accessFailure: ProviderAccessError | null = null;
  await phase(jobId, "Collecting product pages and shipping policies", lease);
  // One Fetch batch per retailer; per-URL failures remain distinct. At most two
  // batches run at once. Cached pages and saved runs are reused on resumption.
  await Promise.all(
    (["robu", "robocraze"] as const)
      .filter((retailer) =>
        input.parts.some((part) => sourceFor(part, retailer)),
      )
      .map(async (retailer) => {
        let batch: Promise<FetchResponse> | undefined;
        const fetchBatch = () =>
          (batch ??= (async () => {
            const urls = [
              ...new Set([
                ...input.parts.flatMap((part) => {
                  const source = sourceFor(part, retailer);
                  return source ? [source.url] : [];
                }),
                retailers[retailer].policyUrl,
              ]),
            ];
            const startedAt = new Date().toISOString();
            const started = performance.now();
            let original: FetchResponse;
            try {
              original = { results: [], errors: [] };
              for (let offset = 0; offset < urls.length; offset += 10) {
                const chunk = urls.slice(offset, offset + 10);
                const returned = await collector.fetchPages(
                  chunk,
                  retailer,
                  input.refresh,
                );
                // Save each completed batch immediately so interruption retains it.
                await Promise.all(
                  chunk.map((url) =>
                    saveObservation(
                      jobId,
                      `fetch:${url}`,
                      retailer,
                      url,
                      "tinyfish-fetch",
                      returned,
                      null,
                      lease,
                    ),
                  ),
                );
                original.results.push(...returned.results);
                original.errors.push(...returned.errors);
              }
            } catch (error) {
              await usage(jobId, {
                provider: "tinyfish-fetch",
                model: "fetch",
                requestId: null,
                inputTokens: null,
                outputTokens: null,
                raw: {
                  state: "failed",
                  startedAt,
                  latencyMs: Math.round(performance.now() - started),
                  urls,
                  refresh: input.refresh,
                  usage: null,
                },
              });
              throw error;
            }
            await usage(jobId, {
              provider: "tinyfish-fetch",
              model: "fetch",
              requestId:
                typeof original.request_id === "string"
                  ? original.request_id
                  : null,
              inputTokens: null,
              outputTokens: null,
              raw: {
                state: "responded",
                startedAt,
                latencyMs: Math.round(performance.now() - started),
                refresh: input.refresh,
                urls,
                usage: original.usage ?? null,
                errors: original.errors,
              },
            });
            // Persist the whole returned batch before extraction. Otherwise later
            // pages appear to have been retrieved minutes after the HTTP response,
            // and a model failure can leave already-fetched pages unsaved.
            await Promise.all(
              urls.map((url) =>
                saveObservation(
                  jobId,
                  `fetch:${url}`,
                  retailer,
                  url,
                  "tinyfish-fetch",
                  original,
                  null,
                  lease,
                ),
              ),
            );
            return original;
          })());
        const collectProducts = async () => {
          await Promise.all(
            input.parts
              .filter((part) => sourceFor(part, retailer))
              .map(async (part) => {
                if (accessFailure) return;
                const source = sourceFor(part, retailer)!;
                const entry = {
                  id: part.catalogueId,
                  urls: { [retailer]: source.url },
                };
                try {
                  const o = await pageObservation(
                    jobId,
                    retailer,
                    entry.urls[retailer],
                    input.refresh,
                    collector,
                    fetchBatch,
                    lease,
                  );
                  if (
                    o.normalized &&
                    o.normalization_version === NORMALIZATION_VERSION &&
                    Offer.parse(o.normalized).extractionMethod !==
                      "retailer-parser"
                  ) {
                    offers.push(matchOffer(part, Offer.parse(o.normalized)));
                    return;
                  }
                  const response = FetchResponse.parse(o.original);
                  if (
                    response.errors.some((e) => e.url === entry.urls[retailer])
                  )
                    errors.push(
                      ...response.errors
                        .filter((e) => e.url === entry.urls[retailer])
                        .map(
                          (e) =>
                            `${retailers[retailer].name}: ${part.name} could not be retrieved (${String(e.error).slice(0, 160)}).`,
                        ),
                    );
                  const page = response.results.find(
                    (p) => p.url === entry.urls[retailer],
                  );
                  if (!page || page.text.length < 500) {
                    if (!response.errors.length)
                      errors.push(
                        `${retailers[retailer].name}: ${part.name} returned incomplete page content.`,
                      );
                    return;
                  }
                  const preliminary = retailerProduct(
                    page.text,
                    retailer,
                    Boolean(part.sources?.length),
                  );
                  let sourceComplete = false;
                  if (preliminary) {
                    const offer = matchOffer(
                      part,
                      await addStorefrontOrders({
                        ...groundedOffer(
                          preliminary,
                          page.text,
                          { ...evidence(o), sourceUrl: page.final_url },
                          retailer,
                          part.id,
                          `${retailer}:${entry.id}`,
                        ),
                        extractionMethod: "retailer-parser",
                      }),
                    );
                    const index = offers.findIndex(
                      (current) => current.id === offer.id,
                    );
                    if (index < 0) offers.push(offer);
                    else offers[index] = offer;
                    const priced = priceLine(part, offer);
                    sourceComplete =
                      priced !== null && priced.payablePaise !== null;
                    await normalizeObservation(o.id, offer, lease);
                    await saveResult(
                      jobId,
                      finish(input, offers, rules, shipping, errors),
                      lease,
                    );
                  }
                  if (sourceComplete && !hasPublishedQuantityPricing(page.text))
                    return;
                  const ex =
                    preliminary && ai.productDetails
                      ? withProductDetails(
                          preliminary,
                          await ai.productDetails(
                            page.text,
                            page.final_url,
                            part.model,
                            part.requiredSpecs.map((spec) => spec.key),
                          ),
                        )
                      : await ai.product(page.text, page.final_url, part.model);
                  const offer = matchOffer(
                    part,
                    await addStorefrontOrders(
                      groundedOffer(
                        ex,
                        page.text,
                        { ...evidence(o), sourceUrl: page.final_url },
                        retailer,
                        part.id,
                        `${retailer}:${entry.id}`,
                      ),
                    ),
                  );
                  if (
                    !offer.unitsPerPack ||
                    !offer.minPacks ||
                    !offer.multiplePacks ||
                    !offer.priceBreaks.length
                  )
                    offer.reasons.push(orderingUnknown);
                  offer.extractionMethod = "ai";
                  await normalizeObservation(o.id, offer, lease);
                  const index = offers.findIndex(
                    (current) => current.id === offer.id,
                  );
                  if (index < 0) offers.push(offer);
                  else offers[index] = offer;
                  await saveResult(
                    jobId,
                    finish(input, offers, rules, shipping, errors),
                    lease,
                  );
                } catch (error) {
                  if (error instanceof LeaseLost) throw error;
                  lease?.signal.throwIfAborted();
                  if (error instanceof ProviderAccessError) {
                    accessFailure = error;
                    return;
                  }
                  errors.push(
                    `${retailers[retailer].name}: ${part.name} ${offers.some((offer) => offer.id === `${retailer}:${entry.id}`) ? "AI details unverified; published listing facts retained." : "unavailable."} ${message(error)}`,
                  );
                }
              }),
          );
          if (retailer === "robocraze" && storefront) {
            const candidate = verificationCandidates(
              input,
              offers.filter((offer) => offer.retailer === retailer),
              rules,
            )[0]?.baskets[0];
            if (candidate && Date.now() < deadline) {
              try {
                const inspected = await storefront.shipping(
                  candidate,
                  input.pincode,
                  products,
                );
                const o = await saveObservation(
                  jobId,
                  supplementalKey("storefront-basket", {
                    basketKey: candidate.key,
                    inspected,
                  }),
                  retailer,
                  retailers[retailer].cartUrl,
                  "storefront-api",
                  inspected,
                  null,
                  lease,
                );
                const observed = storefrontShipping(
                  candidate,
                  inspected,
                  evidence(o, JSON.stringify(inspected)),
                );
                shipping.push(observed);
                await normalizeObservation(o.id, observed, lease);
                await saveResult(
                  jobId,
                  finish(input, offers, rules, shipping, errors),
                  lease,
                );
              } catch (error) {
                if (error instanceof LeaseLost) throw error;
                lease?.signal.throwIfAborted();
                errors.push(
                  `Robocraze: storefront shipping estimate unavailable. ${message(error)}`,
                );
              }
            }
          }
          // A complete retailer basket can be checked while another retailer is
          // still collecting. The shared budget and seen keys prevent duplicates.
          const candidate = verificationCandidates(
            input,
            offers.filter((offer) => offer.retailer === retailer),
            rules,
          )[0]?.baskets[0];
          if (candidate) await checkBasket(candidate);
        };
        const collectPolicy = async () => {
          if (accessFailure) return;
          try {
            const o = await pageObservation(
              jobId,
              retailer,
              retailers[retailer].policyUrl,
              input.refresh,
              collector,
              fetchBatch,
              lease,
            );
            if (
              o.normalized &&
              o.normalization_version === NORMALIZATION_VERSION
            ) {
              rules.push(o.normalized as ShippingRule);
              return;
            }
            const response = FetchResponse.parse(o.original),
              page = response.results.find(
                (p) => p.url === retailers[retailer].policyUrl,
              );
            if (
              !page ||
              response.errors.some(
                (e) => e.url === retailers[retailer].policyUrl,
              )
            )
              throw new Error("Shipping policy could not be retrieved");
            if (page.text.includes("Shipping Policy Page Content"))
              throw new Error(
                "Retailer returned a placeholder rather than an applicable shipping policy.",
              );
            // Policy text is useful evidence, but a national banner cannot prove
            // destination applicability or a final shipping charge. Keep it out
            // of the model critical path; only exact-cart observations qualify.
            const rule: ShippingRule = {
              retailer,
              basis: "unknown",
              thresholdPaise: null,
              comparison: "gte",
              belowChargePaise: null,
              aboveChargePaise: null,
              taxStatus: "unknown",
              taxRateBps: null,
              applicable: false,
              conditions:
                "Retailer policy captured. Exact destination and cart shipping still require verification.",
              evidence: [evidence(o, page.text.slice(0, 3000))],
            };
            await normalizeObservation(o.id, rule, lease);
            rules.push(rule);
          } catch (error) {
            if (error instanceof LeaseLost) throw error;
            lease?.signal.throwIfAborted();
            if (error instanceof ProviderAccessError) {
              accessFailure = error;
              return;
            }
            errors.push(
              `${retailers[retailer].name}: shipping policy unavailable. ${message(error)}`,
            );
          }
        };
        // Policy extraction is independent of product extraction. Do not add a
        // further model timeout after all product requests have finished.
        await Promise.all([collectProducts(), collectPolicy()]);
      }),
  );
  await supplements;
  if (accessFailure) throw accessFailure;
  // Stable order keeps plan IDs and recovery keys reproducible across worker restarts.
  offers.sort((a, b) => a.id.localeCompare(b.id));
  await saveResult(
    jobId,
    finish(input, offers, rules, shipping, errors),
    lease,
  );
  for (const plan of verificationCandidates(input, offers, rules))
    for (const basket of plan.baskets) await checkBasket(basket);
  return finish(input, offers, rules, shipping, errors);
}
