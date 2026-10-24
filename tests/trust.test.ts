import { expect, it } from "vitest";
import { sampleParts } from "../src/domain/catalogue";
import { demoQuote } from "../src/domain/demo";
import { buildPlans, priceLine } from "../src/domain/optimizer";
import { matchOffer } from "../src/domain/matching";
import { groundedOffer } from "../src/server/grounding";
import { retailerProduct } from "../src/server/retailer-product";

const input = {
  parts: sampleParts,
  pincode: "560001",
  mode: "demo" as const,
  refresh: false,
};
const sample = demoQuote(input);

it.each(["price", "tax", "url", "pack size"])(
  "invalidates checked shipping after a %s change",
  (change) => {
    const offers = structuredClone(sample.offers);
    for (const offer of offers) {
      if (change === "price") offer.priceBreaks[0].packPricePaise *= 2;
      if (change === "tax") {
        offer.taxStatus = "excluded";
        offer.taxRateBps = 1800;
      }
      if (change === "url") offer.url += "?variant=different";
      if (change === "pack size" && offer.unitsPerPack !== null)
        offer.unitsPerPack *= 2;
    }
    expect(
      buildPlans(input.parts, offers, input.pincode, [], sample.shipping).every(
        (plan) => !plan.verified,
      ),
    ).toBe(true);
  },
);

const page =
  "# HC-SR04 Ultrasonic Sensor\n: Rs 75/-\nIncl. GST\nOnly 5 left in stock\nSKU: TEST001\n## Package Includes:\n1 x HC-SR04 Ultrasonic Sensor\n4 pins\nMinimum packs:1. Step:1.\n";
const evidence = {
  id: "fixture",
  observationId: "fixture",
  sourceUrl: "https://robocraze.com/products/test",
  retrievedAt: "2026-01-01T00:00:00Z",
  method: "synthetic-fixture" as const,
  runId: null,
  excerpt: "",
};

it("grounds a verbatim product title containing punctuation", () => {
  const title = "Buy HC-SR04 Sensor (2–400 cm) & Module";
  const source = page.replace("# HC-SR04 Ultrasonic Sensor", `# ${title}`);
  const extraction = retailerProduct(source, "robocraze")!;
  expect(
    groundedOffer(extraction, source, evidence, "robocraze", "part", "test")
      .title,
  ).toBe(title);
});

it.each(["Voltage: 12.5 V.", "Voltage: 5 V AC.", "Voltage: 3.3–5 V."])(
  "does not ground a 5 V requirement using %s",
  (excerpt) => {
    const extraction = retailerProduct(page, "robocraze")!;
    extraction.specs = [
      { key: "pins", value: "4", excerpt: "4 pins" },
      { key: "voltage", value: "5 V", excerpt },
    ];
    const offer = matchOffer(
      sampleParts[0],
      groundedOffer(
        extraction,
        page + excerpt,
        evidence,
        "robocraze",
        sampleParts[0].id,
        "test",
      ),
    );
    expect(offer.match).not.toBe("exact");
  },
);

it("preserves model suffixes and rejects a pack count taken from stock", () => {
  const extraction = retailerProduct(page, "robocraze")!;
  extraction.model = "HC-SR04";
  extraction.unitsPerPack = 5;
  extraction.support = [
    { field: "model", excerpt: "HC-SR04P" },
    { field: "unitsPerPack", excerpt: "Only 5 left in stock" },
  ];
  const offer = groundedOffer(
    extraction,
    page + "HC-SR04P",
    evidence,
    "robocraze",
    "part",
    "test",
  );
  expect(offer.model).toBeNull();
  expect(offer.unitsPerPack).toBeNull();
});

it("considers a published tier when buying more costs less and respects available stock", () => {
  const offer = structuredClone(sample.offers[0]);
  offer.priceBreaks = [
    { minPacks: 1, packPricePaise: 10000 },
    { minPacks: 5, packPricePaise: 5000 },
  ];
  const part = { ...sampleParts[0], quantity: 4 };
  expect(priceLine(part, offer)?.itemsPaise).toBe(25000);
  expect(priceLine(part, offer)?.purchasedUnits).toBe(5);
  offer.availablePacks = 4;
  expect(priceLine(part, offer)?.itemsPaise).toBe(40000);
});
