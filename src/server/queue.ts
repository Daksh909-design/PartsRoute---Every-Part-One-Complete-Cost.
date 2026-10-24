import { db, type Job } from "./db";

export async function claimJob(owner: string): Promise<Job | null> {
  return (
    (
      await db().query(
        `WITH candidate AS (SELECT id FROM quotes WHERE (status='queued' OR (status='processing' AND lease_until<now())) AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
     UPDATE quotes q SET status='processing',attempts=attempts+1,lease_owner=$1,lease_until=now()+interval '60 seconds',updated_at=now() FROM candidate WHERE q.id=candidate.id RETURNING q.*`,
        [owner],
      )
    ).rows[0] ?? null
  );
}
export async function completeJob(
  id: string,
  owner: string,
  status: "complete" | "partial",
  attempt?: number,
): Promise<boolean> {
  return Boolean(
    (
      await db().query(
        "UPDATE quotes SET status=$2,phase='Finished checking options',lease_until=NULL,lease_owner=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$3 AND lease_until>now() AND ($4::integer IS NULL OR attempts=$4)",
        [id, status, owner, attempt ?? null],
      )
    ).rowCount,
  );
}
