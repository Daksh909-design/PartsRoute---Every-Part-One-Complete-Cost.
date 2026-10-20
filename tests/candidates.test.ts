import { expect, it } from "vitest";
import { sampleParts } from "../src/domain/catalogue";
import { demoQuote } from "../src/domain/demo";
import { finish } from "../src/domain/quote";
import {
  verificationCandidates,
  checkedOrders,
} from "../src/server/candidates";
const input = {
  parts: sampleParts,
  pincode: "560001",
  mode: "live" as const,
  refresh: false,
};
const baseline = demoQuote({ ...input, mode: "demo" });
const unknown = baseline.offers
  .filter((offer) => offer.retailer === "robocraze")
  .map((offer) => ({ ...offer, minPacks: null, multiplePacks: null }));
it("uses provisional quantities only to select browser checks, never as a recommendation", () => {
  expect(finish(input, unknown, [], [], []).plans).toEqual([]);
  expect(verificationCandidates(input, unknown, [])).toHaveLength(1);
  expect(
    unknown.every(
      (offer) => offer.minPacks === null && offer.multiplePacks === null,
    ),
  ).toBe(true);
});
it("accepts source-supported order controls only for the exact product URL and SKU", () => {
  const basket = verificationCandidates(input, unknown, [])[0].baskets[0];
  const offer = basket.lines[0].offer;
  const raw = {
    basket_matches: true,
    order_controls: [
      {
        offerId: offer.id,
        sku: offer.sku,
        source_url: offer.url,
        min_packs: 1,
        multiple_packs: 1,
        excerpt: '<input name="quantity" min="1" step="1">',
      },
    ],
  };
  const evidence = {
    ...offer.evidence[0],
    method: "tinyfish-agent" as const,
    runId: "fixture-only-run",
  };
  const checked = checkedOrders(raw, basket, evidence);
  expect(checked).toHaveLength(1);
  expect(checked[0].evidence.method).toBe("tinyfish-agent");
  expect(
    checkedOrders(
      {
        ...raw,
        order_controls: [{ ...raw.order_controls[0], sku: "OTHER-SKU" }],
      },
      basket,
      evidence,
    ),
  ).toEqual([]);
  expect(
    checkedOrders(
      {
        ...raw,
        order_controls: [
          {
            ...raw.order_controls[0],
            source_url: "https://robocraze.com/products/unrelated",
          },
        ],
      },
      basket,
      evidence,
    ),
  ).toEqual([]);
});
it("does not reinterpret an offset HTML step as absolute pack multiples", () => {
  const basket = verificationCandidates(input, unknown, [])[0].baskets[0],
    offer = basket.lines[0].offer;
  expect(
    checkedOrders(
      {
        basket_matches: true,
        order_controls: [
          {
            offerId: offer.id,
            sku: offer.sku,
            source_url: offer.url,
            min_packs: 3,
            multiple_packs: 2,
            excerpt: 'min="3" step="2"',
          },
        ],
      },
      basket,
      offer.evidence[0],
    ),
  ).toEqual([]);
});
it("does not promote missing controls or a mismatching basket", () => {
  const basket = verificationCandidates(input, unknown, [])[0].baskets[0];
  const offer = basket.lines[0].offer;
  const control = {
    offerId: offer.id,
    sku: offer.sku,
    source_url: offer.url,
    min_packs: 1,
    multiple_packs: 1,
    excerpt: "Quantity",
  };
  expect(
    checkedOrders(
      { basket_matches: true, order_controls: [control] },
      basket,
      offer.evidence[0],
    ),
  ).toEqual([]);
  expect(
    checkedOrders(
      {
        basket_matches: false,
        order_controls: [{ ...control, excerpt: 'min="1" step="1"' }],
      },
      basket,
      offer.evidence[0],
    ),
  ).toEqual([]);
});
it("never proposes an out-of-stock or contradictory product merely to obtain controls", () => {
  expect(
    verificationCandidates(
      input,
      unknown.map((offer) => ({ ...offer, stock: "out_of_stock" })),
      [],
    ),
  ).toEqual([]);
  expect(
    verificationCandidates(
      input,
      unknown.map((offer) => ({ ...offer, match: "rejected" })),
      [],
    ),
  ).toEqual([]);
});
