import type { Offer, PartRequest } from "./schema";
import { partSources } from "./catalogue";
export function selectedIdentity(part: PartRequest, offer: Offer): boolean {
  return Boolean(
    part.sources?.length &&
    partSources(part).some((source) => {
      const selected = new URL(source.url),
        observed = new URL(offer.url);
      return (
        source.retailer === offer.retailer &&
        selected.hostname.replace(/^www\./, "") ===
          observed.hostname.replace(/^www\./, "") &&
        selected.pathname.replace(/\/$/, "") ===
          observed.pathname.replace(/\/$/, "") &&
        (source.variantId === undefined || source.variantId === offer.variantId)
      );
    }),
  );
}
export function canonical(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/volts?\b/g, "v")
    .replace(/millimet(?:er|re)s?\b/g, "mm")
    .replace(/[\s_-]+/g, "");
}
export function matchOffer(part: PartRequest, offer: Offer): Offer {
  const reasons: string[] = [];
  let missing = false,
    conflict = false;
  for (const required of part.requiredSpecs) {
    const observed = offer.specs.filter(
      (s) => canonical(s.key) === canonical(required.key),
    );
    if (!observed.length) {
      missing = true;
      reasons.push(
        `${required.key}: required ${required.value}; not published.`,
      );
    } else if (
      observed.some(
        (spec) =>
          normaliseSpec(required.key, spec.value) !==
          normaliseSpec(required.key, required.value),
      )
    ) {
      conflict = true;
      reasons.push(
        `${required.key}: required ${required.value}, observed ${observed.map((spec) => spec.value).join(" / ")}.`,
      );
    }
  }
  const modelSame = part.model
    ? offer.model !== null && canonical(offer.model) === canonical(part.model)
    : selectedIdentity(part, offer);
  let match: Offer["match"] = "exact";
  if (part.sources?.length && !selectedIdentity(part, offer)) {
    match = "rejected";
    reasons.push("This is not the selected retailer product and variant.");
  } else if (offer.orderingConflict) {
    match = "insufficient_information";
    reasons.push(
      "Published ordering or commercial details conflict across sources.",
    );
  } else if (conflict) match = "rejected";
  else if (missing || (part.model ? offer.model === null : !modelSame))
    match = "insufficient_information";
  else if (!modelSame) {
    match = part.equivalentAcceptable ? "needs_confirmation" : "rejected";
    reasons.push(`Model ${offer.model} differs from requested ${part.model}.`);
  }
  // User confirmation allows a different model only after every required specification agrees.
  if (
    match === "needs_confirmation" &&
    part.confirmedOfferIds.includes(offer.id)
  )
    reasons.push("Equivalent explicitly confirmed by user.");
  return { ...offer, partId: part.id, match, reasons };
}
export function eligible(part: PartRequest, offer: Offer): boolean {
  return (
    offer.match === "exact" ||
    (offer.match === "needs_confirmation" &&
      part.equivalentAcceptable &&
      part.confirmedOfferIds.includes(offer.id))
  );
}
function normaliseSpec(key: string, value: string) {
  if (canonical(key) === "voltage") {
    const dc = /^\+?(\d+(?:\.\d+)?)\s*v(?:olts?)?\s*(?:dc)?$/i.exec(
      value.trim(),
    );
    if (dc) return `${Number(dc[1])}v`;
  }
  return canonical(value);
}
