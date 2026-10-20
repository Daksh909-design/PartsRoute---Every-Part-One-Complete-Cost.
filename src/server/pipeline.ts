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
import { createAIProvider } from "./ai-provider";
import {
  db,
  phase,
  usage,
  observation,
  saveObservation,
  normalizeObservation,
  saveResult,
  type Observation,
} from "./db";
import { TinyFishClient, FetchResponse } from "./tinyfish";
import { groundedOffer, groundedRule } from "./grounding";
import { validateBasket } from "./shipping";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
): Promise<Observation> {
  const key = `fetch:${url}`;
  const existing = await observation(jobId, key);
  if (existing) return existing;
  const ttl = Math.min(
    3600,
    Math.max(0, Number(process.env.OBSERVATION_TTL_SECONDS || 900)),
  );
  if (!refresh && Number.isFinite(ttl)) {
    const cached = await db().query(
      "SELECT * FROM observations WHERE source_url=$1 AND method='tinyfish-fetch' AND original->'results'->0->>'text' IS NOT NULL AND retrieved_at>now()-($2 * interval '1 second') ORDER BY retrieved_at DESC LIMIT 1",
      [url, ttl],
    );
    if (cached.rowCount) {
      const old = cached.rows[0] as Observation;
      const copy = await saveObservation(
        jobId,
        key,
        retailer,
        url,
        "tinyfish-fetch",
        old.original,
      );
      await db().query("UPDATE observations SET retrieved_at=$2 WHERE id=$1", [
        copy.id,
        old.retrieved_at,
      ]);
      return { ...copy, retrieved_at: old.retrieved_at };
    }
  }
  const original = await tiny.fetchPages([url], retailer, refresh);
  const saved = await saveObservation(
    jobId,
    key,
    retailer,
    url,
    "tinyfish-fetch",
    original,
  );
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
): Promise<ShippingObservation | null> {
  const key = `basket:${createHash("sha256").update(basket.key).digest("hex")}`;
  const existingObservation = await observation(jobId, key);
  if (existingObservation?.normalized)
    return existingObservation.normalized as ShippingObservation;
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
        "UPDATE provider_operations SET status='uncertain',updated_at=now() WHERE quote_id=$1 AND operation_key=$2",
        [jobId, key],
      );
      throw new Error(
        `Basket run submission is uncertain. Recover its provider ID before retrying. ${message(error)}`,
      );
    }
  }
  if (!op.run_id)
    throw new Error(
      "An earlier basket run may exist. Attach its TinyFish run ID with recover:run; a duplicate was not started.",
    );
  const deadline = Date.now() + 240000;
  let run = op.status === "complete" ? op.result : null;
  while (!run && Date.now() < deadline) {
    const next = await tiny.getRun(op.run_id);
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(next.status)) run = next;
    else await wait(5000);
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
  await normalizeObservation(o.id, shipping);
  return shipping;
}
export async function processQuote(
  jobId: string,
  rawInput: unknown,
  tiny = new TinyFishClient(),
  suppliedAI?: AIProvider,
): Promise<QuoteResult> {
  const input = QuoteInput.parse(rawInput),
    offers: Offer[] = [],
    rules: ShippingRule[] = [],
    shipping: ShippingObservation[] = [],
    errors: string[] = [];
  const ai = suppliedAI ?? createAIProvider((u) => usage(jobId, u));
  await phase(jobId, "Collecting product pages and shipping policies");
  // Two independent retailer collectors, sequential requests within each: at most two Fetch/extraction calls at once.
  await Promise.all(
    (["robu", "robocraze"] as const).map(async (retailer) => {
      for (const part of input.parts) {
        const entry = catalogue.find((c) => c.id === part.catalogueId)!;
        try {
          const o = await pageObservation(
            jobId,
            retailer,
            entry.urls[retailer],
            input.refresh,
            tiny,
          );
          if (o.normalized) {
            offers.push(matchOffer(part, Offer.parse(o.normalized)));
            continue;
          }
          const response = FetchResponse.parse(o.original);
          if (response.errors.length)
            errors.push(
              ...response.errors.map(
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
            continue;
          }
          const ex = await ai.product(page.text, page.final_url, part.model);
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
            offer.reasons.push(
              "Price, pack size or ordering constraints could not be established from source evidence.",
            );
          await normalizeObservation(o.id, offer);
          offers.push(offer);
        } catch (error) {
          errors.push(
            `${retailers[retailer].name}: ${part.name} unavailable. ${message(error)}`,
          );
        }
      }
      try {
        const o = await pageObservation(
          jobId,
          retailer,
          retailers[retailer].policyUrl,
          input.refresh,
          tiny,
        );
        if (o.normalized) {
          rules.push(o.normalized as ShippingRule);
          return;
        }
        const response = FetchResponse.parse(o.original),
          page = response.results[0];
        if (!page || response.errors.length)
          throw new Error("Shipping policy could not be retrieved");
        const rule = groundedRule(
          await ai.policy(page.text, input.pincode),
          page.text,
          evidence(o),
          retailer,
        );
        await normalizeObservation(o.id, rule);
        rules.push(rule);
      } catch (error) {
        errors.push(
          `${retailers[retailer].name}: shipping policy unavailable. ${message(error)}`,
        );
      }
    }),
  );
  // Stable order keeps plan IDs and recovery keys reproducible across worker restarts.
  offers.sort((a, b) => a.id.localeCompare(b.id));
  let result = finish(input, offers, rules, shipping, errors);
  await saveResult(jobId, result);
  const shortlist = result.plans.slice(0, 3),
    seen = new Set<string>();
  const limit = Math.min(
    3,
    Math.max(1, Number(process.env.MAX_BROWSER_CHECKS) || 3),
  );
  let checks = 0;
  for (const plan of shortlist) {
    for (const basket of plan.baskets) {
      if (seen.has(basket.key) || checks >= limit) continue;
      seen.add(basket.key);
      checks++;
      await phase(
        jobId,
        `Checking delivery and shipping (${checks} of ${limit})`,
      );
      try {
        const s = await verify(jobId, basket, input.pincode, tiny);
        if (s) shipping.push(s);
      } catch (error) {
        errors.push(`${retailers[basket.retailer].name}: ${message(error)}`);
      }
      result = finish(input, offers, rules, shipping, errors);
      await saveResult(jobId, result);
    }
  }
  await phase(jobId, "Explaining the checked options");
  result = finish(input, offers, rules, shipping, errors);
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
