import { writeFile } from "node:fs/promises";
import { sampleParts } from "../src/domain/catalogue";
const origin = process.env.SMOKE_ORIGIN || "http://localhost:3000";
if (!process.env.APP_ACCESS_TOKEN)
  throw new Error("Set the private team token before benchmarking.");
const times: number[] = [];
let coverage;
for (let run = 0; run < 10; run++) {
  const start = performance.now();
  const response = await fetch(`${origin}/api/comparisons`, {
    method: "POST",
    signal: AbortSignal.timeout(6000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.APP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      parts: sampleParts,
      pincode: "560001",
      mode: "live",
      refresh: false,
    }),
  });
  const body = await response.json();
  if (!response.ok || body.status !== "cached" || body.result?.mode !== "live")
    throw new Error(
      "No recent live cache to benchmark. Refresh the catalogue once; this script never creates jobs or provider calls.",
    );
  times.push(Math.round((performance.now() - start) * 100) / 100);
  coverage = body.result.coverage;
}
const result = {
  checkedAt: new Date().toISOString(),
  scope:
    "Local HTTP cached comparison only; excludes fresh collection and browser verification",
  samplesMs: times,
  maxMs: Math.max(...times),
  medianMs: [...times].sort((a, b) => a - b)[5],
  allUnderSevenSeconds: times.every((n) => n < 7000),
  coverage,
};
await writeFile("artifacts/http-latency.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.allUnderSevenSeconds) process.exitCode = 1;
