import { authorize, apiError } from "../../../../server/access";
import { readiness } from "../../../../server/readiness";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    authorize(request);
    return Response.json(await readiness(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
