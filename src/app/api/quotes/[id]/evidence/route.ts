import {
  authorize,
  apiError,
  uuidPattern,
  AccessError,
} from "../../../../../server/access";
import { db } from "../../../../../server/db";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    authorize(request);
    const { id } = await params;
    if (!uuidPattern.test(id))
      throw new AccessError(400, "Invalid quote identifier.");
    const [observations, operations, usage] = await Promise.all([
      db().query(
        "SELECT id,source_url,method,run_id,retrieved_at,original,normalized FROM observations WHERE quote_id=$1 ORDER BY retrieved_at",
        [id],
      ),
      db().query(
        "SELECT operation_key,status,run_id,created_at,updated_at FROM provider_operations WHERE quote_id=$1",
        [id],
      ),
      db().query(
        "SELECT provider,model,request_id,input_tokens,output_tokens,details,created_at FROM provider_usage WHERE quote_id=$1",
        [id],
      ),
    ]);
    return Response.json(
      {
        observations: observations.rows,
        operations: operations.rows,
        usage: usage.rows,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
