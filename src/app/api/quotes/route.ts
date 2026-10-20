import { createHash } from "node:crypto";
import { QuoteInput } from "../../../domain/schema";
import {
  authorize,
  requestJson,
  apiError,
  AccessError,
  uuidPattern,
} from "../../../server/access";
import { enqueue, RequestLimit } from "../../../server/db";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = authorize(request);
    if (!process.env.OPENAI_API_KEY || !process.env.TINYFISH_API_KEY)
      throw new AccessError(
        503,
        "Live mode needs TinyFish and OpenAI API keys on the server.",
      );
    const input = QuoteInput.parse(await requestJson(request));
    if (input.mode !== "live")
      throw new AccessError(400, "Use the saved-data endpoint for the demo.");
    const key = request.headers.get("idempotency-key") ?? "";
    if (!uuidPattern.test(key))
      throw new AccessError(400, "A valid request identifier is required.");
    const fingerprint = createHash("sha256")
      .update(`${actor}:${key}:${JSON.stringify(input)}`)
      .digest("hex");
    const id = await enqueue(input, fingerprint, actor);
    return Response.json(
      { id, status: "queued" },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof RequestLimit)
      return Response.json(
        { error: error.message },
        { status: 429, headers: { "Retry-After": "300" } },
      );
    return apiError(error);
  }
}
