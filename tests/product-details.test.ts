import { expect, it, vi } from "vitest";
import { ProductDetails, withProductDetails } from "../src/server/ai";
import { GeminiProvider } from "../src/server/gemini";
import { retailerProduct } from "../src/server/retailer-product";
import { groundedOffer } from "../src/server/grounding";

// Synthetic page representing the supported template; never a live price claim.
const page =
  "# HC-SR04 Ultrasonic Sensor\n: Rs 75/-\nIncl. GST\nOnly 5 left in stock\nSKU: TEST001\n## Package Includes:\n1 x HC-SR04 Ultrasonic Sensor\nVoltage: 5 V. Minimum packs:1. Step:1.";
const base = retailerProduct(page, "robocraze")!;
const details = {
  model: null,
  quantityBreaks: [],
  specs: [{ key: "voltage", value: "5 V", excerpt: "Voltage: 5 V." }],
  minPacks: null,
  multiplePacks: null,
  support: [],
};
it("preserves directly observed commercial facts while adding grounded AI specifications", () => {
  const merged = withProductDetails(
    base,
    ProductDetails.parse({
      ...details,
      priceBreaks: [{ packPriceInr: "1.00" }],
      stock: "out_of_stock",
    }),
  );
  expect(merged.priceBreaks).toEqual(base.priceBreaks);
  expect(merged.stock).toBe("in_stock");
  expect(merged.model).toBe(base.model);
  expect(merged.minPacks).toBeNull();
  const offer = groundedOffer(
    merged,
    page,
    {
      id: "fixture",
      observationId: "fixture",
      sourceUrl: "https://robocraze.com/products/test",
      retrievedAt: "2026-01-01T00:00:00Z",
      method: "synthetic-fixture",
      excerpt: "",
      runId: null,
    },
    "robocraze",
    "part",
    "offer",
  );
  expect(offer.specs).toEqual([{ key: "voltage", value: "5 V" }]);
  expect(offer.priceBreaks[0].packPricePaise).toBe(7500);
});
it("refuses to replace a known minimum with contradictory AI ordering information", () => {
  expect(() =>
    withProductDetails({ ...base, minPacks: 5 }, { ...details, minPacks: 1 }),
  ).toThrow("contradict");
});
it("uses exact excerpts in the narrow structured request without repeated base prices or line references", async () => {
  const transport = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: JSON.stringify(details) }],
          },
        ],
      }),
    ),
  );
  const provider = new GeminiProvider(async () => {}, "fixture-key", transport);
  expect(
    await provider.productDetails(
      page,
      "https://robocraze.com/products/test",
      "HC-SR04",
      ["voltage"],
    ),
  ).toEqual(details);
  const body = JSON.parse(transport.mock.calls[0][1].body);
  expect(Object.keys(body.response_format.schema.properties).sort()).toEqual([
    "minPacks",
    "model",
    "multiplePacks",
    "quantityBreaks",
    "specs",
    "support",
  ]);
  expect(body.system_instruction).toContain("EXACT supporting excerpts");
  expect(body.system_instruction).toContain("untrusted DATA");
  expect(JSON.parse(body.input).requiredKeys).toEqual(["voltage"]);
});
it("preserves model differences and published bulk-price tiers", () => {
  const merged = withProductDetails(base, {
    ...details,
    model: "HC-SR04P",
    quantityBreaks: [
      { minPacks: 5, packPriceInr: "70.00", excerpt: "5 packs: ₹70.00 each" },
    ],
    support: [{ field: "model", excerpt: "HC-SR04P" }],
  });
  expect(merged.model).toBe("HC-SR04P");
  expect(merged.priceBreaks.map((price) => price.minPacks)).toEqual([1, 5]);
  expect(merged.priceBreaks[0]).toEqual(base.priceBreaks[0]);
});
