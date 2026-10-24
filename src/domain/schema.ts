import { z } from "zod";
import { catalogue } from "./catalogue";

export const Retailer = z.enum(["robu", "robocraze"]);
export type Retailer = z.infer<typeof Retailer>;
export const ProductSource = z
  .object({
    retailer: Retailer,
    url: z.url().max(1000),
    variantId: z.number().int().positive().optional(),
  })
  .superRefine((source, ctx) => {
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid retailer product URL" });
      return;
    }
    const domain = source.retailer === "robu" ? "robu.in" : "robocraze.com";
    const path =
      source.retailer === "robu"
        ? /^\/product\/[^/]+\/?$/
        : /^\/products\/[^/]+\/?$/;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      ![domain, `www.${domain}`].includes(url.hostname) ||
      !path.test(url.pathname)
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose a product URL from the supported retailer.",
      });
  });
export type ProductSource = z.infer<typeof ProductSource>;
export const Money = z.number().int().min(0).max(1_000_000_000);
export const Spec = z.object({
  key: z.string().min(1).max(60),
  value: z.string().min(1).max(120),
});
export const PartRequest = z.object({
  id: z.string().min(1).max(50),
  catalogueId: z.string().min(1).max(100),
  name: z.string().min(1).max(240),
  model: z.string().max(120),
  sources: z.array(ProductSource).min(1).max(2).optional(),
  quantity: z.number().int().min(1).max(100),
  quantityUnit: z.enum(["units", "packs"]).optional(),
  requiredSpecs: z.array(Spec).max(8),
  equivalentAcceptable: z.boolean(),
  confirmedOfferIds: z.array(z.string().max(160)).max(4),
});
export type PartRequest = z.infer<typeof PartRequest>;
export const QuoteInput = z
  .object({
    parts: z.array(PartRequest).min(1),
    pincode: z
      .string()
      .regex(/^[1-9][0-9]{5}$/, "Enter a six-digit Indian pincode"),
    mode: z.enum(["live", "demo"]),
    refresh: z.boolean().default(false),
  })
  .superRefine((input, ctx) => {
    if (new Set(input.parts.map((p) => p.id)).size !== input.parts.length)
      ctx.addIssue({
        code: "custom",
        message: "Every component line must have a unique identifier.",
      });
    for (const part of input.parts)
      if (
        !part.sources?.length &&
        !catalogue.some((entry) => entry.id === part.catalogueId)
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Select a real retailer product before collecting a component.",
        });
  });
export type QuoteInput = z.infer<typeof QuoteInput>;
export const Evidence = z.object({
  id: z.string(),
  sourceUrl: z.url(),
  retrievedAt: z.iso.datetime(),
  excerpt: z.string(),
  method: z.enum([
    "tinyfish-fetch",
    "tinyfish-agent",
    "storefront-api",
    "retailer-datasheet",
    "synthetic-fixture",
  ]),
  runId: z.string().nullable(),
  observationId: z.string(),
});
export type Evidence = z.infer<typeof Evidence>;
export const Offer = z.object({
  id: z.string(),
  partId: z.string(),
  retailer: Retailer,
  sku: z.string().nullable(),
  variantId: z.number().int().positive().optional(),
  title: z.string(),
  url: z.url(),
  model: z.string().nullable(),
  specs: z.array(Spec),
  unitsPerPack: z.number().int().positive().nullable(),
  minPacks: z.number().int().positive().nullable(),
  multiplePacks: z.number().int().positive().nullable(),
  orderingConflict: z.boolean().optional(),
  extractionMethod: z.enum(["ai", "retailer-parser"]).optional(),
  priceBreaks: z.array(
    z.object({ minPacks: z.number().int().positive(), packPricePaise: Money }),
  ),
  currency: z.literal("INR"),
  taxStatus: z.enum(["included", "excluded", "unknown"]),
  taxRateBps: z.number().int().min(0).max(10000).nullable(),
  stock: z.enum(["in_stock", "out_of_stock", "unknown"]),
  availablePacks: z.number().int().min(0).nullable(),
  match: z.enum([
    "exact",
    "needs_confirmation",
    "rejected",
    "insufficient_information",
  ]),
  reasons: z.array(z.string()),
  evidence: z.array(Evidence),
});
export type Offer = z.infer<typeof Offer>;
export const BasketItem = z.object({
  offerId: z.string(),
  sku: z.string().nullable(),
  packs: z.number().int().positive(),
});
export const ShippingObservation = z.object({
  id: z.string(),
  retailer: Retailer,
  basketKey: z.string(),
  items: z.array(BasketItem),
  pincode: z.string(),
  method: z.string(),
  chargePaise: Money.nullable(),
  taxStatus: z.enum(["included", "excluded", "unknown"]),
  taxRateBps: z.number().int().min(0).max(10000).nullable(),
  serviceable: z.boolean().nullable(),
  status: z.enum(["verified", "estimated", "unknown"]),
  conditions: z.string(),
  observedAt: z.iso.datetime(),
  evidence: z.array(Evidence),
});
export type ShippingObservation = z.infer<typeof ShippingObservation>;
export type ShippingRule = {
  retailer: Retailer;
  basis: "before_tax" | "payable_items" | "unknown";
  thresholdPaise: number | null;
  comparison: "gt" | "gte";
  belowChargePaise: number | null;
  aboveChargePaise: number | null;
  taxStatus: "included" | "excluded" | "unknown";
  taxRateBps: number | null;
  applicable: boolean;
  conditions: string;
  evidence: Evidence[];
};
export type LineCost = {
  offer: Offer;
  requiredUnits: number;
  packs: number;
  purchasedUnits: number;
  quantityUnit?: "units" | "packs";
  itemsPaise: number;
  addedTaxPaise: number | null;
  beforeTaxPaise: number | null;
  payablePaise: number | null;
};
export type Basket = {
  retailer: Retailer;
  key: string;
  lines: LineCost[];
  itemsPaise: number;
  addedTaxPaise: number | null;
  payableItemsPaise: number | null;
  shipping: ShippingObservation;
  totalPaise: number | null;
};
export type Plan = {
  id: string;
  baskets: Basket[];
  itemsPaise: number;
  addedTaxPaise: number | null;
  shippingPaise: number | null;
  totalPaise: number | null;
  knownSubtotalPaise: number;
  verified: boolean;
  unresolved: string[];
};
export type QuoteResult = {
  mode: "live" | "demo";
  input: QuoteInput;
  offers: Offer[];
  shipping: ShippingObservation[];
  plans: Plan[];
  recommendedId: string | null;
  coverage: { covered: number; requested: number };
  errors: string[];
  explanation: string;
  explanationSource: "deterministic" | "openai-validated" | "gemini-validated";
  generatedAt: string;
  comparisonLimited?: boolean;
  dataStatus?: {
    kind: "cached";
    oldestObservedAt: string;
    expiresAt: string;
    missingUrls: number;
  };
};
