import { beforeEach, expect, it, vi } from "vitest";
import { QuoteInput, type PartRequest, type Offer } from "../src/domain/schema";
import { matchOffer } from "../src/domain/matching";
import { buildPlans, priceLine, basketKey } from "../src/domain/optimizer";
import { finish } from "../src/domain/quote";
const persistence = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rows: [] })),
}));
vi.mock("../src/server/db", () => ({ db: () => persistence }));
import {
  componentSearch,
  robuSearchProducts,
  productUrl,
} from "../src/server/component-search";
import { POST } from "../src/app/api/components/search/route";
it("protects search with the team token before making retailer calls", async () => {
  vi.stubEnv("APP_ACCESS_TOKEN", "synthetic-search-access-token-only");
  try {
    const response = await POST(
      new Request("http://localhost/api/components/search", {
        method: "POST",
        body: JSON.stringify({ query: "ESP32" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(persistence.query).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});
const part = (id = "synthetic-esp"): PartRequest => ({
  id,
  catalogueId: id,
  name: "Synthetic ESP fixture",
  model: "",
  quantity: 2,
  quantityUnit: "packs",
  sources: [
    {
      retailer: "robocraze",
      url: `https://robocraze.com/products/${id}`,
      variantId: 101,
    },
  ],
  requiredSpecs: [],
  equivalentAcceptable: false,
  confirmedOfferIds: [],
});
const offer = (p: PartRequest): Offer => ({
  id: p.id,
  partId: p.id,
  retailer: "robocraze",
  sku: "FIXTURE-SKU",
  variantId: 101,
  title: p.name,
  url: p.sources![0].url,
  model: null,
  specs: [],
  unitsPerPack: null,
  minPacks: 1,
  multiplePacks: 1,
  priceBreaks: [{ minPacks: 1, packPricePaise: 1000 }],
  currency: "INR",
  taxStatus: "included",
  taxRateBps: null,
  stock: "in_stock",
  availablePacks: null,
  match: "exact",
  reasons: [],
  evidence: [],
});
beforeEach(() => vi.clearAllMocks());
it("accepts more than three arbitrary selected products, without weakening source validation", () => {
  const input = {
    parts: Array.from({ length: 16 }, (_, i) => part(`fixture-${i}`)),
    pincode: "110034",
    mode: "live",
  };
  expect(QuoteInput.safeParse(input).success).toBe(true);
  expect(
    QuoteInput.safeParse({
      ...input,
      parts: [{ ...part(), sources: undefined }],
    }).success,
  ).toBe(false);
  for (const url of [
    "not a URL",
    "http://robocraze.com/products/x",
    "https://127.0.0.1/products/x",
    "https://robocraze.com/cart",
    "https://user:secret@robocraze.com/products/x",
  ])
    expect(
      QuoteInput.safeParse({
        ...input,
        parts: [{ ...part(), sources: [{ retailer: "robocraze", url }] }],
      }).success,
    ).toBe(false);
});
it("matches a selected listing and exact variant without inventing a model, but still rejects conflicts", () => {
  const p = part(),
    o = offer(p);
  expect(matchOffer(p, o).match).toBe("exact");
  expect(matchOffer(p, { ...o, variantId: 102 }).match).toBe("rejected");
  expect(
    matchOffer(p, { ...o, url: "https://robocraze.com/products/another" })
      .match,
  ).toBe("rejected");
  expect(
    matchOffer(
      { ...p, requiredSpecs: [{ key: "voltage", value: "5 V" }] },
      { ...o, specs: [{ key: "voltage", value: "12 V" }] },
    ).match,
  ).toBe("rejected");
});
it("prices requested retailer packs with unknown physical contents, but never pretends to know individual units", () => {
  const p = part(),
    o = offer(p);
  expect(priceLine(p, o)?.itemsPaise).toBe(2000);
  expect(priceLine({ ...p, quantityUnit: "units" }, o)).toBeNull();
  expect(o.unitsPerPack).toBeNull();
});
it("includes variant identity in the shipping key", () => {
  const p = part(),
    a = priceLine(p, offer(p))!;
  expect(basketKey("robocraze", "110034", [a])).not.toBe(
    basketKey("robocraze", "110034", [
      { ...a, offer: { ...a.offer, variantId: 102 } },
    ]),
  );
});
it("bounds a large comparison while retaining whole-store plans and disclosing non-exhaustive search", () => {
  const parts = Array.from({ length: 12 }, (_, i) => part(`fixture-${i}`));
  const offers = parts.flatMap((p) => [
    offer(p),
    {
      ...offer(p),
      id: `robu-${p.id}`,
      retailer: "robu" as const,
      url: `https://robu.in/product/${p.id}/`,
    },
  ]);
  const plans = buildPlans(parts, offers, "110034");
  expect(plans.length).toBeLessThanOrEqual(1024);
  expect(
    plans.every((plan) => plan.baskets.flatMap((b) => b.lines).length === 12),
  ).toBe(true);
  expect(
    new Set(
      plans
        .filter((plan) => plan.baskets.length === 1)
        .map((plan) => plan.baskets[0].retailer),
    ).size,
  ).toBe(2);
  expect(
    finish(
      { parts, pincode: "110034", mode: "live", refresh: true },
      offers,
      [],
      [],
      [],
    ).comparisonLimited,
  ).toBe(true);
});
it("keeps only observed Robu product links and never invents a search price", () => {
  const rows = robuSearchProducts(
    "[Synthetic module](https://robu.in/product/test-fixture/)\n[Another module](https://evil.invalid/product/fake/)\n[Add to cart](https://robu.in/product/test-fixture/)",
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].pricePaise).toBeNull();
  expect(() =>
    productUrl("https://evil.invalid/products/test", "robocraze"),
  ).toThrow();
});
it("reads real response fields, preserves retailer ranking despite parallel requests and persists originals", async () => {
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("suggest.json"))
      return Response.json({
        resources: {
          results: {
            products: [
              {
                title: "Synthetic slow",
                url: "/products/slow",
                price: "9.25",
                available: true,
              },
              {
                title: "Synthetic fast",
                url: "/products/fast",
                price: "12.00",
                available: true,
              },
            ],
          },
        },
      });
    const handle = url.includes("slow") ? "slow" : "fast";
    if (handle === "slow")
      await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({
      title: `Synthetic ${handle}`,
      handle,
      variants: [
        {
          id: handle === "slow" ? 101 : 102,
          title: "Fixture variant",
          sku: handle,
          price: handle === "slow" ? 925 : 1200,
          available: true,
          quantity_rule: { min: 1, max: null, increment: 1 },
        },
      ],
    });
  }) as unknown as typeof fetch;
  const result = await componentSearch(
    { query: "fixture", retailer: "robocraze" },
    "synthetic-test",
    transport,
  );
  expect(result.products.map((p) => p.title)).toEqual([
    "Synthetic slow",
    "Synthetic fast",
  ]);
  expect(result.products[0].variants[0].pricePaise).toBe(925);
  expect(result.errors).toEqual([]);
  expect(persistence.query.mock.calls).toHaveLength(1);
});
it("returns empty results with an explicit retailer failure and no fabricated fallback", async () => {
  const transport = vi.fn(
    async () => new Response("blocked", { status: 403 }),
  ) as unknown as typeof fetch;
  const result = await componentSearch(
    { query: "fictional", retailer: "robocraze" },
    "synthetic-test",
    transport,
  );
  expect(result.products).toEqual([]);
  expect(result.errors.join(" ")).toContain("403");
});
it("does not confuse a successful empty search with a retailer failure", async () => {
  const transport = vi.fn(async () =>
    Response.json({ resources: { results: { products: [] } } }),
  ) as unknown as typeof fetch;
  const result = await componentSearch(
    { query: "no-such-fixture", retailer: "robocraze" },
    "synthetic-test",
    transport,
  );
  expect(result.products).toEqual([]);
  expect(result.errors).toEqual([]);
});
