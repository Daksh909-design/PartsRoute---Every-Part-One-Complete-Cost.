import type { Offer, PartRequest } from "./schema";
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
    const observed = offer.specs.find(
      (s) => canonical(s.key) === canonical(required.key),
    );
    if (!observed) {
      missing = true;
      reasons.push(
        `${required.key}: required ${required.value}; not published.`,
      );
    } else if (canonical(observed.value) !== canonical(required.value)) {
      conflict = true;
      reasons.push(
        `${required.key}: required ${required.value}, observed ${observed.value}.`,
      );
    }
  }
  const modelSame =
    offer.model !== null && canonical(offer.model) === canonical(part.model);
  let match: Offer["match"] = "exact";
  if (conflict) match = "rejected";
  else if (missing || offer.model === null) match = "insufficient_information";
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
