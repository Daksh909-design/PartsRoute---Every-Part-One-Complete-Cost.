import {
  authorize,
  apiError,
  uuidPattern,
  AccessError,
} from "../../../../server/access";
import { db, getJob } from "../../../../server/db";
import { readiness } from "../../../../server/readiness";
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
    const job = await getJob(id);
    if (!job) throw new AccessError(404, "Quote not found.");
    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    authorize(request);
    const status = await readiness();
    if (!status.ready)
      throw new AccessError(
        503,
        "The live worker or database is not ready. Check the live service before retrying.",
      );
    const { id } = await params;
    if (!uuidPattern.test(id))
      throw new AccessError(400, "Invalid quote identifier.");
    const updated = await db().query(
      "UPDATE quotes SET status='queued',phase='Retrying saved work',updated_at=now() WHERE id=$1 AND status IN ('failed','partial') AND attempts<3 RETURNING id",
      [id],
    );
    if (!updated.rowCount)
      throw new AccessError(
        409,
        "This job cannot be retried now. It may still be running or have reached the retry limit.",
      );
    return Response.json({ id, status: "queued" });
  } catch (error) {
    return apiError(error);
  }
}
