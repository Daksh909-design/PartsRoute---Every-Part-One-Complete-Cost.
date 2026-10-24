import { authorize, requestJson, apiError } from "../../../../server/access";
import { componentSearch } from "../../../../server/component-search";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = authorize(request);
    return Response.json(
      await componentSearch(await requestJson(request), actor),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
