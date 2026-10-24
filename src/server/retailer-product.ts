import type { ProductExtraction } from "./ai";
import type { Retailer } from "../domain/schema";
import { extractionContent } from "./content";
import { canonical } from "../domain/matching";

export const hasPublishedQuantityPricing = (text: string) =>
  /\b(?:bulk|quantity|volume)\s*(?:prices?|discounts?)\b[^\n]{0,100}(?:₹|\bRs\.?)\s*\d|\b(?:quantity|qty)\s*\|\s*(?:price|discount)\b/i.test(
    text,
  );

// Narrow reads of the two observed templates, never unpublished ordering rules,
// pin counts or shipping. Original pages and model failures remain available.
export function retailerProduct(
  text: string,
  retailer: Retailer,
  allowGeneric = false,
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
  if (!model && !allowGeneric) return null;
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
    /(?:Please hurry!\s*)?Only\s+([\d,]+)\s+left in stock/i.exec(header);
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
  const packageLine = packageSection.split("\n").find(
    (line) =>
      /^\s*\*?\s*\d+\s*[x×]\s+/i.test(line) &&
      ((model
        ? canonical(line).includes(canonical(model))
        : title
            .toLowerCase()
            .split(/[^a-z0-9-]+/)
            .filter((word) => word.length >= 4)
            .some((word) => line.toLowerCase().includes(word))) ||
        (model === "breadboard400" &&
          /400/.test(line) &&
          /breadboard/i.test(line))),
  );
  const titlePack = allowGeneric ? /\bpack\s+of\s+(\d+)\b/i.exec(title) : null;
  const units = titlePack
    ? Number(titlePack[1])
    : packageLine
      ? Number(/(\d+)\s*[x×]/i.exec(packageLine)![1])
      : null;
  const tax = /Incl\. GST(?: \(No Hidden Charges\))?/.exec(header);
  const wholePoints = /\|\s*Number of Points\s*\|\s*(\d+)\s*\|/i.exec(main);
  const specs: ProductExtraction["specs"] = wholePoints
    ? [{ key: "tie_points", value: wholePoints[1], excerpt: wholePoints[0] }]
    : [];
  const pins = /\b(?:number of pins|pin count|pins)\s*[:|=]\s*(\d+)\b/i.exec(
    main,
  );
  if (pins) specs.push({ key: "pins", value: pins[1], excerpt: pins[0] });
  for (const line of main.split("\n")) {
    const voltage =
      /(?:^|\|)\s*(?:(?:operating|supply|input)\s+)?voltage(?:\s*\([^)]*\))?\s*[:|=]\s*([^|]+)/i.exec(
        line,
      );
    const value = voltage?.[1].trim().replace(/[.;]$/, "");
    if (value && /^\+?\d+(?:\.\d+)?\s*v(?:\s*(?:AC|DC))?$/i.test(value))
      specs.push({ key: "voltage", value, excerpt: line });
  }
  const breakout =
    /\bbreak[- ]?out\s+(?:board|module)\b/i.exec(main) ||
    /integrates\s+the\s+dht\s*11\s+sensor\s+and\s+other\s+required\s+components\s+on\s+a\s+compact\s+PCB/i.exec(
      main,
    );
  if (breakout)
    specs.push({ key: "form", value: "breakout module", excerpt: breakout[0] });
  const bare = /\bbare sensor\b/i.exec(main);
  if (bare) specs.push({ key: "form", value: "bare sensor", excerpt: bare[0] });
  // HTML quantity controls have an offset step. Only represent them as absolute
  // multiples when the minimum aligns; absent controls never default to one.
  const controls =
    main.match(/<input\b[^>]*\bname=["']quantity["'][^>]*>/gi) ?? [];
  const control = controls.length === 1 ? controls[0] : "";
  const minimum = /\bmin=["'](\d+)["']/i.exec(control);
  const step = /\bstep=["'](\d+)["']/i.exec(control);
  const minPacks = minimum ? Number(minimum[1]) : null;
  const multiplePacks =
    step && Number(step[1]) > 0 && minPacks && minPacks % Number(step[1]) === 0
      ? Number(step[1])
      : null;
  const support: ProductExtraction["support"] = [
    { field: "title", excerpt: title },
    { field: "model", excerpt: title },
  ];
  if (skuMatch) support.push({ field: "sku", excerpt: skuMatch[0] });
  if (stockMatch) support.push({ field: "stock", excerpt: stockMatch[0] });
  const availablePacks =
    stockMatch && /^[\d,]+$/.test(stockMatch[1])
      ? Number(stockMatch[1].replaceAll(",", ""))
      : null;
  if (availablePacks !== null)
    support.push({ field: "availablePacks", excerpt: stockMatch![0] });
  if (units && (titlePack || packageLine))
    support.push({
      field: "unitsPerPack",
      excerpt: titlePack ? title : packageLine!,
    });
  if (tax) support.push({ field: "taxStatus", excerpt: tax[0] });
  if (minPacks) support.push({ field: "minPacks", excerpt: control });
  if (multiplePacks) support.push({ field: "multiplePacks", excerpt: control });
  return {
    title,
    model,
    sku: skuMatch?.[1] ?? null,
    specs,
    unitsPerPack: units,
    minPacks: minPacks && minPacks > 0 ? minPacks : null,
    multiplePacks,
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
