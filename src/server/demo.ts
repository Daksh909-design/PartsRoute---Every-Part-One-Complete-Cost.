import fixture from "../../fixtures/synthetic-catalogue.json";
import { catalogue } from "../domain/catalogue";
import {
  Offer,
  type QuoteInput,
  type QuoteResult,
  type ShippingObservation,
} from "../domain/schema";
import { matchOffer } from "../domain/matching";
import { buildPlans } from "../domain/optimizer";
import { finish } from "./pipeline";
export function demoQuote(input: QuoteInput): QuoteResult {
  const offers = fixture.offers
    .map((row) => {
      const entry = catalogue.find((c) => c.id === row.partId)!,
        part = input.parts.find((p) => p.catalogueId === row.partId);
      if (!part) return null;
      const offer = Offer.parse({
        id: row.id,
        partId: part.id,
        retailer: row.retailer,
        sku: row.sku,
        title: `[Synthetic] ${entry.name}`,
        url: entry.urls[row.retailer as "robu" | "robocraze"],
        model: entry.model,
        specs: entry.specs,
        unitsPerPack: 1,
        minPacks: 1,
        multiplePacks: 1,
        priceBreaks: [{ minPacks: 1, packPricePaise: row.pricePaise }],
        currency: "INR",
        taxStatus: "included",
        taxRateBps: null,
        stock: "in_stock",
        availablePacks: 500,
        match: "exact",
        reasons: [],
        evidence: [
          {
            id: row.id,
            sourceUrl: entry.urls[row.retailer as "robu" | "robocraze"],
            retrievedAt: fixture.observedAt,
            excerpt: fixture.label,
            method: "synthetic-fixture",
            runId: null,
            observationId: "synthetic-catalogue",
          },
        ],
      });
      return matchOffer(part, offer);
    })
    .filter((o): o is Offer => o !== null);
  const candidates = buildPlans(input.parts, offers, input.pincode);
  const unique = new Map(
    candidates.flatMap((p) => p.baskets).map((b) => [b.key, b]),
  );
  const shipping: ShippingObservation[] = [...unique.values()].map((b) => ({
    id: `synthetic:${b.key}`,
    retailer: b.retailer,
    basketKey: b.key,
    items: b.lines.map((l) => ({
      offerId: l.offer.id,
      sku: l.offer.sku,
      packs: l.packs,
    })),
    pincode: input.pincode,
    method: "Synthetic standard shipping",
    chargePaise: fixture.shippingPaise[b.retailer],
    taxStatus: "included",
    taxRateBps: null,
    serviceable: true,
    status: "verified",
    conditions: fixture.label,
    observedAt: fixture.observedAt,
    evidence: [b.lines[0].offer.evidence[0]],
  }));
  const result = finish({ ...input, mode: "demo" }, offers, [], shipping, []);
  result.explanation =
    "Saved-data demonstration using synthetic prices and shipping. The same calculator rounds quantities, consolidates retailer baskets and ranks their complete sample totals. These are not current offers, and no live calls were made.";
  return result;
}
