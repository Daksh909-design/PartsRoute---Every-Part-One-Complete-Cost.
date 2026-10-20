import { z } from "zod";
import type { Basket, Evidence, ShippingObservation } from "../domain/schema";
import { paise, tax } from "../domain/optimizer";
import { safeRetailerUrl } from "./urls";
import { quotedMoney } from "./grounding";
export const BasketResult = z.object({
  pincode: z.string(),
  basket_matches: z.boolean(),
  serviceable: z.boolean().nullable(),
  items: z.array(
    z.object({
      offerId: z.string(),
      sku: z.string().nullable(),
      packs: z.number().int().positive(),
    }),
  ),
  shipping_inr: z.string().nullable(),
  tax_status: z.enum(["included", "excluded", "unknown"]),
  tax_rate_bps: z.number().int().min(0).max(10000).nullable(),
  item_payable_inr: z.string().nullable(),
  total_inr: z.string().nullable(),
  method: z.string(),
  source_url: z.string(),
  excerpt: z.string(),
  obstacle: z.string(),
});
export function validateBasket(
  raw: unknown,
  basket: Basket,
  pincode: string,
  evidence: Evidence,
): ShippingObservation {
  const result = BasketResult.parse(raw);
  safeRetailerUrl(result.source_url, basket.retailer);
  const expected = basket.lines
    .map((l) => ({ offerId: l.offer.id, sku: l.offer.sku, packs: l.packs }))
    .sort((a, b) => a.offerId.localeCompare(b.offerId));
  const actual = [...result.items].sort((a, b) =>
    a.offerId.localeCompare(b.offerId),
  );
  const same =
    result.basket_matches &&
    result.pincode === pincode &&
    JSON.stringify(expected) === JSON.stringify(actual);
  const charge =
    result.shipping_inr === null ? null : paise(result.shipping_inr);
  const shipTax =
    charge === null
      ? null
      : result.tax_status === "included"
        ? 0
        : result.tax_status === "excluded" && result.tax_rate_bps !== null
          ? tax(charge, result.tax_rate_bps)
          : null;
  const subtotalMatches =
    result.item_payable_inr !== null &&
    paise(result.item_payable_inr) === basket.payableItemsPaise;
  const totalMatches =
    result.total_inr !== null &&
    basket.payableItemsPaise !== null &&
    charge !== null &&
    shipTax !== null &&
    paise(result.total_inr) === basket.payableItemsPaise + charge + shipTax;
  const cited =
    charge !== null &&
    quotedMoney(result.excerpt, charge) &&
    result.item_payable_inr !== null &&
    quotedMoney(result.excerpt, paise(result.item_payable_inr)) &&
    result.total_inr !== null &&
    quotedMoney(result.excerpt, paise(result.total_inr));
  const verified =
    same &&
    subtotalMatches &&
    totalMatches &&
    cited &&
    result.serviceable === true;
  return {
    id: evidence.id,
    retailer: basket.retailer,
    basketKey: basket.key,
    items: expected,
    pincode,
    method: result.method,
    chargePaise: verified ? charge : null,
    taxStatus: verified ? result.tax_status : "unknown",
    taxRateBps: verified ? result.tax_rate_bps : null,
    serviceable: same ? result.serviceable : null,
    status: verified ? "verified" : "unknown",
    conditions: verified
      ? result.obstacle
      : `Shipping unverified. ${result.obstacle} ${!same ? "Basket composition or pincode did not match." : !subtotalMatches || !totalMatches ? "A complete matching subtotal, shipping and landed total was not obtained." : "Supporting price excerpt or serviceability was incomplete."}`,
    observedAt: evidence.retrievedAt,
    evidence: [
      { ...evidence, sourceUrl: result.source_url, excerpt: result.excerpt },
    ],
  };
}
