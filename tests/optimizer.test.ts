import { describe, it, expect } from "vitest";
import { sampleParts } from "../src/domain/catalogue";
import { demoQuote } from "../src/server/demo";
import { buildPlans, priceLine, paise, tax } from "../src/domain/optimizer";
import { matchOffer } from "../src/domain/matching";
import type { Offer, PartRequest, ShippingRule } from "../src/domain/schema";
import { finish } from "../src/server/pipeline";
import fixture from "../fixtures/synthetic-catalogue.json";
const input = {
  parts: sampleParts,
  pincode: "560001",
  mode: "demo" as const,
  refresh: false,
};
const baseline = demoQuote(input);
const offer = (): Offer =>
  structuredClone(baseline.offers.find((o) => o.id === "robu:hcsr04")!);
const part = (change: Partial<PartRequest> = {}): PartRequest => ({
  ...structuredClone(sampleParts[0]),
  ...change,
});
describe("money, packs and price breaks", () => {
  it("prefers a matching verified shipping observation over an earlier estimate", () => {
    const verified = baseline.shipping[0];
    const estimated = {
      ...verified,
      status: "estimated" as const,
      taxStatus: "unknown" as const,
      chargePaise: 9999,
      observedAt: new Date(
        Date.parse(verified.observedAt) - 1000,
      ).toISOString(),
    };
    const plans = buildPlans(
      input.parts,
      baseline.offers,
      input.pincode,
      [],
      [estimated, ...baseline.shipping],
    );
    const matching = plans
      .flatMap((plan) => plan.baskets)
      .find((basket) => basket.key === verified.basketKey)!;
    expect(matching.shipping.status).toBe("verified");
    expect(matching.shipping.chargePaise).toBe(verified.chargePaise);
  });
  it("invalidates older verified shipping when a newer exact-cart estimate changes the rate", () => {
    const verified = baseline.shipping[0];
    const changed = {
      ...verified,
      status: "estimated" as const,
      taxStatus: "unknown" as const,
      chargePaise: 9999,
      observedAt: new Date(
        Date.parse(verified.observedAt) + 1000,
      ).toISOString(),
    };
    const matching = buildPlans(
      input.parts,
      baseline.offers,
      input.pincode,
      [],
      [...baseline.shipping, changed],
    )
      .flatMap((plan) => plan.baskets)
      .find((basket) => basket.key === verified.basketKey)!;
    expect(matching.shipping.status).toBe("estimated");
    expect(matching.totalPaise).toBeNull();
  });
  it("rejects contradictory published specifications in either source order", () => {
    for (const pins of [
      ["4", "3"],
      ["3", "4"],
    ]) {
      const o = offer();
      o.specs = [
        { key: "voltage", value: "5 V" },
        ...pins.map((value) => ({ key: "pins", value })),
      ];
      expect(matchOffer(part(), o).match).toBe("rejected");
    }
  });
  it("converts decimal money exactly and rejects ambiguous precision", () => {
    expect(paise("12.03")).toBe(1203);
    expect(() => paise("12.031")).toThrow();
    expect(() => paise("-1")).toThrow();
  });
  it("rounds requested units up to whole packs", () => {
    const o = offer();
    o.unitsPerPack = 4;
    const p = priceLine(part({ quantity: 5 }), o)!;
    expect(p.packs).toBe(2);
    expect(p.purchasedUnits).toBe(8);
    expect(p.itemsPaise).toBe(13000);
  });
  it("respects minimum pack count and quantity multiples", () => {
    const o = offer();
    o.unitsPerPack = 2;
    o.minPacks = 5;
    o.multiplePacks = 3;
    expect(priceLine(part({ quantity: 2 }), o)!.packs).toBe(6);
  });
  it("uses the relevant pack price break after quantity rounding", () => {
    const o = offer();
    o.unitsPerPack = 2;
    o.priceBreaks = [
      { minPacks: 1, packPricePaise: 1000 },
      { minPacks: 5, packPricePaise: 800 },
    ];
    expect(priceLine(part({ quantity: 9 }), o)!.itemsPaise).toBe(4000);
    expect(priceLine(part({ quantity: 8 }), o)!.itemsPaise).toBe(4000);
  });
  it("does not default missing pack information", () => {
    const o = offer();
    o.unitsPerPack = null;
    expect(priceLine(part(), o)).toBeNull();
  });
  it("adds published exclusive tax and does not double count inclusive tax", () => {
    const o = offer();
    o.priceBreaks = [{ minPacks: 1, packPricePaise: 10000 }];
    o.taxStatus = "excluded";
    o.taxRateBps = 1200;
    expect(priceLine(part({ quantity: 1 }), o)!.payablePaise).toBe(11200);
    o.taxStatus = "included";
    expect(priceLine(part({ quantity: 1 }), o)!.payablePaise).toBe(10000);
  });
  it("keeps exclusive tax unknown without a published rate", () => {
    const o = offer();
    o.taxStatus = "excluded";
    o.taxRateBps = null;
    expect(priceLine(part(), o)!.payablePaise).toBeNull();
    expect(tax(101, 1800)).toBe(18);
  });
});
describe("matching and stock", () => {
  it.each([
    ["pins", "3"],
    ["connector", "USB-C"],
  ])(
    "rejects a contradictory %s regardless of equivalent acceptance",
    (key, value) => {
      const o = offer();
      o.specs = [{ key, value }];
      const p = part({
        requiredSpecs: [{ key, value: key === "pins" ? "4" : "Micro USB" }],
        equivalentAcceptable: true,
        confirmedOfferIds: [o.id],
      });
      expect(matchOffer(p, o).match).toBe("rejected");
    },
  );
  it("rejects a wrong model and requires explicit confirmation of a permitted equivalent", () => {
    const o = offer();
    o.model = "HC-SR05";
    expect(matchOffer(part(), o).match).toBe("rejected");
    const p = part({ equivalentAcceptable: true });
    let m = matchOffer(p, o);
    expect(m.match).toBe("needs_confirmation");
    expect(priceLine(p, m)).toBeNull();
    p.confirmedOfferIds = [o.id];
    m = matchOffer(p, o);
    expect(priceLine(p, m)).not.toBeNull();
  });
  it("does not promote an unknown required specification by user confirmation", () => {
    const o = offer();
    o.specs = [];
    const p = part({ equivalentAcceptable: true, confirmedOfferIds: [o.id] });
    expect(matchOffer(p, o).match).toBe("insufficient_information");
  });
  it("normalises documented model punctuation and voltage units", () => {
    const o = offer();
    o.model = "HC-SR-04";
    o.specs = [
      { key: "pins", value: "4" },
      { key: "voltage", value: "5 volts" },
    ];
    expect(matchOffer(part(), o).match).toBe("exact");
  });
  it("excludes out of stock, unknown stock, and insufficient stock for rounded packs", () => {
    const o = offer();
    o.stock = "out_of_stock";
    expect(priceLine(part(), o)).toBeNull();
    o.stock = "unknown";
    expect(priceLine(part(), o)).toBeNull();
    o.stock = "in_stock";
    o.availablePacks = 1;
    expect(priceLine(part(), o)).toBeNull();
  });
});
describe("complete basket calculations", () => {
  it("consolidates shipping once per retailer and matches hand calculations", () => {
    expect(baseline.plans).toHaveLength(8);
    expect(baseline.plans[0].totalPaise).toBe(
      fixture.manuallyCalculatedSample.bestPaise,
    );
    const allR = baseline.plans.find(
      (p) => p.baskets.length === 1 && p.baskets[0].retailer === "robu",
    )!;
    expect(allR.totalPaise).toBe(fixture.manuallyCalculatedSample.allRobuPaise);
    expect(allR.shippingPaise).toBe(8000);
    const cheapestSplit = baseline.plans.find(
      (p) =>
        p.baskets.some((b) =>
          b.lines.some((l) => l.offer.id === "robocraze:dht11"),
        ) &&
        p.baskets.some(
          (b) =>
            b.lines.some((l) => l.offer.id === "robu:hcsr04") &&
            b.lines.some((l) => l.offer.id === "robu:breadboard400"),
        ),
    )!;
    expect(cheapestSplit.totalPaise).toBe(
      fixture.manuallyCalculatedSample.cheapestItemSplitPaise,
    );
  });
  it.each(["gt", "gte"] as const)(
    "respects %s threshold boundaries and tax-exclusive basis",
    (comparison) => {
      const o = offer();
      o.priceBreaks = [{ minPacks: 1, packPricePaise: 100000 }];
      o.taxStatus = "excluded";
      o.taxRateBps = 1800;
      const rule: ShippingRule = {
        retailer: "robu",
        basis: "before_tax",
        thresholdPaise: 100000,
        comparison,
        belowChargePaise: 4500,
        aboveChargePaise: 0,
        taxStatus: "excluded",
        taxRateBps: 1800,
        applicable: true,
        conditions: "Synthetic test rule",
        evidence: [],
      };
      const p = buildPlans([part({ quantity: 1 })], [o], "560001", [rule])[0];
      expect(p.shippingPaise).toBe(comparison === "gte" ? 0 : 5310);
      expect(p.totalPaise).toBe(comparison === "gte" ? 118000 : 123310);
      expect(p.verified).toBe(false);
      expect(
        buildPlans([part({ quantity: 2 })], [o], "560001", [rule])[0]
          .shippingPaise,
      ).toBe(0);
    },
  );
  it("never treats unknown shipping as zero or recommends it", () => {
    const result = finish(
      { ...input, mode: "live" },
      baseline.offers,
      [],
      [],
      [],
    );
    expect(result.plans.every((p) => p.totalPaise === null)).toBe(true);
    expect(result.recommendedId).toBeNull();
  });
  it("charges shipping just below the inclusive threshold", () => {
    const o = offer();
    o.priceBreaks = [{ minPacks: 1, packPricePaise: 99999 }];
    o.taxStatus = "excluded";
    o.taxRateBps = 0;
    const rule: ShippingRule = {
      retailer: "robu",
      basis: "before_tax",
      thresholdPaise: 100000,
      comparison: "gte",
      belowChargePaise: 4500,
      aboveChargePaise: 0,
      taxStatus: "included",
      taxRateBps: null,
      applicable: true,
      conditions: "Synthetic boundary",
      evidence: [],
    };
    expect(
      buildPlans([part({ quantity: 1 })], [o], "560001", [rule])[0]
        .shippingPaise,
    ).toBe(4500);
  });
  it("preserves coverage and errors when a retailer fails", () => {
    const offers = baseline.offers.filter((o) => o.retailer === "robocraze");
    const result = finish(input, offers, [], baseline.shipping, [
      "Robu failed",
    ]);
    expect(result.coverage.covered).toBe(3);
    expect(result.errors).toEqual(["Robu failed"]);
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].totalPaise).toBe(29500);
  });
  it("returns partial coverage if a required line has no eligible offer", () => {
    const result = finish(
      input,
      baseline.offers.filter((o) => o.partId !== "dht11"),
      [],
      [],
      ["Missing sensor"],
    );
    expect(result.coverage.covered).toBe(2);
    expect(result.plans).toEqual([]);
    expect(result.recommendedId).toBeNull();
  });
  it("does not reuse shipping at a different pincode or quantity", () => {
    expect(
      buildPlans(
        sampleParts,
        baseline.offers,
        "110001",
        [],
        baseline.shipping,
      ).every((p) => p.totalPaise === null),
    ).toBe(true);
    const changed = structuredClone(sampleParts);
    changed[0].quantity = 3;
    expect(
      buildPlans(
        changed,
        baseline.offers,
        "560001",
        [],
        baseline.shipping,
      ).every((p) => p.totalPaise === null),
    ).toBe(true);
  });
});
