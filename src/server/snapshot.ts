import { partSources, sourceFor } from "../domain/catalogue";
import {
  Offer,
  ShippingObservation,
  type QuoteInput,
  type QuoteResult,
} from "../domain/schema";
import { matchOffer } from "../domain/matching";
import { finish } from "../domain/quote";
import { db, type Observation } from "./db";
import type { QueryConfig } from "pg";
import { NORMALIZATION_VERSION } from "../domain/normalization";
type BoundedQuery = QueryConfig & { query_timeout: number };

export function observationTtl() {
  return Math.min(
    3600,
    Math.max(0, Number(process.env.OBSERVATION_TTL_SECONDS ?? 900) || 0),
  );
}
export function snapshotFromObservations(
  input: QuoteInput,
  rows: Observation[],
  now = Date.now(),
): QuoteResult | null {
  const ttl = observationTtl() * 1000;
  const offers: Offer[] = [];
  const times: number[] = [];
  for (const part of input.parts) {
    const entry = { id: part.catalogueId };
    for (const retailer of ["robu", "robocraze"] as const) {
      // The newest observation wins, including a newer failure or invalidation.
      // An older success must not conceal a newer price or stock change.
      const row = rows
        .filter(
          (r) =>
            r.source_url === sourceFor(part, retailer)?.url &&
            r.method === "tinyfish-fetch",
        )
        .sort(
          (a, b) => +new Date(b.retrieved_at) - +new Date(a.retrieved_at),
        )[0];
      if (!row || row.normalization_version !== NORMALIZATION_VERSION) continue;
      const time = +new Date(row.retrieved_at);
      if (time > now || now - time >= ttl) continue;
      const parsed = Offer.safeParse(row.normalized);
      if (
        !parsed.success ||
        parsed.data.retailer !== retailer ||
        (sourceFor(part, retailer)?.variantId !== undefined &&
          sourceFor(part, retailer)?.variantId !== parsed.data.variantId) ||
        parsed.data.evidence.some((e) => e.method === "synthetic-fixture")
      )
        continue;
      offers.push(
        matchOffer(part, {
          ...parsed.data,
          id: `${retailer}:${entry.id}`,
          partId: part.id,
        }),
      );
      times.push(time);
    }
  }
  if (!offers.length) return null;
  const shipping = rows.flatMap((r) => {
    if (
      r.method !== "tinyfish-agent" ||
      r.normalization_version !== NORMALIZATION_VERSION ||
      now - +new Date(r.retrieved_at) >= ttl ||
      +new Date(r.retrieved_at) > now
    )
      return [];
    const value = r.normalized as { shipping?: unknown } | null;
    const parsed = ShippingObservation.safeParse(value?.shipping ?? value);
    return parsed.success &&
      parsed.data.pincode === input.pincode &&
      parsed.data.evidence.every((e) => e.method === "tinyfish-agent")
      ? [parsed.data]
      : [];
  });
  const result = finish(input, offers, [], shipping, []);
  result.dataStatus = {
    kind: "cached",
    oldestObservedAt: new Date(Math.min(...times)).toISOString(),
    expiresAt: new Date(Math.min(...times) + ttl).toISOString(),
    missingUrls:
      input.parts.reduce((sum, part) => sum + partSources(part).length, 0) -
      offers.length,
  };
  return result;
}
export async function cachedComparison(
  input: QuoteInput,
): Promise<QuoteResult | null> {
  if (input.refresh || observationTtl() === 0) return null;
  const urls = input.parts.flatMap((part) =>
    partSources(part).map((source) => source.url),
  );
  const productQuery: BoundedQuery = {
    text: "SELECT DISTINCT ON (source_url) * FROM observations WHERE method='tinyfish-fetch' AND source_url=ANY($1::text[]) AND retrieved_at>now()-($2 * interval '1 second') ORDER BY source_url,retrieved_at DESC,(normalization_version=$3) DESC NULLS LAST,normalized_at DESC NULLS LAST",
    values: [urls, observationTtl(), NORMALIZATION_VERSION],
    query_timeout: 1800,
  };
  const result = await db().query(productQuery);
  const shippingQuery: BoundedQuery = {
    text: "SELECT * FROM observations WHERE method='tinyfish-agent' AND normalized IS NOT NULL AND retrieved_at>now()-($1 * interval '1 second') AND COALESCE(normalized->'shipping'->>'pincode',normalized->>'pincode')=$2 ORDER BY retrieved_at DESC LIMIT 12",
    values: [observationTtl(), input.pincode],
    query_timeout: 1800,
  };
  const agent = await db().query(shippingQuery);
  return snapshotFromObservations(input, [...result.rows, ...agent.rows]);
}
