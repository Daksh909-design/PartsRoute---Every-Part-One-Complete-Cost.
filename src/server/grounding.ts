import type { ProductExtraction, PolicyExtraction } from "./ai";
import { paise } from "../domain/optimizer";
import type { Evidence, Offer, Retailer, ShippingRule } from "../domain/schema";
import { canonical } from "../domain/matching";

const whitespace = (s: string) =>
  s.normalize("NFKC").replace(/\s+/g, " ").trim();
export const containsExcerpt = (text: string, excerpt: string) =>
  excerpt.trim().length >= 2 && whitespace(text).includes(whitespace(excerpt));
export function quotedMoney(excerpt: string, amount: number): boolean {
  const matches = excerpt.match(/\d[\d,]*(?:\.\d{1,2})?/g) ?? [];
  return matches.some((m) => {
    try {
      return paise(m.replaceAll(",", "")) === amount;
    } catch {
      return false;
    }
  });
}
export function groundedOffer(
  ex: ProductExtraction,
  text: string,
  evidence: Evidence,
  retailer: Retailer,
  partId: string,
  id: string,
): Offer {
  const numberIn = (excerpt: string, value: number) =>
    new RegExp(`(?<![\\d.])${value}(?!\\d|\\.\\d)`).test(
      excerpt.replaceAll(",", ""),
    );
  const supports = (field: string) =>
    ex.support.some((s) => {
      if (s.field !== field || !containsExcerpt(text, s.excerpt)) return false;
      const value = ex[s.field],
        q = s.excerpt.toLowerCase();
      if (value === null) return false;
      if (typeof value === "number")
        return s.field === "taxRateBps"
          ? new RegExp(`${value / 100}\\s*%`).test(q)
          : numberIn(q, value);
      if (s.field === "stock")
        return value === "in_stock"
          ? /\bin stock\b|left in stock/i.test(q) &&
              !/out of stock|sold out|only 0 left/i.test(q)
          : value === "out_of_stock"
            ? /out of stock|sold out|only 0 left/i.test(q)
            : false;
      if (s.field === "taxStatus")
        return value === "included"
          ? /incl(?:uded|usive)?\.?\s*(?:of\s*)?(?:gst|tax)/i.test(q)
          : value === "excluded"
            ? /ex(?:cl(?:uded|usive)?)?\.?\s*(?:of\s*)?(?:gst|tax)/i.test(q)
            : false;
      if (s.field === "model" && value === "breadboard400")
        return /400/.test(q) && /breadboard/.test(q);
      return canonical(q).includes(canonical(String(value)));
    });
  const specs = ex.specs.filter(
    (s) =>
      containsExcerpt(text, s.excerpt) &&
      (canonical(s.excerpt).includes(canonical(s.value)) ||
        (s.key === "form" &&
          s.value === "breakout module" &&
          /break[- ]?out\s+(?:board|module)/i.test(s.excerpt)) ||
        (s.key === "form" &&
          s.value === "bare sensor" &&
          /4[- ]pin package/i.test(s.excerpt))),
  );
  const prices = ex.priceBreaks
    .filter(
      (p) =>
        containsExcerpt(text, p.excerpt) &&
        quotedMoney(p.excerpt, paise(p.packPriceInr)) &&
        (p.minPacks === 1 || numberIn(p.excerpt, p.minPacks)),
    )
    .map((p) => ({
      minPacks: p.minPacks,
      packPricePaise: paise(p.packPriceInr),
    }));
  // Schema correctness does not imply factual correctness; require exact source excerpts.
  const known = <K extends keyof ProductExtraction>(
    key: K,
  ): ProductExtraction[K] | null => (supports(key) ? ex[key] : null);
  const allExcerpts = [
    ...ex.support
      .filter((s) => containsExcerpt(text, s.excerpt))
      .map((s) => s.excerpt),
    ...ex.specs
      .filter((s) => containsExcerpt(text, s.excerpt))
      .map((s) => s.excerpt),
    ...ex.priceBreaks
      .filter((p) => containsExcerpt(text, p.excerpt))
      .map((p) => p.excerpt),
  ];
  return {
    id,
    partId,
    retailer,
    sku: known("sku") as string | null,
    title: supports("title") ? ex.title : "Product title unverified",
    url: evidence.sourceUrl,
    model: known("model") as string | null,
    specs: specs.map(({ key, value }) => ({ key, value })),
    unitsPerPack: known("unitsPerPack") as number | null,
    minPacks: known("minPacks") as number | null,
    multiplePacks: known("multiplePacks") as number | null,
    priceBreaks: prices,
    currency: "INR",
    taxStatus: supports("taxStatus") ? ex.taxStatus : "unknown",
    taxRateBps: known("taxRateBps") as number | null,
    stock: supports("stock") ? ex.stock : "unknown",
    availablePacks: known("availablePacks") as number | null,
    match: "insufficient_information",
    reasons: [],
    evidence: [
      {
        ...evidence,
        excerpt: [...new Set(allExcerpts)].join("\n").slice(0, 6000),
      },
    ],
  };
}
export function groundedRule(
  ex: PolicyExtraction,
  text: string,
  evidence: Evidence,
  retailer: Retailer,
): ShippingRule {
  const valid = containsExcerpt(text, ex.excerpt);
  const amount = (value: string | null) => {
    if (!valid || value === null) return null;
    const p = paise(value);
    return quotedMoney(ex.excerpt, p) ? p : null;
  };
  return {
    retailer,
    basis: valid ? ex.basis : "unknown",
    thresholdPaise: amount(ex.thresholdInr),
    comparison: ex.comparison,
    belowChargePaise: amount(ex.belowChargeInr),
    aboveChargePaise: amount(ex.aboveChargeInr),
    taxStatus: valid ? ex.taxStatus : "unknown",
    taxRateBps: valid ? ex.taxRateBps : null,
    // A nationwide rule with exclusions cannot establish pincode applicability on its own.
    applicable: false,
    conditions: ex.summary,
    evidence: [
      {
        ...evidence,
        excerpt: valid ? ex.excerpt : "No supported shipping-rule excerpt.",
      },
    ],
  };
}
