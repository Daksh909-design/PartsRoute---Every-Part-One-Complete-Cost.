// Opt-in model benchmark on previously stored TinyFish pages. This consumes AI
// quota and measures extraction ONLY; it is not a fresh quote or shipping test.
import { writeFile } from "node:fs/promises";
import { db } from "../src/server/db";
import { GeminiProvider } from "../src/server/gemini";
import { retailerProduct } from "../src/server/retailer-product";
import { catalogue } from "../src/domain/catalogue";
import { FetchResponse } from "../src/server/tinyfish";
import {
  enrichmentPages,
  Enrichment,
  ENRICHMENT_INSTRUCTIONS,
  resolveEnrichment,
  type EnrichmentInput,
} from "./experiments/compact-extraction";
import type { Usage } from "../src/server/ai";
const quoteId = process.argv[2];
if (!quoteId || !/^[a-f\d-]{36}$/.test(quoteId))
  throw new Error("Provide the ID of a saved live quote.");
const usage: Usage[] = [];
// Experimental adapter is deliberately confined to this benchmark. Live quotes
// keep the existing extractor until this alternative passes quality and latency.
class ExperimentalProvider extends GeminiProvider {
  async enrich(inputs: EnrichmentInput[]) {
    if (!inputs.length) return [];
    const pages = enrichmentPages(inputs);
    const result = await this.structured(
      Enrichment,
      "product_details",
      ENRICHMENT_INSTRUCTIONS,
      { products: pages },
    );
    return resolveEnrichment(inputs, pages, result);
  }
}
const ai = new ExperimentalProvider(async (value) => {
  usage.push(value);
});
const report: Record<string, unknown>[] = [];
try {
  const rows = (
    await db().query(
      "SELECT DISTINCT ON (retailer) retailer, original FROM observations WHERE quote_id=$1 AND method='tinyfish-fetch' ORDER BY retailer,retrieved_at DESC",
      [quoteId],
    )
  ).rows;
  await Promise.all(
    rows.map(async (row) => {
      const retailer = row.retailer as "robu" | "robocraze";
      const inputs = FetchResponse.parse(row.original).results.flatMap(
        (page) => {
          const part = catalogue.find(
            (part) => part.urls[retailer] === page.url,
          );
          const base = part && retailerProduct(page.text, retailer);
          return part && base
            ? [
                {
                  text: page.text,
                  url: page.final_url,
                  requestedModel: part.model,
                  base,
                },
              ]
            : [];
        },
      );
      const started = performance.now();
      try {
        const products = await ai.enrich(inputs);
        report.push({
          retailer,
          products: products.length,
          inputCharacters: JSON.stringify(enrichmentPages(inputs)).length,
          latencyMs: Math.round(performance.now() - started),
          status: "responded",
          extractedSpecs: products.map((p) => p.specs),
          ordering: products.map((p) => ({
            minPacks: p.minPacks,
            multiplePacks: p.multiplePacks,
          })),
        });
      } catch (error) {
        report.push({
          retailer,
          products: inputs.length,
          latencyMs: Math.round(performance.now() - started),
          status: "failed",
          error: error instanceof Error ? error.message : "Extraction failed",
        });
      }
    }),
  );
  const result = {
    checkedAt: new Date().toISOString(),
    scope:
      "AI enrichment on saved pages only; no new TinyFish collection or shipping verification",
    sourceQuoteId: quoteId,
    freshQuote: false,
    reports: report,
    usage: usage.map((u) => ({
      provider: u.provider,
      model: u.model,
      requestId: u.requestId,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
    })),
  };
  await writeFile(
    "artifacts/enrichment-benchmark.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db().end();
}
