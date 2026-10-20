import { createHash } from "node:crypto";
import {
  ProductExtraction,
  ProductDetails,
  PolicyExtraction,
  type AIProvider,
} from "./ai";
import { aiConfig } from "./ai-provider";
import { db } from "./db";
import { extractionContent } from "./content";

export function extractionKey(
  kind: string,
  args: unknown[],
  provider: string,
  model: string,
) {
  // Bump this version when the prompt, schema or grounding contract changes.
  return createHash("sha256")
    .update(JSON.stringify(["extraction-v4", provider, model, kind, args]))
    .digest("hex");
}
export function cachedAI(ai: AIProvider, refresh = false): AIProvider {
  const config = aiConfig();
  async function get<T>(
    key: string,
    parse: (value: unknown) => T,
    collect: () => Promise<T>,
  ): Promise<T> {
    if (!refresh) {
      const cached = await db().query(
        "SELECT extraction FROM extraction_cache WHERE cache_key=$1",
        [key],
      );
      if (cached.rowCount) return parse(cached.rows[0].extraction);
    }
    const value = parse(await collect());
    await db().query(
      "INSERT INTO extraction_cache(cache_key,extraction) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [key, JSON.stringify(value)],
    );
    return value;
  }
  return {
    provider: ai.provider,
    ...(ai.productDetails
      ? {
          productDetails(
            text: string,
            url: string,
            model: string,
            requiredKeys: string[],
          ) {
            const main = extractionContent(text);
            return get(
              extractionKey(
                "details",
                [main, url, model, requiredKeys],
                config.provider,
                config.model,
              ),
              (v) => ProductDetails.parse(v),
              () => ai.productDetails!(main, url, model, requiredKeys),
            );
          },
        }
      : {}),
    product(text, url, model) {
      const main = extractionContent(text);
      return get(
        extractionKey(
          "product",
          [main, url, model],
          config.provider,
          config.model,
        ),
        (v) => ProductExtraction.parse(v),
        () => ai.product(main, url, model),
      );
    },
    policy(text, pincode) {
      const main = extractionContent(text);
      return get(
        extractionKey("policy", [main, pincode], config.provider, config.model),
        (v) => PolicyExtraction.parse(v),
        () => ai.policy(main, pincode),
      );
    },
    explain: (facts) => ai.explain(facts),
  };
}
