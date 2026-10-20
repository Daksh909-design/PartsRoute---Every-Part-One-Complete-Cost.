// Opt-in real collection: this consumes provider quota. A queue acknowledgement,
// a partial result or a cached comparison cannot pass this check.
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { sampleParts } from "../src/domain/catalogue";
const origin = process.env.SMOKE_ORIGIN || "http://localhost:3000";
if (!process.env.APP_ACCESS_TOKEN)
  throw new Error("Configure the private team access token.");
const start = performance.now();
const deadline = start + 7000;
let quoteId: string | null = null;
let state = "not_submitted";
let completeVerifiedPlan = false;
let reason =
  "No complete verified purchasing plan was returned within seven seconds.";
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
  const created = await request("/api/quotes", {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: JSON.stringify({
      parts: sampleParts,
      pincode: "560001",
      mode: "live",
      refresh: true,
    }),
  });
  quoteId = created.id;
  if (!quoteId || created.status === "cached")
    throw new Error("The fresh test did not create a live collection job.");
  state = created.status;
  while (performance.now() < deadline) {
    const job = await request(`/api/quotes/${quoteId}`);
    state = job.status;
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
const passed = completeVerifiedPlan && elapsedMs <= 7000;
const report = {
  checkedAt: new Date().toISOString(),
  requirement:
    "New live collection AND complete verified purchasing plan within 7000 ms",
  quoteId,
  statusAtDeadline: state,
  elapsedMs,
  completeVerifiedPlan,
  passed,
  reason: passed ? null : reason,
  savedJobContinues: ["queued", "processing"].includes(state),
};
await writeFile(
  "artifacts/live-seven-second-budget.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
