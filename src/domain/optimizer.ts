import type {
  Basket,
  LineCost,
  Offer,
  PartRequest,
  Plan,
  ShippingObservation,
  ShippingRule,
} from "./schema";
import { eligible } from "./matching";

export function paise(decimal: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(decimal))
    throw new Error("Expected a decimal INR amount with at most two places");
  const [whole, fraction = ""] = decimal.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 1_000_000_000)
    throw new Error("Money exceeds supported range");
  return result;
}
export function tax(amount: number, bps: number): number {
  return Number((BigInt(amount) * BigInt(bps) + 5000n) / 10000n);
}
export function priceLine(part: PartRequest, offer: Offer): LineCost | null {
  const unitsPerPack = part.quantityUnit === "packs" ? 1 : offer.unitsPerPack;
  if (
    !eligible(part, offer) ||
    offer.stock !== "in_stock" ||
    !unitsPerPack ||
    !offer.minPacks ||
    !offer.multiplePacks
  )
    return null;
  const minimum =
    Math.ceil(
      Math.max(Math.ceil(part.quantity / unitsPerPack), offer.minPacks) /
        offer.multiplePacks,
    ) * offer.multiplePacks;
  if (offer.availablePacks !== null && minimum > offer.availablePacks)
    return null;
  // A higher published tier may cost less in total, even with surplus units.
  // Between tier boundaries the total only increases, so no unit-by-unit search is needed.
  const multiple = offer.multiplePacks;
  const tiers = [...offer.priceBreaks].sort((a, b) => b.minPacks - a.minPacks);
  const candidates = [
    ...new Set([
      minimum,
      ...offer.priceBreaks.map(
        (tier) =>
          Math.ceil(Math.max(minimum, tier.minPacks) / multiple) * multiple,
      ),
    ]),
  ].filter(
    (packs) => offer.availablePacks === null || packs <= offer.availablePacks,
  );
  const totalAt = (packs: number) => {
    const price = tiers.find((tier) => packs >= tier.minPacks);
    return price ? packs * price.packPricePaise : Infinity;
  };
  const packs = candidates.sort((a, b) => totalAt(a) - totalAt(b) || a - b)[0];
  const tier = tiers.find((p) => packs >= p.minPacks);
  if (!tier) return null;
  const itemsPaise = packs * tier.packPricePaise;
  const addedTaxPaise =
    offer.taxStatus === "included"
      ? 0
      : offer.taxStatus === "excluded" && offer.taxRateBps !== null
        ? tax(itemsPaise, offer.taxRateBps)
        : null;
  const payablePaise =
    addedTaxPaise === null ? null : itemsPaise + addedTaxPaise;
  const beforeTaxPaise =
    offer.taxStatus === "excluded"
      ? itemsPaise
      : offer.taxStatus === "included" && offer.taxRateBps !== null
        ? Number(
            (BigInt(itemsPaise) * 10000n +
              BigInt(10000 + offer.taxRateBps) / 2n) /
              BigInt(10000 + offer.taxRateBps),
          )
        : null;
  return {
    offer,
    requiredUnits: part.quantity,
    packs,
    purchasedUnits: packs * unitsPerPack,
    quantityUnit: part.quantityUnit,
    itemsPaise,
    addedTaxPaise,
    beforeTaxPaise,
    payablePaise,
  };
}
export function basketKey(
  retailer: string,
  pincode: string,
  lines: LineCost[],
): string {
  return JSON.stringify([
    "basket-v3",
    retailer,
    pincode,
    [...lines]
      .sort((a, b) => a.offer.id.localeCompare(b.offer.id))
      .map((line) => ({
        id: line.offer.id,
        sku: line.offer.sku,
        variantId: line.offer.variantId ?? null,
        url: line.offer.url,
        packs: line.packs,
        unitsPerPack: line.offer.unitsPerPack,
        itemsPaise: line.itemsPaise,
        addedTaxPaise: line.addedTaxPaise,
        payablePaise: line.payablePaise,
      })),
  ]);
}
function sumKnown(values: (number | null)[]): number | null {
  return values.some((v) => v === null)
    ? null
    : (values as number[]).reduce((a, b) => a + b, 0);
}
function ruleShipping(
  basket: Omit<Basket, "shipping" | "totalPaise">,
  pincode: string,
  rule?: ShippingRule,
): ShippingObservation {
  let chargePaise: number | null = null;
  if (rule?.applicable) {
    const basis =
      rule.basis === "payable_items"
        ? basket.payableItemsPaise
        : rule.basis === "before_tax"
          ? sumKnown(basket.lines.map((l) => l.beforeTaxPaise))
          : null;
    if (basis !== null && rule.thresholdPaise !== null)
      chargePaise = (
        rule.comparison === "gte"
          ? basis >= rule.thresholdPaise
          : basis > rule.thresholdPaise
      )
        ? rule.aboveChargePaise
        : rule.belowChargePaise;
    else if (rule.thresholdPaise === null) chargePaise = rule.belowChargePaise;
  }
  return {
    id: `rule:${basket.key}`,
    retailer: basket.retailer,
    basketKey: basket.key,
    items: basket.lines.map((l) => ({
      offerId: l.offer.id,
      sku: l.offer.sku,
      packs: l.packs,
    })),
    pincode,
    method: "Documented shipping rule",
    chargePaise,
    taxStatus: rule?.taxStatus ?? "unknown",
    taxRateBps: rule?.taxRateBps ?? null,
    serviceable: null,
    status: chargePaise === null ? "unknown" : "estimated",
    conditions: rule?.conditions ?? "Shipping requires a basket check.",
    observedAt: rule?.evidence[0]?.retrievedAt ?? new Date().toISOString(),
    evidence: rule?.evidence ?? [],
  };
}
export function buildPlans(
  parts: PartRequest[],
  offers: Offer[],
  pincode: string,
  rules: ShippingRule[] = [],
  shipping: ShippingObservation[] = [],
): Plan[] {
  const choices = parts.map((part) =>
    offers
      .filter((o) => o.partId === part.id)
      .map((o) => priceLine(part, o))
      .filter((x): x is LineCost => x !== null),
  );
  if (choices.some((c) => !c.length)) return [];
  let combinations: LineCost[][] = [[]];
  for (const alternatives of choices) {
    combinations = combinations.flatMap((combo) =>
      alternatives.map((line) => [...combo, line]),
    );
    if (combinations.length > 1024) {
      // Keep the two complete-store paths as well as a bounded item-cost
      // shortlist. Large comparisons explicitly disclose this search bound.
      const itemCost = (lines: LineCost[]) =>
        lines.reduce(
          (sum, line) => sum + (line.payablePaise ?? line.itemsPaise),
          0,
        );
      const completeStore = (["robu", "robocraze"] as const).flatMap(
        (retailer) =>
          combinations
            .filter((lines) =>
              lines.every((line) => line.offer.retailer === retailer),
            )
            .sort((a, b) => itemCost(a) - itemCost(b))
            .slice(0, 1),
      );
      combinations.sort(
        (a, b) =>
          a.reduce(
            (sum, line) => sum + (line.payablePaise ?? line.itemsPaise),
            0,
          ) -
          b.reduce(
            (sum, line) => sum + (line.payablePaise ?? line.itemsPaise),
            0,
          ),
      );
      combinations = [
        ...new Set([
          ...completeStore,
          ...combinations.slice(0, 1024 - completeStore.length),
        ]),
      ];
    }
  }
  const plans = combinations.map((lines, index): Plan => {
    const unresolved: string[] = [];
    const baskets = [...new Set(lines.map((l) => l.offer.retailer))].map(
      (retailer) => {
        const subset = lines.filter((l) => l.offer.retailer === retailer),
          key = basketKey(retailer, pincode, subset);
        const base = {
          retailer,
          key,
          lines: subset,
          itemsPaise: subset.reduce((s, l) => s + l.itemsPaise, 0),
          addedTaxPaise: sumKnown(subset.map((l) => l.addedTaxPaise)),
          payableItemsPaise: sumKnown(subset.map((l) => l.payablePaise)),
        };
        const observed = [...shipping]
          .sort(
            (a, b) =>
              Number(b.status !== "unknown" || b.serviceable === false) -
                Number(a.status !== "unknown" || a.serviceable === false) ||
              Date.parse(b.observedAt) - Date.parse(a.observedAt) ||
              Number(b.status === "verified") - Number(a.status === "verified"),
          )
          .find(
            (s) =>
              s.basketKey === key &&
              s.pincode === pincode &&
              s.retailer === retailer &&
              JSON.stringify(
                [...s.items].sort((a, b) => a.offerId.localeCompare(b.offerId)),
              ) ===
                JSON.stringify(
                  subset
                    .map((l) => ({
                      offerId: l.offer.id,
                      sku: l.offer.sku,
                      packs: l.packs,
                    }))
                    .sort((a, b) => a.offerId.localeCompare(b.offerId)),
                ),
          );
        const ship =
          observed ??
          ruleShipping(
            base,
            pincode,
            rules.find((r) => r.retailer === retailer),
          );
        const shipTax =
          ship.chargePaise === null
            ? null
            : ship.taxStatus === "included"
              ? 0
              : ship.taxStatus === "excluded" && ship.taxRateBps !== null
                ? tax(ship.chargePaise, ship.taxRateBps)
                : null;
        if (base.payableItemsPaise === null)
          unresolved.push(`${retailer}: item tax information missing.`);
        if (ship.status !== "verified")
          unresolved.push(`${retailer}: shipping ${ship.status}.`);
        if (ship.serviceable !== true)
          unresolved.push(
            `${retailer}: pincode serviceability ${ship.serviceable === false ? "unavailable" : "unconfirmed"}.`,
          );
        const totalPaise =
          ship.serviceable === false
            ? null
            : sumKnown([base.payableItemsPaise, ship.chargePaise, shipTax]);
        return { ...base, shipping: ship, totalPaise };
      },
    );
    const totalPaise = sumKnown(baskets.map((b) => b.totalPaise));
    return {
      id: `plan-${index + 1}`,
      baskets,
      itemsPaise: baskets.reduce((s, b) => s + b.itemsPaise, 0),
      addedTaxPaise: sumKnown(baskets.map((b) => b.addedTaxPaise)),
      shippingPaise: sumKnown(
        baskets.map((b) =>
          b.shipping.chargePaise === null
            ? null
            : b.shipping.taxStatus === "included"
              ? b.shipping.chargePaise
              : b.shipping.taxStatus === "excluded" &&
                  b.shipping.taxRateBps !== null
                ? b.shipping.chargePaise +
                  tax(b.shipping.chargePaise, b.shipping.taxRateBps)
                : null,
        ),
      ),
      totalPaise,
      knownSubtotalPaise: baskets.reduce(
        (s, b) => s + (b.payableItemsPaise ?? b.itemsPaise),
        0,
      ),
      verified: totalPaise !== null && unresolved.length === 0,
      unresolved,
    };
  });
  return plans.sort(
    (a, b) =>
      Number(b.verified) - Number(a.verified) ||
      (a.totalPaise ?? Infinity) - (b.totalPaise ?? Infinity) ||
      a.knownSubtotalPaise - b.knownSubtotalPaise,
  );
}
