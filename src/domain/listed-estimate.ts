import type { Offer, PartRequest } from "./schema";
import { canonical, selectedIdentity } from "./matching";
import { tax } from "./optimizer";

// A clearly conditional price calculation, never a purchasing plan. Missing
// specifications/ordering rules remain unresolved in the original offers.
export function listedEstimate(parts: PartRequest[], offers: Offer[]) {
  const lines = parts.flatMap((part) => {
    const options = offers.flatMap((offer) => {
      const unitsPerPack =
        part.quantityUnit === "packs" ? 1 : offer.unitsPerPack;
      if (
        offer.partId !== part.id ||
        offer.stock !== "in_stock" ||
        offer.match === "rejected" ||
        offer.orderingConflict ||
        !unitsPerPack ||
        (part.model
          ? !offer.model || canonical(offer.model) !== canonical(part.model)
          : !selectedIdentity(part, offer))
      )
        return [];
      const multiple = offer.multiplePacks ?? 1;
      const packs =
        Math.ceil(
          Math.max(
            Math.ceil(part.quantity / unitsPerPack),
            offer.minPacks ?? 1,
          ) / multiple,
        ) * multiple;
      if (offer.availablePacks !== null && packs > offer.availablePacks)
        return [];
      const tier = [...offer.priceBreaks]
        .sort((a, b) => b.minPacks - a.minPacks)
        .find((p) => p.minPacks <= packs);
      if (!tier) return [];
      const itemsPaise = packs * tier.packPricePaise;
      const addedTaxPaise =
        offer.taxStatus === "included"
          ? 0
          : offer.taxStatus === "excluded" && offer.taxRateBps !== null
            ? tax(itemsPaise, offer.taxRateBps)
            : null;
      const assumptions: string[] = [];
      if (offer.minPacks === null || offer.multiplePacks === null)
        assumptions.push(
          "Assumes no unpublished minimum or quantity multiple.",
        );
      if (offer.match !== "exact")
        assumptions.push("Required product details still need verification.");
      if (addedTaxPaise === null)
        assumptions.push("Additional item tax is unknown.");
      return [
        {
          partId: part.id,
          name: part.name,
          quantity: part.quantity,
          quantityUnit: part.quantityUnit,
          offer,
          packs,
          itemsPaise,
          addedTaxPaise,
          listedPayablePaise:
            addedTaxPaise === null ? null : itemsPaise + addedTaxPaise,
          assumptions,
        },
      ];
    });
    // Only compare known item tax totals with each other. Unknown-tax listings
    // remain visible in the listing view, rather than appearing cheapest here.
    options.sort(
      (a, b) =>
        (a.listedPayablePaise ?? Infinity) -
          (b.listedPayablePaise ?? Infinity) || a.itemsPaise - b.itemsPaise,
    );
    return options.length ? [options[0]] : [];
  });
  if (!lines.length) return null;
  return {
    lines,
    pricedLines: lines.length,
    requestedLines: parts.length,
    itemsPaise: lines.reduce((s, l) => s + l.itemsPaise, 0),
    addedTaxPaise: lines.some((l) => l.addedTaxPaise === null)
      ? null
      : lines.reduce((s, l) => s + l.addedTaxPaise!, 0),
    itemTotalPaise: lines.some((l) => l.listedPayablePaise === null)
      ? null
      : lines.reduce((s, l) => s + l.listedPayablePaise!, 0),
    complete: lines.length === parts.length,
    conditional: lines.some((l) => l.assumptions.length > 0),
    // No shipping amount or landed total is inferred from an item estimate.
    shippingPaise: null,
    landedTotalPaise: null,
  };
}
