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
it("reads published specifications and quantity controls without guessing missing values", () => {
  const source =
    page +
    '\nPins: 4\nVoltage: +5V DC\n<input name="quantity" min="1" step="1">';
  const extracted = retailerProduct(source, "robocraze")!;
  const offer = groundedOffer(
    extracted,
    source,
    evidence,
    "robocraze",
    "part",
    "offer",
  );
  expect(offer.specs).toEqual([
    { key: "pins", value: "4" },
    { key: "voltage", value: "+5V DC" },
  ]);
  expect(offer.minPacks).toBe(1);
  expect(offer.multiplePacks).toBe(1);
  const offset = retailerProduct(
    source.replace('min="1" step="1"', 'min="3" step="2"'),
    "robocraze",
  )!;
  expect(offset.multiplePacks).toBeNull();
});
it("requires ordering context rather than interpreting loyalty points or package counts as minimums", () => {
  const original = retailerProduct(page, "robocraze")!;
  for (const text of [
    "Earn 1 Robu Points!",
    "1 x HC-SR04 Ultrasonic Sensor",
    "Minimum packs:10. Earn 1 point.",
  ]) {
    const parsed = {
      ...original,
      minPacks: 1,
      multiplePacks: 1,
      support: [
        ...original.support,
        { field: "minPacks" as const, excerpt: text },
        { field: "multiplePacks" as const, excerpt: text },
      ],
    };
    const offer = groundedOffer(
      parsed,
      page + text,
      evidence,
      "robocraze",
      "part",
      "offer",
    );
    expect(offer.minPacks).toBeNull();
    expect(offer.multiplePacks).toBeNull();
  }
  const text = 'Minimum packs:1. <input min="1" step="2">';
  const parsed = {
    ...original,
    minPacks: 1,
    multiplePacks: 2,
    support: [
      ...original.support,
      { field: "minPacks" as const, excerpt: text },
      { field: "multiplePacks" as const, excerpt: text },
    ],
  };
  const offer = groundedOffer(
    parsed,
    page + text,
    evidence,
    "robocraze",
    "part",
    "offer",
  );
  expect(offer.minPacks).toBe(1);
  expect(offer.multiplePacks).toBeNull();
});
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
  expect(offer.availablePacks).toBe(3);
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
it("distinguishes total breadboard connection points from the terminal-strip count", () => {
  const text =
    page.replaceAll(
      "HC-SR04 Ultrasonic Sensor",
      "400 Tie Points Solderless Breadboard",
    ) +
    "\n| Number of Points | 400 |\n| Tie Point | 300 |\n| Power Lanes | 100 Points |";
  const parsed = retailerProduct(text, "robocraze")!;
  parsed.specs.push({
    key: "tie_points",
    value: "300",
    excerpt: "Tie Point | 300 |",
  });
  const offer = groundedOffer(
    parsed,
    text,
    evidence,
    "robocraze",
    "part",
    "offer",
  );
  expect(offer.specs).toEqual([{ key: "tie_points", value: "400" }]);
});
it("retains explicit out-of-stock status and never assumes one unit per pack", () => {
  const source =
    "# DHT11 Sensor Module\nSKU: 123\n₹ 59.00 (Incl. GST)\nAvailability: Out of Stock\nDidn’t find what you are looking for?\nIn Stock\n₹ 1.00 (Incl. GST)";
  const parsed = retailerProduct(source, "robu")!;
  expect(parsed.stock).toBe("out_of_stock");
  expect(parsed.unitsPerPack).toBeNull();
  expect(parsed.priceBreaks[0].packPriceInr).toBe("59.00");
});
