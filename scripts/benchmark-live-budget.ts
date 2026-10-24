// Opt-in real collection: this consumes provider quota. A queue acknowledgement,
// a partial result or a cached comparison cannot pass this check.
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { sampleParts } from "../src/domain/catalogue";
const origin = process.env.SMOKE_ORIGIN || "http://localhost:3000";
const localSubmit = process.argv.includes("--local-submit");
if (!process.env.APP_ACCESS_TOKEN)
  throw new Error("Configure the private team access token.");
const start = performance.now();
const budgetMs = Math.min(
  10000,
  Math.max(1000, Number(process.env.LIVE_BUDGET_MS) || 10000),
);
const deadline = start + budgetMs;
let quoteId: string | null = null;
let state = "not_submitted";
let completeVerifiedPlan = false;
let firstCompleteItemsMs: number | null = null;
let firstShippingEstimateMs: number | null = null;
let progressAtDeadline: unknown = null;
let reason = `No complete verified purchasing plan was returned within ${budgetMs} ms.`;
async function request(path: string, init: RequestInit = {}) {
  const remaining = Math.floor(deadline - performance.now());
  if (remaining <= 0) throw new Error("Deadline reached");
  const response = await fetch(origin + path, {
    ...init,
    signal: AbortSignal.timeout(remaining),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.APP_ACCESS_TOKEN}`,
      ...init.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
try {
  const input = {
    parts: sampleParts,
    pincode: "560001",
    mode: "live" as const,
    refresh: true,
  };
  let created;
  if (localSubmit) {
    // Explicit operator validation requires private database credentials. Like
    // validate:live, it has its own bounded actor quota; public limits stay intact.
    // The normal worker still claims the job and public HTTP serves results.
    const { enqueue, db } = await import("../src/server/db");
    try {
      created = {
        id: await enqueue(input, randomUUID(), "live-validation-cli"),
        status: "queued",
      };
    } finally {
      await db().end();
    }
  } else
    created = await request("/api/quotes", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify(input),
    });
  quoteId = created.id;
  if (!quoteId || created.status === "cached")
    throw new Error("The fresh test did not create a live collection job.");
  state = created.status;
  while (performance.now() < deadline) {
    const job = await request(`/api/quotes/${quoteId}`);
    state = job.status;
    if (job.result) {
      const elapsed = Math.round(performance.now() - start);
      if (
        job.result.coverage.covered === job.result.coverage.requested &&
        firstCompleteItemsMs === null
      )
        firstCompleteItemsMs = elapsed;
      if (
        job.result.shipping?.some(
          (shipping: { status: string }) => shipping.status === "estimated",
        ) &&
        firstShippingEstimateMs === null
      )
        firstShippingEstimateMs = elapsed;
      progressAtDeadline = {
        coverage: job.result.coverage,
        offers: job.result.offers.length,
        shipping: job.result.shipping.map(
          (shipping: {
            status: string;
            taxStatus: string;
            chargePaise: number | null;
          }) => ({
            status: shipping.status,
            taxStatus: shipping.taxStatus,
            chargePaise: shipping.chargePaise,
          }),
        ),
      };
    }
    const plan = job.result?.plans?.find(
      (p: { id: string }) => p.id === job.result?.recommendedId,
    );
    completeVerifiedPlan =
      state === "complete" &&
      job.result?.mode === "live" &&
      job.result?.input?.refresh === true &&
      plan?.verified === true &&
      Number.isInteger(plan.totalPaise) &&
      job.result.coverage.covered === job.result.coverage.requested;
    if (
      completeVerifiedPlan ||
      ["complete", "partial", "failed"].includes(state)
    )
      break;
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.min(200, Math.max(0, deadline - performance.now())),
      ),
    );
  }
} catch (error) {
  reason =
    error instanceof Error && error.name !== "TimeoutError"
      ? error.message
      : reason;
}
const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
const passed = completeVerifiedPlan && elapsedMs <= budgetMs;
const collectionFinished = ["complete", "partial"].includes(state);
const report = {
  checkedAt: new Date().toISOString(),
  requirement: `New live collection AND complete verified purchasing plan within ${budgetMs} ms`,
  budgetMs,
  submission: localSubmit
    ? "local operator queue; public HTTP result polling"
    : "public HTTP quote endpoint",
  quoteId,
  statusAtDeadline: state,
  elapsedMs,
  completeVerifiedPlan,
  firstCompleteItemsMs,
  firstShippingEstimateMs,
  progressAtDeadline,
  collectionFinished,
  collectionWithinBudget: collectionFinished && elapsedMs <= budgetMs,
  passed,
  reason: passed ? null : reason,
  savedJobContinues: ["queued", "processing"].includes(state),
};
await writeFile("artifacts/live-budget.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
// Optional diagnostics keep following the SAME job after the strict deadline.
// Later output never changes the strict deadline verdict or starts a retry.
if (process.argv.includes("--follow") && quoteId) {
  const followDeadline = performance.now() + 240000;
  async function followRequest(path: string) {
    const response = await fetch(origin + path, {
      signal: AbortSignal.timeout(6000),
      headers: { Authorization: `Bearer ${process.env.APP_ACCESS_TOKEN}` },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }
  try {
    let job = await followRequest(`/api/quotes/${quoteId}`);
    while (
      ["queued", "processing"].includes(job.status) &&
      performance.now() < followDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      job = await followRequest(`/api/quotes/${quoteId}`);
    }
    const evidence = await followRequest(`/api/quotes/${quoteId}/evidence`);
    const followUp = {
      status: job.status,
      observedAfterMs: Math.round(performance.now() - start),
      serverDurationMs: Date.parse(job.updated_at) - Date.parse(job.created_at),
      refresh: job.input.refresh,
      offers: job.result?.offers.length ?? 0,
      coverage: job.result?.coverage ?? null,
      verifiedPlan: Boolean(job.result?.recommendedId),
      errors: job.result?.errors ?? job.errors,
      providerResponses: evidence.usage.map((u: Record<string, any>) => ({
        provider: u.provider,
        model: u.model,
        requestId: u.request_id,
        recordedAt: u.created_at,
        state: u.details?.state ?? null,
        operation: u.details?.operation ?? null,
        latencyMs: u.details?.latencyMs ?? null,
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
      })),
      fetchObservations: evidence.observations
        .filter((o: Record<string, any>) => o.method === "tinyfish-fetch")
        .map((o: Record<string, any>) => ({
          url: o.source_url,
          retrievedAt: o.retrieved_at,
          requestId: o.original?.request_id ?? null,
          results: o.original?.results?.length ?? 0,
          errors: o.original?.errors?.length ?? 0,
        })),
    };
    const fullReport = { ...report, followUp };
    await writeFile(
      "artifacts/live-budget.json",
      JSON.stringify(fullReport, null, 2),
    );
    console.log(JSON.stringify({ followUp }, null, 2));
  } catch (error) {
    console.log(
      JSON.stringify({
        followUpError:
          error instanceof Error
            ? error.message
            : "Could not inspect saved work",
      }),
    );
  }
}
if (!passed) process.exitCode = 1;
