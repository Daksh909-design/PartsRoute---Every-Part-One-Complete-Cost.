import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { snapshotFromObservations } from "../src/server/snapshot";
import { sampleParts, catalogue } from "../src/domain/catalogue";
import { demoQuote } from "../src/domain/demo";
import { extractionContent } from "../src/server/content";
import { extractionKey } from "../src/server/extraction-cache";
import { collectionIssues } from "../src/domain/issues";
import type { Observation } from "../src/server/db";
import { NORMALIZATION_VERSION } from "../src/domain/normalization";

// Synthetic observations, never used by the live collector or public cache.
const now = Date.parse("2026-10-20T14:00:00Z");
const input = {
  parts: structuredClone(sampleParts),
  pincode: "560001",
  mode: "live" as const,
  refresh: false,
};
function records(): Observation[] {
  const sample = demoQuote({ ...input, mode: "demo" });
  return sample.offers.map((offer, index) => ({
    id: `fixture-observation-${index}`,
    normalization_version: NORMALIZATION_VERSION,
    method: "tinyfish-fetch",
    run_id: null,
    retrieved_at: new Date(now - 60000),
    source_url: catalogue.find((p) => p.id === offer.partId)!.urls[
      offer.retailer
    ],
    original: { label: "Synthetic cache test" },
    normalized: {
      ...offer,
      evidence: offer.evidence.map((e) => ({
        ...e,
        method: "tinyfish-fetch",
        retrievedAt: new Date(now - 60000).toISOString(),
      })),
    },
  }));
}
beforeEach(() => vi.stubEnv("OBSERVATION_TTL_SECONDS", "900"));
afterEach(() => vi.unstubAllEnvs());

it("calculates from recent observations while keeping shipping unknown", () => {
  const result = snapshotFromObservations(input, records(), now)!;
  expect(result.mode).toBe("live");
  expect(result.offers).toHaveLength(6);
  expect(result.recommendedId).toBeNull();
  expect(result.plans.every((p) => p.totalPaise === null)).toBe(true);
  expect(result.dataStatus?.oldestObservedAt).toBe(
    new Date(now - 60000).toISOString(),
  );
});
it("expires at the exact TTL boundary and excludes future timestamps", () => {
  const old = records().map((r) => ({
    ...r,
    retrieved_at: new Date(now - 900000),
  }));
  expect(snapshotFromObservations(input, old, now)).toBeNull();
  expect(
    snapshotFromObservations(
      input,
      old.map((r) => ({ ...r, retrieved_at: new Date(now + 1) })),
      now,
    ),
  ).toBeNull();
});
it("does not resurrect an older success after a newer failed observation", () => {
  const rows = records();
  const failed = rows.map((r) => ({
    ...r,
    retrieved_at: new Date(now - 1000),
    normalized: null,
  }));
  expect(snapshotFromObservations(input, [...rows, ...failed], now)).toBeNull();
});
it("rechecks new requirements and quantities rather than reusing a previous plan", () => {
  const changed = structuredClone(input);
  changed.parts[0].requiredSpecs = [{ key: "connector", value: "USB-C" }];
  const result = snapshotFromObservations(changed, records(), now)!;
  expect(result.recommendedId).toBeNull();
  expect(
    result.offers
      .filter((o) => o.partId === changed.parts[0].id)
      .every((o) => o.match !== "exact"),
  ).toBe(true);
});
it("rejects synthetic fixture evidence in the live cache", () => {
  const rows = records();
  rows.forEach((r) => {
    (r.normalized as { evidence: { method: string }[] }).evidence.forEach(
      (e) => (e.method = "synthetic-fixture"),
    );
  });
  expect(snapshotFromObservations(input, rows, now)).toBeNull();
});
it("does not read cached observations when TTL is disabled", () => {
  vi.stubEnv("OBSERVATION_TTL_SECONDS", "0");
  expect(snapshotFromObservations(input, records(), now)).toBeNull();
});
it("does not serve normalizations made by obsolete extraction rules", () => {
  expect(
    snapshotFromObservations(
      input,
      records().map((r) => ({ ...r, normalization_version: "obsolete" })),
      now,
    ),
  ).toBeNull();
});
it("strips known navigation and related products without changing main-product excerpts", () => {
  const main =
    "# DHT11\nSKU: 123\n₹59 Incl. GST\n## Package Includes\n1 x module\n";
  expect(
    extractionContent(
      "Navigation\n" + main + "## You May Also Like\nWrong model ₹5",
    ),
  ).toBe(main);
});
it("invalidates extracted data for a different model, page or requested model", () => {
  const key = extractionKey(
    "product",
    ["page", "url", "DHT11"],
    "gemini",
    "model-a",
  );
  expect(
    extractionKey("product", ["page", "url", "DHT11"], "gemini", "model-b"),
  ).not.toBe(key);
  expect(
    extractionKey("product", ["new page", "url", "DHT11"], "gemini", "model-a"),
  ).not.toBe(key);
  expect(
    extractionKey("product", ["page", "url", "DHT22"], "gemini", "model-a"),
  ).not.toBe(key);
});
it("groups repeated outages without discarding their underlying evidence", () => {
  const issues = collectionIssues([
    "Robu: Gemini unavailable",
    "Robocraze: Gemini unavailable",
    "Robu: shipping policy placeholder",
  ]);
  expect(issues).toHaveLength(2);
  expect(issues[0].details).toHaveLength(2);
});
