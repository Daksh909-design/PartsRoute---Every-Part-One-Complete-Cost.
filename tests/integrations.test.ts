import { describe, it, expect, vi } from "vitest";
import { TinyFishClient } from "../src/server/tinyfish";
import { safeRetailerUrl } from "../src/server/urls";
import { validateBasket } from "../src/server/shipping";
import { groundedOffer } from "../src/server/grounding";
import { sampleParts } from "../src/domain/catalogue";
import { demoQuote } from "../src/server/demo";
import { QuoteInput } from "../src/domain/schema";
import type { ProductExtraction } from "../src/server/ai";
const baseline = demoQuote({
  parts: sampleParts,
  pincode: "560001",
  mode: "demo",
  refresh: false,
});
describe("TinyFish HTTP contract with labelled mocked responses", () => {
  it("uses Fetch centrally and returns per-URL errors despite HTTP 200", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [],
          errors: [
            { url: "https://robu.in/product/test/", error: "bot_blocked" },
          ],
        }),
      ),
    );
    const result = await new TinyFishClient(
      "test-secret",
      transport,
    ).fetchPages(["https://robu.in/product/test/"], "robu", true);
    expect(result.errors[0].error).toBe("bot_blocked");
    expect(transport.mock.calls[0][0]).toBe("https://api.fetch.tinyfish.ai");
    const init = transport.mock.calls[0][1]!;
    expect(JSON.parse(init.body as string).ttl).toBe(0);
    expect(init.headers).toMatchObject({ "X-API-Key": "test-secret" });
  });
  it("rejects off-domain redirects, lookalike hosts, credentials and local addresses", async () => {
    for (const url of [
      "http://robu.in/",
      "https://robu.in.evil.test/",
      "https://user:pass@robu.in/",
      "https://localhost/",
      "https://robu.in:4433/",
    ])
      expect(() => safeRetailerUrl(url, "robu")).toThrow();
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              url: "https://robu.in/",
              final_url: "https://evil.test/",
              text: "bad",
            },
          ],
          errors: [],
        }),
      ),
    );
    await expect(
      new TinyFishClient("key", transport).fetchPages(
        ["https://robu.in/"],
        "robu",
        false,
      ),
    ).rejects.toThrow("redirect");
  });
  it("does not retry ambiguous Agent creation; uses current async endpoint", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("Connection lost"));
    await expect(
      new TinyFishClient("key", transport).startBasket(
        baseline.plans[0].baskets[0],
        "560001",
      ),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe(
      "https://agent.tinyfish.ai/v1/automation/run-async",
    );
    const body = JSON.parse(transport.mock.calls[0][1]!.body as string);
    expect(body.output_schema).toBeDefined();
    expect(body.agent_config).toEqual({ max_duration_seconds: 180 });
    expect(body.use_profile).toBe(false);
    expect(body.use_vault).toBe(false);
    expect(body.goal).toContain(
      "Require an initially empty isolated guest cart",
    );
    expect(body.goal).toContain("Never clear or remove existing cart contents");
  });
  it("recovers an existing run with the documented status endpoint", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          run_id: "existing",
          status: "COMPLETED",
          result: { status: "failure" },
        }),
      ),
    );
    const result = await new TinyFishClient("key", transport).getRun(
      "existing",
    );
    expect(result.status).toBe("COMPLETED");
    expect(transport.mock.calls[0][0]).toBe(
      "https://agent.tinyfish.ai/v1/runs/existing",
    );
  });
  it("reports an Agent rejection returned with HTTP 200 without starting another run", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          run_id: null,
          error: {
            code: "INSUFFICIENT_CREDITS",
            message: "Account requires credits",
          },
        }),
      ),
    );
    await expect(
      new TinyFishClient("test-key", transport).startBasket(
        baseline.plans[0].baskets[0],
        "560001",
      ),
    ).rejects.toThrow("INSUFFICIENT_CREDITS");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("reports omitted Fetch URLs as failures rather than an empty success", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [], errors: [] })),
      );
    const result = await new TinyFishClient("test-key", transport).fetchPages(
      ["https://robu.in/product/test/"],
      "robu",
      true,
    );
    expect(result.errors).toEqual([
      { url: "https://robu.in/product/test/", error: "missing_result" },
    ]);
  });
});
describe("basket output validation", () => {
  const b = baseline.plans[0].baskets[0],
    e = b.lines[0].offer.evidence[0];
  const raw = () => ({
    pincode: "560001",
    basket_matches: true,
    serviceable: true,
    items: b.lines.map((l) => ({
      offerId: l.offer.id,
      sku: l.offer.sku,
      packs: l.packs,
    })),
    shipping_inr: "40.00",
    tax_status: "included",
    tax_rate_bps: null,
    item_payable_inr: "255.00",
    total_inr: "295.00",
    method: "Standard",
    source_url: "https://robocraze.com/cart",
    excerpt: "Items ₹255.00; shipping ₹40.00; total ₹295.00.",
    obstacle: "",
  });
  it("accepts a matching complete basket with observed shipping and total", () => {
    expect(validateBasket(raw(), b, "560001", e).status).toBe("verified");
  });
  it("keeps a serviceability-only result unknown", () => {
    const r = raw();
    r.shipping_inr = null as unknown as string;
    r.total_inr = null as unknown as string;
    expect(validateBasket(r, b, "560001", e).chargePaise).toBeNull();
  });
  it("rejects changed quantities, prices, pincode or unsupported totals", () => {
    let r = raw();
    r.items[0].packs++;
    expect(validateBasket(r, b, "560001", e).status).toBe("unknown");
    r = raw();
    r.total_inr = "294.00";
    expect(validateBasket(r, b, "560001", e).status).toBe("unknown");
    r = raw();
    r.item_payable_inr = "250.00";
    expect(validateBasket(r, b, "560001", e).status).toBe("unknown");
    r = raw();
    r.pincode = "110001";
    expect(validateBasket(r, b, "560001", e).status).toBe("unknown");
  });
});
describe("extraction grounding and input bounds", () => {
  it("strips invented numeric facts, prices, stock and unsupported specifications", () => {
    const text =
      "HC-SR04. Price ₹75.00 Incl. GST. 1 x sensor. Out of Stock. 5V.";
    const ex: ProductExtraction = {
      title: "HC-SR04",
      sku: null,
      model: "HC-SR04",
      specs: [
        { key: "voltage", value: "5 V", excerpt: "5V." },
        { key: "pins", value: "4", excerpt: "1 x sensor." },
      ],
      unitsPerPack: 999,
      minPacks: 1,
      multiplePacks: 1,
      priceBreaks: [
        { minPacks: 1, packPriceInr: "1.00", excerpt: "Price ₹75.00" },
      ],
      taxStatus: "included",
      taxRateBps: 1800,
      stock: "in_stock",
      availablePacks: 100,
      support: [
        { field: "title", excerpt: "HC-SR04." },
        { field: "model", excerpt: "HC-SR04." },
        { field: "unitsPerPack", excerpt: "1 x sensor." },
        { field: "stock", excerpt: "Out of Stock." },
      ],
    };
    const offer = groundedOffer(
      ex,
      text,
      baseline.offers[0].evidence[0],
      "robu",
      "hcsr04",
      "test",
    );
    expect(offer.unitsPerPack).toBeNull();
    expect(offer.stock).toBe("unknown");
    expect(offer.priceBreaks).toEqual([]);
    expect(offer.specs).toEqual([{ key: "voltage", value: "5 V" }]);
    expect(offer.taxRateBps).toBeNull();
  });
  it("accepts one to three unique catalogue lines and requires a valid pincode", () => {
    expect(
      QuoteInput.safeParse({
        parts: sampleParts,
        pincode: "056001",
        mode: "live",
      }).success,
    ).toBe(false);
    expect(
      QuoteInput.safeParse({
        parts: [sampleParts[0]],
        pincode: "560001",
        mode: "live",
      }).success,
    ).toBe(true);
    expect(
      QuoteInput.safeParse({
        parts: [sampleParts[0], sampleParts[0], sampleParts[2]],
        pincode: "560001",
        mode: "live",
      }).success,
    ).toBe(false);
  });
});
