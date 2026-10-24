import type { Plan } from "./schema";
import { tax } from "./optimizer";

// A display estimate only: it must never affect verification or plan ranking.
export function itemsAndShippingEstimate(plan: Plan) {
  if (!plan.baskets.length) return null;
  let amountPaise = 0;
  let shippingTaxUnknown = false;
  for (const basket of plan.baskets) {
    const shipping = basket.shipping;
    if (
      basket.payableItemsPaise === null ||
      shipping.chargePaise === null ||
      shipping.serviceable !== true ||
      shipping.status === "unknown"
    )
      return null;
    amountPaise += basket.payableItemsPaise + shipping.chargePaise;
    if (shipping.taxStatus === "excluded" && shipping.taxRateBps !== null)
      amountPaise += tax(shipping.chargePaise, shipping.taxRateBps);
    else if (shipping.taxStatus !== "included") shippingTaxUnknown = true;
  }
  return { amountPaise, shippingTaxUnknown };
}

// Among complete assignments, choose the one with the smallest known payable
// item cost before shipping. This is the naive item-first strategy, not a new
// recommendation. A comparison needs both final totals verified.
export function itemFirstComparison(
  plans: Plan[],
  recommendedId: string | null,
) {
  const recommendation = plans.find((plan) => plan.id === recommendedId);
  const baseline = [...plans]
    .filter((plan) => plan.addedTaxPaise !== null)
    .sort(
      (a, b) =>
        a.itemsPaise + a.addedTaxPaise! - (b.itemsPaise + b.addedTaxPaise!) ||
        (a.totalPaise ?? Number.MAX_SAFE_INTEGER) -
          (b.totalPaise ?? Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id),
    )[0];
  if (
    !baseline?.verified ||
    baseline.totalPaise === null ||
    !recommendation?.verified ||
    recommendation.totalPaise === null
  )
    return null;
  const savingPaise = baseline.totalPaise - recommendation.totalPaise;
  if (savingPaise <= 0) return null;
  return { baseline, recommendation, savingPaise };
}
