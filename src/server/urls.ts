import { retailers } from "../domain/catalogue";
import type { Retailer } from "../domain/schema";
export function safeRetailerUrl(input: string, retailer: Retailer): string {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    ![retailers[retailer].domain, `www.${retailers[retailer].domain}`].includes(
      url.hostname,
    )
  )
    throw new Error("Unsupported retailer URL or redirect");
  return url.toString();
}
