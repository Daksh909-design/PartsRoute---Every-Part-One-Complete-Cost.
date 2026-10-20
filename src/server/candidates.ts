import { z } from "zod";
import type {
  Basket,
  Evidence,
  Offer,
  QuoteInput,
  ShippingRule,
} from "../domain/schema";
import { buildPlans } from "../domain/optimizer";
import { safeRetailerUrl } from "./urls";

// These temporary quantities choose bounded browser inspections only. They are
// never displayed, saved as offers, or passed to the final recommendation.
export function verificationCandidates(
  input: QuoteInput,
  offers: Offer[],
  rules: ShippingRule[],
) {
  const provisional = offers.map((offer) => ({
    ...offer,
    minPacks: offer.minPacks ?? 1,
    multiplePacks: offer.multiplePacks ?? 1,
  }));
  return buildPlans(input.parts, provisional, input.pincode, rules)
    .filter((plan) => plan.addedTaxPaise !== null)
    .slice(0, 3);
}
const Controls = z.object({
  basket_matches: z.boolean(),
  order_controls: z
    .array(
      z.object({
        offerId: z.string(),
        sku: z.string().nullable(),
        source_url: z.string(),
        min_packs: z.number().int().positive().nullable(),
        multiple_packs: z.number().int().positive().nullable(),
        excerpt: z.string(),
      }),
    )
    .optional()
    .default([]),
});
export type CheckedOrder = {
  offerId: string;
  minPacks: number;
  multiplePacks: number;
  evidence: Evidence;
};
export function checkedOrders(
  raw: unknown,
  basket: Basket,
  evidence: Evidence,
): CheckedOrder[] {
  const result = Controls.parse(raw);
  if (!result.basket_matches) return [];
  const checked: CheckedOrder[] = [];
  for (const control of result.order_controls) {
    const line = basket.lines.find((line) => line.offer.id === control.offerId);
    if (
      !line ||
      !line.offer.sku ||
      control.sku !== line.offer.sku ||
      !control.min_packs ||
      !control.multiple_packs
    )
      continue;
    // HTML step is relative to min. The current calculator represents absolute
    // pack multiples; do not misprice controls such as min=3, step=2.
    if (control.min_packs % control.multiple_packs !== 0) continue;
    const url = safeRetailerUrl(control.source_url, basket.retailer);
    if (
      new URL(url).pathname.replace(/\/$/, "") !==
      new URL(line.offer.url).pathname.replace(/\/$/, "")
    )
      continue;
    // Require the reported rule/control attributes and their actual values.
    const minimum = new RegExp(
      `(?:min(?:imum)?(?:\\s+(?:order|packs|quantity))?|minimum[^\\d]{0,30})[\\s:=\"']*${control.min_packs}(?![\\d.])`,
      "i",
    );
    const multiple = new RegExp(
      `(?:step|multiple(?:\\s+(?:of|packs))?)[\\s:=\"']*${control.multiple_packs}(?![\\d.])`,
      "i",
    );
    if (!minimum.test(control.excerpt) || !multiple.test(control.excerpt))
      continue;
    checked.push({
      offerId: control.offerId,
      minPacks: control.min_packs,
      multiplePacks: control.multiple_packs,
      evidence: { ...evidence, sourceUrl: url, excerpt: control.excerpt },
    });
  }
  return checked;
}
