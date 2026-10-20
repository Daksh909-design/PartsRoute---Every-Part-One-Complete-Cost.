import { expect, it } from "vitest";
import { retailerProduct } from "../src/server/retailer-product";
import { groundedOffer } from "../src/server/grounding";
const evidence = {
  id: "fixture",
  sourceUrl: "https://robocraze.com/products/hc-sr-04-ultrasonic-sensor",
  retrievedAt: "2026-01-01T00:00:00Z",
  method: "synthetic-fixture" as const,
  runId: null,
  observationId: "fixture",
  excerpt: "",
};
// Labelled synthetic excerpts representing observed templates, not live prices.
const page =
  "# Buy HC-SR04 Ultrasonic Sensor\n\n: Rs 75/-\n: Rs 75/-\n: ~~Rs 125/-~~\nSave Rs 50/-\nIncl. GST (No Hidden Charges)\nOnly 3 left in stock\nBuy it with\nRelated sensor Price ₹5\nSKU: TST001\n## Package Includes:\n* 2 x HC-SR04 Ultrasonic Sensor\n";
it("reads current price and explicit pack contents while ignoring crossed-out, savings and related prices", () => {
  const parsed = retailerProduct(page, "robocraze")!;
  const offer = groundedOffer(
    parsed,
    page,
    evidence,
    "robocraze",
    "part",
    "offer",
  );
  expect(offer.priceBreaks[0].packPricePaise).toBe(7500);
  expect(offer.unitsPerPack).toBe(2);
  expect(offer.taxStatus).toBe("included");
  expect(offer.stock).toBe("in_stock");
  expect(offer.minPacks).toBeNull();
  expect(offer.multiplePacks).toBeNull();
  expect(offer.specs).toEqual([]);
  expect(
    retailerProduct(
      page.replace("Package Includes", "What's in the Box"),
      "robocraze",
    )!.unitsPerPack,
  ).toBe(2);
});
it("refuses ambiguous displayed prices and unfamiliar templates", () => {
  expect(
    retailerProduct(page.replace(": Rs 75/-", ": Rs 80/-"), "robocraze"),
  ).toBeNull();
  expect(
    retailerProduct("A different shop layout with ₹75", "robu"),
  ).toBeNull();
  expect(
    retailerProduct(page.replace("HC-SR04", "HC-SR05"), "robocraze"),
  ).toBeNull();
});
it("retains explicit out-of-stock status and never assumes one unit per pack", () => {
  const source =
    "# DHT11 Sensor Module\nSKU: 123\n₹ 59.00 (Incl. GST)\nAvailability: Out of Stock\nDidn’t find what you are looking for?\nIn Stock\n₹ 1.00 (Incl. GST)";
  const parsed = retailerProduct(source, "robu")!;
  expect(parsed.stock).toBe("out_of_stock");
  expect(parsed.unitsPerPack).toBeNull();
  expect(parsed.priceBreaks[0].packPriceInr).toBe("59.00");
});
