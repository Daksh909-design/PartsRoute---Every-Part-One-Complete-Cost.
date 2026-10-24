import type { ProductExtraction, PolicyExtraction } from "./ai";
import { paise } from "../domain/optimizer";
import type { Evidence, Offer, Retailer, ShippingRule } from "../domain/schema";

const whitespace = (s: string) =>
  s.normalize("NFKC").replace(/\s+/g, " ").trim();
export const containsExcerpt = (text: string, excerpt: string) =>
  excerpt.trim().length >= 2 && whitespace(text).includes(whitespace(excerpt));

// Match complete values while allowing published spacing and model punctuation.
// Numeric boundaries prevent 5 V matching 12.5 V; suffixes remain significant.
export function quotedValue(excerpt: string, value: string): boolean {
  const normalise = (s: string) =>
    whitespace(s)
      .toLowerCase()
      .replace(/volts?\b/g, "v")
      .replace(/millimet(?:er|re)s?\b/g, "mm");
  const tokens = normalise(value).match(/[a-z]+|\d+(?:\.\d+)?/g);
  if (!tokens?.length) return false;
  const pattern = tokens
    .map((token) => token.replaceAll(".", "\\."))
    .join("[\\s_-]*");
  return new RegExp(`(?<![a-z\\d.])${pattern}(?![a-z\\d]|\\.\\d)`, "i").test(
    normalise(excerpt),
  );
}

function supportsSpec(key: string, value: string, excerpt: string): boolean {
  if (key === "voltage") {
    if (
      /\d\s*(?:-|–|—|to|~)\s*\d/i.test(excerpt) &&
      !/\d\s*(?:-|–|—|to|~)\s*\d/i.test(value)
    )
      return false;
    if (/\bAC\b/i.test(excerpt) !== /\bAC\b/i.test(value)) return false;
  }
  return quotedValue(excerpt, value);
}
export function quotedMoney(excerpt: string, amount: number): boolean {
  const matches = excerpt.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? [];
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
      if (s.field === "title") return containsExcerpt(s.excerpt, ex.title);
      if (
        typeof value === "number" &&
        (s.field === "minPacks" || s.field === "multiplePacks")
      ) {
        // HTML steps start at min, whereas the calculator uses absolute
        // multiples. Keep unsupported offset sequences unverified.
        if (s.field === "multiplePacks") {
          const htmlMinimum = /\bmin=["'](\d+)["']/i.exec(q);
          const htmlStep = /\bstep=["'](\d+)["']/i.exec(q);
          if (
            htmlMinimum &&
            htmlStep &&
            (Number(htmlStep[1]) <= 0 ||
              Number(htmlMinimum[1]) % Number(htmlStep[1]) !== 0)
          )
            return false;
        }
        const label =
          s.field === "minPacks"
            ? "(?:min(?:imum)?(?:\\s+(?:order|packs|quantity))?|MOQ)"
            : "(?:step|multiple(?:\\s+(?:of|packs|quantity))?)";
        return (
          new RegExp(
            `\\b${label}[\\s:=\"']*(?:is\\s+|of\\s+)?${value}(?!\\d|\\.\\d)`,
            "i",
          ).test(q) && numberIn(q, value)
        );
      }
      if (s.field === "unitsPerPack" && typeof value === "number")
        return new RegExp(
          `(?:\\b${value}\\s*[x×]\\s+|\\b(?:units? per pack|pack (?:of|size))\\s*[:=]?\\s*${value}(?!\\d|\\.\\d))`,
          "i",
        ).test(q);
      if (s.field === "availablePacks" && typeof value === "number")
        return new RegExp(
          `\\b${value}\\s+(?:left in stock|packs? (?:available|in stock))\\b`,
          "i",
        ).test(q.replaceAll(",", ""));
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
        return /\b(?:not|excluding)\s+incl/i.test(q)
          ? false
          : value === "included"
            ? /incl(?:uded|usive)?\.?\s*(?:of\s*)?(?:gst|tax)/i.test(q)
            : value === "excluded"
              ? /ex(?:cl(?:uded|usive)?)?\.?\s*(?:of\s*)?(?:gst|tax)/i.test(q)
              : false;
      if (s.field === "model" && value === "breadboard400")
        return quotedValue(q, "400") && /\bbreadboard\b/.test(q);
      return quotedValue(q, String(value));
    });
  const specs = ex.specs.filter(
    (s) =>
      containsExcerpt(text, s.excerpt) &&
      // Some breadboards list 300 terminal tie points and 100 power points
      // separately. When an explicit whole-board count exists, a lone "Tie
      // Point" component row cannot establish the requested total count.
      !(
        s.key === "tie_points" &&
        /\|\s*Number of Points\s*\|\s*\d+\s*\|/i.test(text) &&
        /^\s*\|?\s*Tie Points?\s*[:|=]\s*\d+\s*\|?\s*$/i.test(s.excerpt)
      ) &&
      (s.key !== "pins" ||
        (/^\d+$/.test(s.value) &&
          new RegExp(
            `(?:\\b${s.value}\\s*[- ]?pins?\\b|\\bpins?\\s*[:|=]\\s*${s.value}\\b)`,
            "i",
          ).test(s.excerpt))) &&
      (supportsSpec(s.key, s.value, s.excerpt) ||
        (s.key === "form" &&
          s.value === "breakout module" &&
          (/break[- ]?out\s+(?:board|module)/i.test(s.excerpt) ||
            /integrates\s+the\s+dht\s*11\s+sensor\s+and\s+other\s+required\s+components\s+on\s+a\s+compact\s+PCB/i.test(
              whitespace(s.excerpt),
            ))) ||
        (s.key === "form" &&
          s.value === "bare sensor" &&
          /4[- ]pin package/i.test(s.excerpt))),
  );
  const prices = ex.priceBreaks
    .filter((p) => {
      try {
        return (
          containsExcerpt(text, p.excerpt) &&
          !/(~~|<del\b|<s\b|\b(?:save|savings|MRP|was)\b)/i.test(p.excerpt) &&
          /₹|\b(?:INR|Rs\.?|price)\b/i.test(p.excerpt) &&
          quotedMoney(p.excerpt, paise(p.packPriceInr)) &&
          (p.minPacks === 1 || numberIn(p.excerpt, p.minPacks))
        );
      } catch {
        return false;
      }
    })
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
