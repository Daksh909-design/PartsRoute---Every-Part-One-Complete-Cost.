import { createHash, timingSafeEqual } from "node:crypto";
import { allowedOrigin } from "./origins";
export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function authorize(request: Request): string {
  const expected = process.env.APP_ACCESS_TOKEN;
  if (!expected || expected.length < 24)
    throw new AccessError(
      503,
      "Live mode needs a configured team access token.",
    );
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(hash(supplied), hash(expected)))
    throw new AccessError(
      401,
      "Enter your team access token to use live quotes.",
    );
  const origin = request.headers.get("origin");
  if (!allowedOrigin(origin, request.url, request.headers.get("host")))
    throw new AccessError(403, "Request origin not permitted.");
  return hash(expected).toString("hex");
}
export async function requestJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 131072)
    throw new AccessError(413, "This parts list is too large.");
  const reader = request.body?.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 131072) {
        await reader.cancel();
        throw new AccessError(413, "This parts list is too large.");
      }
      chunks.push(chunk.value);
    }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new AccessError(400, "Invalid request.");
  }
}
export function apiError(error: unknown): Response {
  if (error instanceof AccessError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.name === "ZodError")
    return Response.json(
      {
        error:
          "Check the pincode, quantities and attributes. Add at least one component and select a supported retailer product for every line.",
      },
      { status: 400 },
    );
  return Response.json(
    {
      error:
        "The service is unavailable. Check database connectivity and worker configuration.",
    },
    { status: 503 },
  );
}
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
