import type {
  QuoteInput,
  Offer,
  ShippingRule,
  ShippingObservation,
  QuoteResult,
} from "./schema";
import { buildPlans, priceLine } from "./optimizer";

export function finish(
  input: QuoteInput,
  offers: Offer[],
  rules: ShippingRule[],
  shipping: ShippingObservation[],
  errors: string[],
): QuoteResult {
  const plans = buildPlans(input.parts, offers, input.pincode, rules, shipping);
  const recommended = plans.find((p) => p.verified);
  const comparisonLimited =
    input.parts.reduce(
      (count, part) =>
        count *
        offers.filter(
          (offer) => offer.partId === part.id && priceLine(part, offer),
        ).length,
      1,
    ) > 1024;
  return {
    mode: input.mode,
    input,
    offers,
    shipping,
    plans,
    comparisonLimited,
    recommendedId: recommended?.id ?? null,
    coverage: {
      requested: input.parts.length,
      covered: input.parts.filter((p) =>
        offers.some((o) => o.partId === p.id && priceLine(p, o) !== null),
      ).length,
    },
    errors,
    explanation: recommended
      ? `Best verified plan among checked options. This plan includes all ${input.parts.length} component lines, with shipping checked for each retailer basket.`
      : "No fully verified purchasing plan is available. Inspect the product gaps and unverified shipping below.",
    explanationSource: "deterministic",
    generatedAt: new Date().toISOString(),
  };
}
