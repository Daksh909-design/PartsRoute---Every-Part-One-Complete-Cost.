import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleParts, retailers, catalogue } from "../src/domain/catalogue";
import type { AIProvider, ProductExtraction } from "../src/server/ai";
import type { Basket } from "../src/domain/schema";
import type { TinyFishClient } from "../src/server/tinyfish";

// Labelled in-memory persistence test double. This does not validate PostgreSQL SQL.
const state = vi.hoisted(() => ({
  observations: new Map<string, Record<string, unknown>>(),
  operations: new Map<string, Record<string, unknown>>(),
  sequence: 0,
}));
vi.mock("../src/server/db", () => ({
  db: () => ({
    query: vi.fn(async (sql: string, args: unknown[]) => {
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
    }),
  }),
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
        row.normalization_version = "grounding-v3";
      }
  }),
}));
import { processQuote } from "../src/server/pipeline";
import { ProviderAccessError } from "../src/server/provider-error";

beforeEach(() => {
  state.observations.clear();
  state.operations.clear();
  state.sequence = 0;
});
describe("worker pipeline with explicitly mocked providers and persistence", () => {
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
    expect(ai.policy).not.toHaveBeenCalled();
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
