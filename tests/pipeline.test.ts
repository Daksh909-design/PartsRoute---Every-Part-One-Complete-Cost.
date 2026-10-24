import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleParts, retailers, catalogue } from "../src/domain/catalogue";
import type { AIProvider, ProductExtraction } from "../src/server/ai";
import type { Basket } from "../src/domain/schema";
import type { TinyFishClient } from "../src/server/tinyfish";
import type { StorefrontClient } from "../src/server/storefront";

// Labelled in-memory persistence test double. This does not validate PostgreSQL SQL.
const state = vi.hoisted(() => ({
  observations: new Map<string, Record<string, unknown>>(),
  operations: new Map<string, Record<string, unknown>>(),
  sequence: 0,
}));
vi.mock("../src/server/db", () => {
  const query = vi.fn(async (sql: string, args: unknown[]) => {
    const key = `${args[0]}:${args[1]}`;
    if (sql.includes("SELECT * FROM observations"))
      return { rows: [], rowCount: 0 };
    if (sql.includes("SELECT * FROM provider_operations"))
      return {
        rows: state.operations.has(key) ? [state.operations.get(key)] : [],
      };
    if (sql.includes("INSERT INTO provider_operations")) {
      if (state.operations.has(key)) return { rows: [], rowCount: 0 };
      const row = {
        status: "initiating",
        run_id: null,
        payload: JSON.parse(String(args[2])),
      };
      state.operations.set(key, row);
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes("UPDATE provider_operations")) {
      const row = state.operations.get(key)!;
      if (sql.includes("status='running'"))
        Object.assign(row, { status: "running", run_id: args[2] });
      else if (sql.includes("status='complete'"))
        Object.assign(row, {
          status: "complete",
          result: JSON.parse(String(args[2])),
        });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unhandled persistence-test query: ${sql}`);
  });
  return {
    db: () => ({ query }),
    writeForLease: (_lease: unknown, sql: string, args: unknown[]) =>
      query(sql, args),
    phase: vi.fn(async () => {}),
    usage: vi.fn(async () => {}),
    saveResult: vi.fn(async () => {}),
    observation: vi.fn(
      async (job: string, key: string) =>
        state.observations.get(`${job}:${key}`) || null,
    ),
    saveObservation: vi.fn(
      async (
        job: string,
        key: string,
        retailer: string,
        url: string,
        method: string,
        original: unknown,
        runId: string | null = null,
      ) => {
        const existing = state.observations.get(`${job}:${key}`);
        if (existing) return existing;
        const row = {
          id: `observation-${++state.sequence}`,
          source_url: url,
          method,
          run_id: runId,
          retrieved_at: new Date("2026-01-01T00:00:00Z"),
          original,
          normalized: null,
        };
        state.observations.set(`${job}:${key}`, row);
        return row;
      },
    ),
    normalizeObservation: vi.fn(async (id: string, value: unknown) => {
      for (const row of state.observations.values())
        if (row.id === id) {
          row.normalized = value;
          row.normalization_version = "grounding-v9";
        }
    }),
  };
});
import { processQuote } from "../src/server/pipeline";
import { ProviderAccessError } from "../src/server/provider-error";
import { listedEstimate } from "../src/domain/listed-estimate";

beforeEach(() => {
  state.observations.clear();
  state.operations.clear();
  state.sequence = 0;
});
describe("worker pipeline with explicitly mocked providers and persistence", () => {
  it("preserves changed supplemental originals on recovery instead of attributing new order rules to old evidence", async () => {
    let minimum = 1;
    const part = sampleParts[2];
    const tiny = {
      fetchPages: vi.fn(async (urls: string[], retailer: string) =>
        retailer === "robu"
          ? {
              results: [],
              errors: urls.map((url) => ({
                url,
                error: "Synthetic unavailable retailer",
              })),
            }
          : {
              results: urls.map((url) => ({
                url,
                final_url: url,
                text: url.includes("/products/")
                  ? `# 400 Tie Points Solderless Breadboard\nSKU: TEST-B\n: Rs 81/-\nIncl. GST\nOnly 8 left in stock\n## Package Includes:\n1 x 400-point solderless breadboard\n| Number of Points | 400 |\n${"Synthetic source. ".repeat(40)}`
                  : "Shipping Policy Page Content",
              })),
              errors: [],
            },
      ),
      startBasket: vi.fn(async () => {
        throw new Error("Synthetic unavailable browser");
      }),
    };
    const storefront = {
      product: vi.fn(async () => ({
        title: "400 Tie Points Solderless Breadboard",
        handle: "half-breadboard",
        variants: [
          {
            id: 1,
            sku: "TEST-B",
            price: 8100,
            available: true,
            quantity_rule: { min: minimum, max: null, increment: 1 },
          },
        ],
      })),
      shipping: vi.fn(async () => {
        throw new Error("Synthetic estimator unavailable");
      }),
    };
    const ai = { product: vi.fn(), policy: vi.fn(), explain: vi.fn() };
    const input = {
      parts: [part],
      pincode: "560001",
      mode: "live",
      refresh: true,
    };
    await processQuote(
      "source-recovery",
      input,
      tiny as unknown as TinyFishClient,
      ai,
      undefined,
      storefront as unknown as StorefrontClient,
    );
    minimum = 2;
    const resumed = await processQuote(
      "source-recovery",
      input,
      tiny as unknown as TinyFishClient,
      ai,
      undefined,
      storefront as unknown as StorefrontClient,
    );
    const offer = resumed.offers[0];
    expect(offer.minPacks).toBe(2);
    const rows = [...state.observations.values()].filter(
      (row) => row.method === "storefront-api",
    );
    expect(rows).toHaveLength(2);
    const source = offer.evidence.find(
      (evidence) => evidence.method === "storefront-api",
    )!;
    const original = rows.find((row) => row.id === source.observationId)!
      .original as { variants: { quantity_rule: { min: number } }[] };
    expect(original.variants[0].quantity_rule.min).toBe(2);
  });
  it("checks a complete retailer basket while the other retailer is still fetching, without model calls for complete source facts", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const part = sampleParts[2];
    const tiny = {
      fetchPages: vi.fn(async (urls: string[], retailer: string) => {
        if (retailer === "robu") {
          await waiting;
          return {
            results: [],
            errors: urls.map((url) => ({
              url,
              error: "Synthetic unavailable retailer",
            })),
          };
        }
        return {
          results: urls.map((url) => ({
            url,
            final_url: url,
            text: url.includes("/products/")
              ? `# 400 Tie Points Solderless Breadboard\n: Rs 81/-\nIncl. GST\nOnly 8 left in stock\n## Package Includes:\n1 x 400-point solderless breadboard\n| Number of Points | 400 |\n<input name="quantity" min="1" step="1">\nFor Best Price Contact on WhatsApp for bulk discounts!\n${"Synthetic fixture. ".repeat(40)}`
              : "Shipping Policy Page Content",
          })),
          errors: [],
        };
      }),
      startBasket: vi.fn(async () => {
        throw new Error("Synthetic browser unavailable");
      }),
    };
    const ai = {
      product: vi.fn(),
      productDetails: vi.fn(),
      policy: vi.fn(),
      explain: vi.fn(),
    };
    const work = processQuote(
      "early-basket-fixture",
      { parts: [part], pincode: "560001", mode: "live", refresh: true },
      tiny as unknown as TinyFishClient,
      ai,
    );
    try {
      await vi.waitFor(() => expect(tiny.startBasket).toHaveBeenCalledTimes(1));
      expect(ai.product).not.toHaveBeenCalled();
      expect(ai.productDetails).not.toHaveBeenCalled();
      expect(ai.policy).not.toHaveBeenCalled();
    } finally {
      release();
    }
    const result = await work;
    expect(result.coverage.covered).toBe(1);
    expect(result.recommendedId).toBeNull();
    expect(tiny.startBasket).toHaveBeenCalledTimes(1);
  });
  it("uses narrow detail extraction for recognised templates and preserves source prices", async () => {
    const tiny = {
      fetchPages: vi.fn(
        async (urls: string[], retailer: "robu" | "robocraze") => ({
          results: urls.map((url) => {
            const entry = catalogue.find((c) => c.urls[retailer] === url);
            return {
              url,
              final_url: url,
              text: entry
                ? `# ${entry.name}\nSKU: TEST-${entry.id}\n${retailer === "robu" ? "₹ 80.00 (Incl. GST)\nAvailability: In Stock" : ": Rs 80/-\nIncl. GST\nOnly 5 left in stock"}\n## Package Includes:\n1 x ${entry.name}\n${"Synthetic source fixture only. ".repeat(30)}`
                : "Shipping Policy Page Content",
            };
          }),
          errors: [],
        }),
      ),
    };
    const ai = {
      product: vi.fn(),
      productDetails: vi.fn(async () => ({
        model: null,
        quantityBreaks: [],
        specs: [],
        minPacks: null,
        multiplePacks: null,
        support: [],
      })),
      policy: vi.fn(),
      explain: vi.fn(),
    };
    const result = await processQuote(
      "details-fixture",
      { parts: sampleParts, pincode: "560001", mode: "live", refresh: true },
      tiny as unknown as TinyFishClient,
      ai,
    );
    expect(ai.product).not.toHaveBeenCalled();
    expect(ai.productDetails).toHaveBeenCalledTimes(6);
    expect(result.offers).toHaveLength(6);
    expect(
      result.offers.every(
        (offer) => offer.priceBreaks[0].packPricePaise === 8000,
      ),
    ).toBe(true);
    expect(result.offers.every((offer) => offer.minPacks === null)).toBe(true);
    expect(result.recommendedId).toBeNull();
  });
  it("retains explicitly published prices and conditional arithmetic when AI extraction is unavailable", async () => {
    const tiny = {
      fetchPages: vi.fn(
        async (urls: string[], retailer: "robu" | "robocraze") => ({
          results: urls.map((url) => {
            const entry = catalogue.find((c) => c.urls[retailer] === url);
            const text = entry
              ? `# ${entry.name}\nSKU: TEST-${entry.id}\n${retailer === "robu" ? "₹ 80.00 (Incl. GST)\nAvailability: In Stock" : ": Rs 80/-\nIncl. GST\nOnly 5 left in stock"}\n## Package Includes:\n1 x ${entry.name}\n${"Synthetic source fixture only. ".repeat(30)}`
              : "Shipping Policy Page Content";
            return { url, final_url: url, text };
          }),
          errors: [],
        }),
      ),
    };
    const ai = {
      product: vi.fn(async () => {
        throw new Error("Synthetic model outage");
      }),
      policy: vi.fn(async () => {
        throw new Error("Synthetic policy outage");
      }),
      explain: vi.fn(),
    };
    const result = await processQuote(
      "source-reader-fixture",
      { parts: sampleParts, pincode: "560001", mode: "live", refresh: true },
      tiny as unknown as TinyFishClient,
      ai,
    );
    expect(ai.product).toHaveBeenCalledTimes(6);
    expect(result.offers).toHaveLength(6);
    expect(
      result.offers.every((o) => o.extractionMethod === "retailer-parser"),
    ).toBe(true);
    const estimate = listedEstimate(sampleParts, result.offers)!;
    expect(estimate.itemTotalPaise).toBe(32000);
    expect(estimate.landedTotalPaise).toBeNull();
    expect(result.recommendedId).toBeNull();
    expect(result.offers.every((o) => o.minPacks === null)).toBe(true);
  });
  it("starts independent product extraction together instead of awaiting each component", async () => {
    const release: (() => void)[] = [];
    const tiny = {
      fetchPages: vi.fn(async (urls: string[]) => ({
        results: urls.map((url) => ({
          url,
          final_url: url,
          text: "Synthetic source only. ".repeat(40),
        })),
        errors: [],
      })),
    };
    const ai = {
      product: vi.fn(async () => {
        await new Promise<void>((resolve) => release.push(resolve));
        throw new Error("Synthetic controlled extraction failure");
      }),
      policy: vi.fn(async () => {
        throw new Error("Synthetic policy unavailable");
      }),
      explain: vi.fn(),
    };
    const work = processQuote(
      "parallel-fixture",
      { parts: sampleParts, pincode: "560001", mode: "live", refresh: true },
      tiny as unknown as TinyFishClient,
      ai,
    );
    try {
      await vi.waitFor(() => expect(ai.product).toHaveBeenCalledTimes(6));
      // Policy capture does not spend model calls while product work is blocked.
      expect(ai.policy).not.toHaveBeenCalled();
    } finally {
      release.splice(0).forEach((done) => done());
    }
    const result = await work;
    expect(result.recommendedId).toBeNull();
    expect(tiny.fetchPages).toHaveBeenCalledTimes(2);
  });
  it("stops collection after a fatal model account error, retaining the fetched originals", async () => {
    const tiny = {
      fetchPages: vi.fn(async (urls: string[]) => ({
        results: urls.map((url) => ({
          url,
          final_url: url,
          text: "Synthetic evidence only. ".repeat(50),
        })),
        errors: [],
      })),
    };
    const ai = {
      product: vi.fn(async () => {
        // All URLs from a returned batch must be durable before model work.
        const urls = [...state.observations.values()].map(
          (row) => row.source_url,
        );
        expect(
          urls.some((url) => String(url).includes("shipping-policy")),
        ).toBe(true);
        throw new ProviderAccessError(
          "gemini",
          "project_denied",
          "Google denied generation access to this Gemini project.",
        );
      }),
      policy: vi.fn(),
      explain: vi.fn(),
    };
    await expect(
      processQuote(
        "denied-job",
        { parts: sampleParts, pincode: "560001", mode: "live", refresh: true },
        tiny as unknown as TinyFishClient,
        ai,
      ),
    ).rejects.toThrow("Google denied generation access");
    expect(tiny.fetchPages.mock.calls.length).toBeLessThanOrEqual(2);
    // Independent policy calls may already be in flight when a product reports
    // an account failure; no second collection batch is started as a retry.
    expect(ai.policy.mock.calls.length).toBeLessThanOrEqual(2);
    expect(state.observations.size).toBeGreaterThan(0);
  });
  it("retains partial retailer errors, verifies the other basket and reuses its saved run after resumption", async () => {
    const prices: Record<string, string> = {
      hcsr04: "75.00",
      dht11: "60.00",
      breadboard400: "45.00",
    };
    const page = (url: string) => {
      const entry = catalogue.find((c) => c.urls.robocraze === url);
      if (!entry) return "No known shipping policy. ".repeat(30);
      return `${entry.name}. SKU:TEST-${entry.id}. Model:${entry.model}. Units per pack:1. Minimum packs:1. Multiple packs:1. Price INR ${prices[entry.id]}. Incl. GST. In Stock. ${entry.specs.map((s) => `${s.key}:${s.value}.`).join(" ")} ${"Synthetic test source only. ".repeat(30)}`;
    };
    let currentBasket: Basket;
    const tiny = {
      fetchPages: vi.fn(async (urls: string[], retailer: string) =>
        retailer === "robu"
          ? {
              results: [],
              errors: urls.map((url) => ({
                url,
                error: "synthetic retailer failure",
              })),
            }
          : {
              results: urls.map((url) => ({
                url,
                final_url: url,
                text: page(url),
              })),
              errors: [],
            },
      ),
      startBasket: vi.fn(async (basket: Basket) => {
        currentBasket = basket;
        return { run_id: "mock-existing-run" };
      }),
      getRun: vi.fn(async () => ({
        run_id: "mock-existing-run",
        status: "COMPLETED",
        result: {
          pincode: "560001",
          basket_matches: true,
          serviceable: true,
          items: currentBasket.lines.map((l) => ({
            offerId: l.offer.id,
            sku: l.offer.sku,
            packs: l.packs,
          })),
          shipping_inr: "40.00",
          tax_status: "included",
          tax_rate_bps: null,
          item_payable_inr: "255.00",
          total_inr: "295.00",
          method: "Synthetic test shipping",
          source_url: retailers.robocraze.cartUrl,
          excerpt: "Items INR 255.00 Shipping INR 40.00 Total INR 295.00",
          obstacle: "",
        },
      })),
    };
    const ai: AIProvider = {
      product: async (_text, url): Promise<ProductExtraction> => {
        const entry = catalogue.find((c) => c.urls.robocraze === url)!;
        return {
          title: entry.name,
          sku: `TEST-${entry.id}`,
          model: entry.model,
          specs: entry.specs.map((s) => ({
            ...s,
            excerpt: `${s.key}:${s.value}.`,
          })),
          unitsPerPack: 1,
          minPacks: 1,
          multiplePacks: 1,
          priceBreaks: [
            {
              minPacks: 1,
              packPriceInr: prices[entry.id],
              excerpt: `Price INR ${prices[entry.id]}.`,
            },
          ],
          taxStatus: "included",
          taxRateBps: null,
          stock: "in_stock",
          availablePacks: null,
          support: [
            { field: "title", excerpt: entry.name },
            { field: "sku", excerpt: `SKU:TEST-${entry.id}.` },
            {
              field: "model",
              excerpt:
                entry.model === "breadboard400"
                  ? entry.name
                  : `Model:${entry.model}.`,
            },
            { field: "unitsPerPack", excerpt: "Units per pack:1." },
            { field: "minPacks", excerpt: "Minimum packs:1." },
            { field: "multiplePacks", excerpt: "Multiple packs:1." },
            { field: "taxStatus", excerpt: "Incl. GST." },
            { field: "stock", excerpt: "In Stock." },
          ],
        };
      },
      policy: async () => ({
        summary: "No shipping amount published.",
        excerpt: "No known shipping policy.",
        thresholdInr: null,
        basis: "unknown",
        comparison: "gte",
        belowChargeInr: null,
        aboveChargeInr: null,
        taxStatus: "unknown",
        taxRateBps: null,
        applicableToPincode: null,
      }),
      explain: async (facts) => facts[0],
    };
    const input = {
      parts: sampleParts,
      pincode: "560001",
      mode: "live" as const,
      refresh: true,
    };
    const first = await processQuote(
      "mock-job",
      input,
      tiny as unknown as TinyFishClient,
      ai,
    );
    expect(first.errors.length).toBeGreaterThan(0);
    expect(first.coverage.covered).toBe(3);
    expect(first.plans[0].totalPaise).toBe(29500);
    expect(first.recommendedId).not.toBeNull();
    const fetchCount = tiny.fetchPages.mock.calls.length;
    const resumed = await processQuote(
      "mock-job",
      input,
      tiny as unknown as TinyFishClient,
      ai,
    );
    expect(resumed.plans[0].totalPaise).toBe(29500);
    expect(tiny.startBasket).toHaveBeenCalledTimes(1);
    expect(tiny.getRun).toHaveBeenCalledTimes(1);
    expect(tiny.fetchPages).toHaveBeenCalledTimes(fetchCount);
  });
});
