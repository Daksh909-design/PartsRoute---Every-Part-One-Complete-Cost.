import { createHash } from "node:crypto";
import { catalogue, retailers } from "../domain/catalogue";
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
  type Observation,
} from "./db";
import { TinyFishClient, FetchResponse } from "./tinyfish";
import { groundedOffer, groundedRule } from "./grounding";
import { validateBasket } from "./shipping";
import { ProviderAccessError, RunRejectedError } from "./provider-error";
import { cachedAI } from "./extraction-cache";
import { observationTtl } from "./snapshot";
import { NORMALIZATION_VERSION } from "../domain/normalization";
import { retailerProduct } from "./retailer-product";
import { CollectionDeadline, collectionWindowMs } from "./deadline";
import {
  checkedOrders,
  verificationCandidates,
  type CheckedOrder,
} from "./candidates";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const orderingUnknown =
  "Price, pack size or ordering constraints could not be established from source evidence.";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Collection failed";
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
      );
      await preserveObservationTime(copy.id, old.id);
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
    const inserted = await db().query(
      "INSERT INTO provider_operations(quote_id,operation_key,status,payload) VALUES($1,$2,'initiating',$3) ON CONFLICT DO NOTHING RETURNING *",
      [jobId, key, JSON.stringify({ basketKey: basket.key, pincode })],
    );
    if (!inserted.rowCount)
      throw new Error(
        "Basket operation already claimed; recover the existing run.",
      );
    try {
      const started = await tiny.startBasket(basket, pincode);
      await db().query(
        "UPDATE provider_operations SET status='running',run_id=$3,updated_at=now() WHERE quote_id=$1 AND operation_key=$2",
        [jobId, key, started.run_id],
      );
      op = { ...inserted.rows[0], run_id: started.run_id, status: "running" };
    } catch (error) {
      await db().query(
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
    else await wait(750);
  }
  if (!run)
    throw new Error(
      `Shipping run ${op.run_id} is still pending. Retry will recover this run.`,
    );
  await db().query(
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
  await normalizeObservation(o.id, { shipping, orders });
  return { shipping, orders };
}
export async function processQuote(
  jobId: string,
  rawInput: unknown,
  tiny?: TinyFishClient,
  suppliedAI?: AIProvider,
): Promise<QuoteResult> {
  // Leave response/persistence headroom around the thirty-second UI target.
  // Expiry yields a truthful partial result, never a verified substitute.
  const deadline = Date.now() + collectionWindowMs();
  const collector = tiny ?? new TinyFishClient(undefined, undefined, deadline);
  const input = QuoteInput.parse(rawInput),
    offers: Offer[] = [],
    rules: ShippingRule[] = [],
    shipping: ShippingObservation[] = [],
    errors: string[] = [];
  const ai =
    suppliedAI ??
    cachedAI(
      createAIProvider((u) => usage(jobId, u), deadline),
      input.refresh,
    );
  let accessFailure: ProviderAccessError | null = null;
  await phase(jobId, "Collecting product pages and shipping policies");
  // One Fetch batch per retailer; per-URL failures remain distinct. At most two
  // batches run at once. Cached pages and saved runs are reused on resumption.
  await Promise.all(
    (["robu", "robocraze"] as const).map(async (retailer) => {
      let batch: Promise<FetchResponse> | undefined;
      const fetchBatch = () =>
        (batch ??= (async () => {
          const urls = [
            ...input.parts.map(
              (part) =>
                catalogue.find((c) => c.id === part.catalogueId)!.urls[
                  retailer
                ],
            ),
            retailers[retailer].policyUrl,
          ];
          const startedAt = new Date().toISOString();
          const started = performance.now();
          let original: FetchResponse;
          try {
            original = await collector.fetchPages(
              urls,
              retailer,
              input.refresh,
            );
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
              ),
            ),
          );
          return original;
        })());
      const collectProducts = async () => {
        await Promise.all(
          input.parts.map(async (part) => {
            if (accessFailure) return;
            const entry = catalogue.find((c) => c.id === part.catalogueId)!;
            try {
              const o = await pageObservation(
                jobId,
                retailer,
                entry.urls[retailer],
                input.refresh,
                collector,
                fetchBatch,
              );
              if (
                o.normalized &&
                o.normalization_version === NORMALIZATION_VERSION &&
                Offer.parse(o.normalized).extractionMethod !== "retailer-parser"
              ) {
                offers.push(matchOffer(part, Offer.parse(o.normalized)));
                return;
              }
              const response = FetchResponse.parse(o.original);
              if (response.errors.some((e) => e.url === entry.urls[retailer]))
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
              const preliminary = retailerProduct(page.text, retailer);
              if (preliminary) {
                const offer = matchOffer(part, {
                  ...groundedOffer(
                    preliminary,
                    page.text,
                    { ...evidence(o), sourceUrl: page.final_url },
                    retailer,
                    part.id,
                    `${retailer}:${entry.id}`,
                  ),
                  extractionMethod: "retailer-parser",
                });
                const index = offers.findIndex(
                  (current) => current.id === offer.id,
                );
                if (index < 0) offers.push(offer);
                else offers[index] = offer;
                await normalizeObservation(o.id, offer);
                await saveResult(
                  jobId,
                  finish(input, offers, rules, shipping, errors),
                );
              }
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
                groundedOffer(
                  ex,
                  page.text,
                  { ...evidence(o), sourceUrl: page.final_url },
                  retailer,
                  part.id,
                  `${retailer}:${entry.id}`,
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
              await normalizeObservation(o.id, offer);
              const index = offers.findIndex(
                (current) => current.id === offer.id,
              );
              if (index < 0) offers.push(offer);
              else offers[index] = offer;
              await saveResult(
                jobId,
                finish(input, offers, rules, shipping, errors),
              );
            } catch (error) {
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
            response.errors.some((e) => e.url === retailers[retailer].policyUrl)
          )
            throw new Error("Shipping policy could not be retrieved");
          if (page.text.includes("Shipping Policy Page Content"))
            throw new Error(
              "Retailer returned a placeholder rather than an applicable shipping policy.",
            );
          const rule = groundedRule(
            await ai.policy(page.text, input.pincode),
            page.text,
            evidence(o),
            retailer,
          );
          await normalizeObservation(o.id, rule);
          rules.push(rule);
        } catch (error) {
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
  if (accessFailure) throw accessFailure;
  // Stable order keeps plan IDs and recovery keys reproducible across worker restarts.
  offers.sort((a, b) => a.id.localeCompare(b.id));
  let result = finish(input, offers, rules, shipping, errors);
  await saveResult(jobId, result);
  const shortlist = verificationCandidates(input, offers, rules),
    seen = new Set<string>();
  const limit = Math.min(
    3,
    Math.max(1, Number(process.env.MAX_BROWSER_CHECKS) || 3),
  );
  let checks = 0;
  const verificationDeadline = Math.min(deadline, Date.now() + 45000);
  verification: for (const plan of shortlist) {
    for (const basket of plan.baskets) {
      if (seen.has(basket.key) || checks >= limit) continue;
      if (Date.now() >= verificationDeadline) {
        errors.push(
          "Basket verification time budget reached. Resume saved runs rather than starting duplicates.",
        );
        break verification;
      }
      seen.add(basket.key);
      checks++;
      await phase(
        jobId,
        `Checking quantities, delivery and shipping (${checks} of ${limit})`,
      );
      try {
        const inspected = await verify(
          jobId,
          basket,
          input.pincode,
          collector,
          verificationDeadline,
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
            await normalizeObservation(source.observationId, offers[index]);
        }
      } catch (error) {
        errors.push(`${retailers[basket.retailer].name}: ${message(error)}`);
        if (
          error instanceof ProviderAccessError ||
          error instanceof RunRejectedError
        )
          break verification;
      }
      result = finish(input, offers, rules, shipping, errors);
      await saveResult(jobId, result);
    }
  }
  await phase(jobId, "Explaining the checked options");
  result = finish(input, offers, rules, shipping, errors);
  if (!result.recommendedId) return result;
  try {
    const facts = [
      result.explanation,
      `${result.coverage.covered} of ${result.coverage.requested} requested lines have eligible priced offers.`,
      `${result.plans.filter((p) => p.verified).length} of ${result.plans.length} generated plans have a fully verified total.`,
      "Missing shipping, stock and tax details remain unknown; retailer prices can change.",
    ];
    result.explanation = (await ai.explain(facts)) || facts.join(" ");
    result.explanationSource =
      ai.provider === "gemini" ? "gemini-validated" : "openai-validated";
  } catch {
    result.errors.push(
      "The recommendation explanation used validated local facts because the AI explanation was unavailable.",
    );
  }
  return result;
}
