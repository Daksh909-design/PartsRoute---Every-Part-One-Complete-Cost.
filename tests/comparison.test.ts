import { expect, it } from "vitest";
import { demoQuote } from "../src/domain/demo";
import { sampleParts } from "../src/domain/catalogue";
import { itemFirstComparison } from "../src/domain/comparison";
it("compares manually calculated item-first and complete-basket fixture totals", () => {
  const result = demoQuote({
    parts: sampleParts,
    pincode: "560001",
    mode: "demo",
    refresh: false,
  });
  const comparison = itemFirstComparison(result.plans, result.recommendedId)!;
  expect(comparison.baseline.itemsPaise).toBe(22500);
  expect(comparison.baseline.shippingPaise).toBe(12000);
  expect(comparison.baseline.totalPaise).toBe(34500);
  expect(comparison.recommendation.totalPaise).toBe(29500);
  expect(comparison.savingPaise).toBe(5000);
});
it("does not claim savings from unknown or estimated shipping", () => {
  const result = demoQuote({
    parts: sampleParts,
    pincode: "560001",
    mode: "demo",
    refresh: false,
  });
  for (const plan of result.plans)
    if (plan.baskets.length === 2) {
      plan.verified = false;
      plan.totalPaise = null;
    }
  expect(itemFirstComparison(result.plans, result.recommendedId)).toBeNull();
});
