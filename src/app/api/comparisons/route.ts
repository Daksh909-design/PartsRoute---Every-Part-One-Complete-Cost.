import { QuoteInput } from "../../../domain/schema";
import {
  authorize,
  requestJson,
  apiError,
  AccessError,
} from "../../../server/access";
import { cachedComparison } from "../../../server/snapshot";
export const runtime = "nodejs";
// A read-only comparison must never start a provider call or create a quote job.
export async function POST(request: Request) {
  try {
    authorize(request);
    const input = QuoteInput.parse(await requestJson(request));
    if (input.mode !== "live" || input.refresh)
      throw new AccessError(
        400,
        "Use Refresh from retailers for a new collection.",
      );
    const result = await cachedComparison(input);
    if (!result)
      throw new AccessError(
        404,
        "No recent retailer observations are available. Choose Refresh from retailers to collect them in the background, then compare again.",
      );
    return Response.json(
      { id: null, status: "cached", result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
