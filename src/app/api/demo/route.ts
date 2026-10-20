import { QuoteInput } from "../../../domain/schema";
import { requestJson, apiError, AccessError } from "../../../server/access";
import { demoQuote } from "../../../server/demo";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = QuoteInput.parse(await requestJson(request));
    if (input.mode !== "demo")
      throw new AccessError(400, "Live requests cannot use synthetic data.");
    return Response.json(demoQuote(input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
