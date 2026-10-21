import type { ProductExtraction } from "./ai";
import type { Retailer } from "../domain/schema";
import { extractionContent } from "./content";
import { canonical } from "../domain/matching";

// Narrow reads of the two observed templates, never unpublished ordering rules,
// pin counts or shipping. Original pages and model failures remain available.
export function retailerProduct(
  text: string,
  retailer: Retailer,
): ProductExtraction | null {
  const main = extractionContent(text);
  const heading = /^# ([^\n]+)$/m.exec(main);
  if (!heading) return null;
  const title = heading[1];
  const model = /\bHC[-\s]?SR[-\s]?04\b/i.test(title)
    ? "HC-SR04"
    : /\bDHT[-\s]?11\b/i.test(title)
      ? "DHT11"
      : /\b400\b/.test(title) && /breadboard/i.test(title)
        ? "breadboard400"
        : null;
  if (!model) return null;
  const header = main
    .split(
      /\n(?:Buy it with|Didn.t find what|Have a Bulk Order|## Bulk Order)/i,
    )[0]
    .slice(0, 2200);
  const pricePattern =
    retailer === "robu"
      ? /^₹\s*([\d,]+(?:\.\d{1,2})?)\s*\(Incl\. GST\)\s*$/gm
      : /^:\s*Rs\s*([\d,]+(?:\.\d{1,2})?)\s*\/-\s*$/gm;
  const prices = [...header.matchAll(pricePattern)];
  if (!prices.length || new Set(prices.map((p) => p[1])).size !== 1)
    return null;
  const price = prices[0];
  const skuMatch = /\bSKU:\s*([A-Z\d-]+)\b/i.exec(main);
  const stockMatch =
    /Availability:\s*(In Stock|Out of Stock)/i.exec(header) ||
    /(?:Please hurry!\s*)?Only\s+(\d+)\s+left in stock/i.exec(header);
  const stock = stockMatch
    ? /out of stock/i.test(stockMatch[0]) || stockMatch[1] === "0"
      ? "out_of_stock"
      : "in_stock"
    : "unknown";
  const packageSection =
    main
      .split(
        /#{1,5}\s*\*?\*?(?:Package Includes|What['’]s in the Box)\s*:?\*?\*?\s*/i,
      )[1]
      ?.split(/\n#{1,5}\s|\n---/)[0] || "";
  const packageLine = packageSection
    .split("\n")
    .find(
      (line) =>
        /^\s*\*?\s*\d+\s*[x×]\s+/i.test(line) &&
        (canonical(line).includes(canonical(model)) ||
          (model === "breadboard400" &&
            /400/.test(line) &&
            /breadboard/i.test(line))),
    );
  const units = packageLine
    ? Number(/(\d+)\s*[x×]/i.exec(packageLine)![1])
    : null;
  const tax = /Incl\. GST(?: \(No Hidden Charges\))?/.exec(header);
  const wholePoints = /\|\s*Number of Points\s*\|\s*(\d+)\s*\|/i.exec(main);
  const support: ProductExtraction["support"] = [
    { field: "title", excerpt: title },
    { field: "model", excerpt: title },
  ];
  if (skuMatch) support.push({ field: "sku", excerpt: skuMatch[0] });
  if (stockMatch) support.push({ field: "stock", excerpt: stockMatch[0] });
  const availablePacks =
    stockMatch && /^\d+$/.test(stockMatch[1]) ? Number(stockMatch[1]) : null;
  if (availablePacks !== null)
    support.push({ field: "availablePacks", excerpt: stockMatch![0] });
  if (units && packageLine)
    support.push({ field: "unitsPerPack", excerpt: packageLine });
  if (tax) support.push({ field: "taxStatus", excerpt: tax[0] });
  return {
    title,
    model,
    sku: skuMatch?.[1] ?? null,
    specs: wholePoints
      ? [{ key: "tie_points", value: wholePoints[1], excerpt: wholePoints[0] }]
      : [],
    unitsPerPack: units,
    minPacks: null,
    multiplePacks: null,
    priceBreaks: [
      {
        minPacks: 1,
        packPriceInr: Number(price[1].replaceAll(",", "")).toFixed(2),
        excerpt: price[0],
      },
    ],
    taxStatus: tax ? "included" : "unknown",
    taxRateBps: null,
    stock,
    availablePacks,
    support,
  };
}
