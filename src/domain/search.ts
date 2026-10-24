import { z } from "zod";
import { Retailer, ProductSource } from "./schema";

export const ComponentSearchInput = z.object({
  query: z.string().trim().min(2).max(160),
  retailer: Retailer.optional(),
});
export type SearchProduct = {
  id: string;
  retailer: z.infer<typeof Retailer>;
  title: string;
  url: string;
  pricePaise: number | null;
  available: boolean | null;
  variants: {
    id: number;
    title: string;
    sku: string;
    pricePaise: number;
    available: boolean;
  }[];
};
export type ComponentSearchResult = {
  id: string;
  query: string;
  products: SearchProduct[];
  errors: string[];
  observedAt: string;
  sources: { retailer: z.infer<typeof Retailer>; url: string }[];
};
export { ProductSource };
