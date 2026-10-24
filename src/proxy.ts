import { NextResponse, type NextRequest } from "next/server";
import { allowedOrigin } from "./server/origins";

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!allowedOrigin(origin, request.url, request.headers.get("host")))
    return NextResponse.json(
      { error: "Request origin not permitted." },
      { status: 403 },
    );
  const response =
    request.method === "OPTIONS"
      ? new NextResponse(null, { status: 204 })
      : NextResponse.next();
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Idempotency-Key",
  );
  response.headers.set("Access-Control-Max-Age", "600");
  return response;
}
export const config = { matcher: "/api/:path*" };
