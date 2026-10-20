import { expect, it } from "vitest";
import { demoQuote } from "../src/domain/demo";
import { sampleParts } from "../src/domain/catalogue";
import { listedEstimate } from "../src/domain/listed-estimate";
function offers() {
  return structuredClone(
    demoQuote({
      parts: sampleParts,
      pincode: "560001",
      mode: "demo",
      refresh: false,
    }).offers,
  );
}
it("shows conditional pack arithmetic while preserving unknown shipping and original matching constraints", () => {
  const source = offers().filter((o) => o.retailer === "robocraze");
  source.forEach((o) => {
    o.minPacks = null;
    o.multiplePacks = null;
    o.match = "insufficient_information";
  });
  const estimate = listedEstimate(sampleParts, source)!;
  expect(estimate.itemTotalPaise).toBe(25500);
  expect(estimate.complete).toBe(true);
  expect(estimate.conditional).toBe(true);
  expect(estimate.landedTotalPaise).toBeNull();
  expect(estimate.shippingPaise).toBeNull();
  expect(
    source.every(
      (o) => o.minPacks === null && o.match === "insufficient_information",
    ),
  ).toBe(true);
});
it("excludes wrong models, conflicting specifications, absent pack sizes and insufficient stock", () => {
  const source = offers();
  source
    .filter((o) => o.partId === sampleParts[0].id)
    .forEach((o) => {
      o.match = "rejected";
    });
  source
    .filter((o) => o.partId === sampleParts[1].id)
    .forEach((o) => {
      o.unitsPerPack = null;
    });
  source
    .filter((o) => o.partId === sampleParts[2].id)
    .forEach((o) => {
      o.availablePacks = 0;
    });
  expect(listedEstimate(sampleParts, source)).toBeNull();
});
it("labels partial coverage and does not price an unconfirmed equivalent", () => {
  const source = offers().filter((o) => o.retailer === "robocraze");
  source[0].model = "HC-SR05";
  source[1].stock = "out_of_stock";
  const estimate = listedEstimate(sampleParts, source)!;
  expect(estimate.complete).toBe(false);
  expect(estimate.pricedLines).toBe(1);
  expect(estimate.itemTotalPaise).toBe(4500);
});
it("applies known pack sizes, minimums, quantity multiples, tiers and explicit exclusive tax", () => {
  const source = offers().filter(
    (o) => o.retailer === "robocraze" && o.partId === sampleParts[0].id,
  );
  Object.assign(source[0], {
    unitsPerPack: 2,
    minPacks: 3,
    multiplePacks: 2,
    taxStatus: "excluded",
    taxRateBps: 500,
    priceBreaks: [
      { minPacks: 1, packPricePaise: 10000 },
      { minPacks: 4, packPricePaise: 8000 },
    ],
  });
  const estimate = listedEstimate(sampleParts, source)!;
  expect(estimate.lines[0].packs).toBe(4);
  expect(estimate.itemsPaise).toBe(32000);
  expect(estimate.addedTaxPaise).toBe(1600);
  expect(estimate.itemTotalPaise).toBe(33600);
});
