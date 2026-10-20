import { z } from "zod";
import { authorize, requestJson, apiError } from "../../../server/access";
import { db } from "../../../server/db";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    authorize(request);
    const ids = z
      .array(z.uuid())
      .min(1)
      .max(20)
      .parse(await requestJson(request));
    const rows = await db().query(
      "SELECT id,quote_id,source_url,method,run_id,retrieved_at,original,normalized FROM observations WHERE id=ANY($1::uuid[])",
      [ids],
    );
    const quoteIds = [...new Set(rows.rows.map((row) => row.quote_id))];
    const [operations, usage] = await Promise.all([
      db().query(
        "SELECT operation_key,status,run_id FROM provider_operations WHERE quote_id=ANY($1::uuid[])",
        [quoteIds],
      ),
      db().query(
        "SELECT provider,model,input_tokens,output_tokens FROM provider_usage WHERE quote_id=ANY($1::uuid[]) ORDER BY id",
        [quoteIds],
      ),
    ]);
    return Response.json(
      {
        observations: rows.rows,
        operations: operations.rows,
        usage: usage.rows,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
