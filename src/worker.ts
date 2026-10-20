import { randomUUID } from "node:crypto";
import { db, saveResult, type Job } from "./server/db";
import { processQuote } from "./server/pipeline";
const owner = randomUUID();
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
if (!process.env.TINYFISH_API_KEY || !process.env.OPENAI_API_KEY)
  throw new Error(
    "Set TINYFISH_API_KEY and OPENAI_API_KEY before starting the live worker",
  );
console.log("PartsRoute worker ready. Provider secrets are never logged.");
while (!stopping) {
  const job = (
    await db().query(
      `WITH candidate AS (SELECT id FROM quotes WHERE (status='queued' OR (status='processing' AND lease_until<now())) AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE quotes q SET status='processing',attempts=attempts+1,lease_owner=$1,lease_until=now()+interval '60 seconds',updated_at=now() FROM candidate WHERE q.id=candidate.id RETURNING q.*`,
      [owner],
    )
  ).rows[0] as Job | undefined;
  if (!job) {
    await db().query(
      "UPDATE quotes SET status='failed',phase='Worker recovery limit reached',updated_at=now() WHERE status='processing' AND lease_until<now() AND attempts>=3",
    );
    await new Promise((r) => setTimeout(r, 2000));
    continue;
  }
  const heartbeat = setInterval(() => {
    void db()
      .query(
        "UPDATE quotes SET lease_until=now()+interval '60 seconds' WHERE id=$1 AND lease_owner=$2",
        [job.id, owner],
      )
      .catch(() => {
        stopping = true;
      });
  }, 10000);
  try {
    const result = await processQuote(job.id, job.input);
    await saveResult(job.id, result);
    await db().query(
      "UPDATE quotes SET status=$2,phase='Finished checking options',lease_until=NULL,lease_owner=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$3",
      [job.id, result.recommendedId ? "complete" : "partial", owner],
    );
  } catch (error) {
    console.error(`Quote ${job.id} failed; inspect protected evidence.`);
    await db().query(
      "UPDATE quotes SET status='failed',phase='Could not complete this quote. Retry the saved job.',errors=$2,lease_until=NULL,lease_owner=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$3",
      [
        job.id,
        JSON.stringify([
          error instanceof Error ? error.message : "Processing failed",
        ]),
        owner,
      ],
    );
  } finally {
    clearInterval(heartbeat);
  }
}
await db().end();
