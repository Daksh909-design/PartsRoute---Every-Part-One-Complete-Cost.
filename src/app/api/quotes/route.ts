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
import { cachedComparison } from "../../../server/snapshot";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = authorize(request);
    if (!process.env[aiConfig().keyName] || !process.env.TINYFISH_API_KEY)
      throw new AccessError(
        503,
        `Live mode needs TINYFISH_API_KEY and ${aiConfig().keyName} on the server.`,
      );
    const input = QuoteInput.parse(await requestJson(request));
    if (input.mode !== "live")
      throw new AccessError(400, "Use the saved-data endpoint for the demo.");
    // This path performs only bounded PostgreSQL reads and deterministic maths.
    // Browser verification remains an explicit background refresh.
    const cached = await cachedComparison(input);
    if (cached)
      return Response.json(
        { id: null, status: "cached", result: cached },
        { headers: { "Cache-Control": "no-store" } },
      );
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
        { status: 429, headers: { "Retry-After": "300" } },
      );
    return apiError(error);
  }
}
