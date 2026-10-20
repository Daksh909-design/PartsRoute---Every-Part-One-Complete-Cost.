// Explicit opt-in integration check. Never included by the ordinary fixture test suite.
import { expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { TinyFishClient } from "../src/server/tinyfish";
import { createAIProvider } from "../src/server/ai-provider";
import { groundedOffer } from "../src/server/grounding";
import { matchOffer } from "../src/domain/matching";
import { sampleParts } from "../src/domain/catalogue";
import { catalogue, retailers } from "../src/domain/catalogue";
import type { Usage } from "../src/server/ai";

it("collects product and policy responses for both configured retailers", async () => {
  await mkdir("artifacts/live-validation", { recursive: true });
  for (const retailer of ["robu", "robocraze"] as const) {
    const urls = [
      ...catalogue.map((part) => part.urls[retailer]),
      retailers[retailer].policyUrl,
    ];
    const response = await new TinyFishClient().fetchPages(
      urls,
      retailer,
      false,
    );
    await writeFile(
      `artifacts/live-validation/${retailer}-original.json`,
      JSON.stringify(
        {
          retrievedAt: new Date().toISOString(),
          requestedUrls: urls,
          response,
        },
        null,
        2,
      ),
    );
    expect(
      new Set([
        ...response.results.map((page) => page.url),
        ...response.errors.map((error) => error.url),
      ]).size,
    ).toBe(urls.length);
    console.log(
      `${retailer}: ${response.results.length} returned pages, ${response.errors.length} per-URL failures. Product matches, stock and shipping remain separately unqualified.`,
    );
  }
});

it("collects a real TinyFish product and performs real schema-constrained AI extraction", async () => {
  const sourceUrl = "https://robocraze.com/products/hc-sr-04-ultrasonic-sensor";
  const retrievedAt = new Date().toISOString();
  const usage: Usage[] = [];
  await mkdir("artifacts/live-validation", { recursive: true });
  const fetched = await new TinyFishClient().fetchPages(
    [sourceUrl],
    "robocraze",
    false,
  );
  await writeFile(
    "artifacts/live-validation/product-original.json",
    JSON.stringify({ retrievedAt, response: fetched }, null, 2),
  );
  expect(fetched.errors).toEqual([]);
  expect(fetched.results).toHaveLength(1);
  const page = fetched.results[0];
  expect(page.text.length).toBeGreaterThan(500);
  const extraction = await createAIProvider(async (item) => {
    usage.push(item);
  }).product(page.text, page.final_url, "HC-SR04");
  const offer = matchOffer(
    sampleParts[0],
    groundedOffer(
      extraction,
      page.text,
      {
        id: "direct-key-validation",
        sourceUrl: page.final_url,
        retrievedAt,
        excerpt: "",
        method: "tinyfish-fetch",
        runId: null,
        observationId: "direct-key-validation",
      },
      "robocraze",
      "hcsr04",
      "robocraze:hcsr04",
    ),
  );
  await writeFile(
    "artifacts/live-validation/product-extracted.json",
    JSON.stringify({ extraction, offer, usage }, null, 2),
  );
  expect(usage[0].provider).toMatch(/gemini|openai/);
  expect(extraction.title.length).toBeGreaterThan(0);
  expect(offer.evidence[0].sourceUrl).toBe(page.final_url);
  console.log(
    `Actual collection and extraction saved. Match: ${offer.match}; prices: ${offer.priceBreaks.length}; unknowns remain unknown.`,
  );
});
