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
import { readiness } from "../../../server/readiness";
import { aiConfig } from "../../../server/ai-provider";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = authorize(request);
    if (!process.env[aiConfig().keyName] || !process.env.TINYFISH_API_KEY)
      throw new AccessError(
        503,
        `Live mode needs TINYFISH_API_KEY and ${aiConfig().keyName} on the server.`,
      );
    // Collection and saved comparisons have different endpoints. A caller must
    // never receive old observations from the endpoint that starts a live quote.
    const input = {
      ...QuoteInput.parse(await requestJson(request)),
      refresh: true,
    };
    if (input.mode !== "live")
      throw new AccessError(400, "Use the saved-data endpoint for the demo.");
    const status = await readiness();
    if (!status.ready)
      throw new AccessError(
        503,
        status.checks
          .filter((check) => !check.ok)
          .map((check) => `${check.name}: ${check.detail}`)
          .join(" "),
      );
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
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    return apiError(error);
  }
}
