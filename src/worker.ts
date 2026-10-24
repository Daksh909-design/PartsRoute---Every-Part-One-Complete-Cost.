import { randomUUID } from "node:crypto";
import { db, saveResult } from "./server/db";
import { claimJob, completeJob } from "./server/queue";
import { processQuote } from "./server/pipeline";
import { aiConfig } from "./server/ai-provider";
import { LeaseLost, type JobLease } from "./server/lease";
const owner = randomUUID();
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
if (!process.env.TINYFISH_API_KEY || !process.env[aiConfig().keyName])
  throw new Error(
    `Set TINYFISH_API_KEY and ${aiConfig().keyName} before starting the live worker`,
  );
async function reportHeartbeat() {
  await db().query(
    "INSERT INTO worker_heartbeats(worker_id) VALUES($1) ON CONFLICT(worker_id) DO UPDATE SET last_seen=now()",
    [owner],
  );
}
await reportHeartbeat();
console.log("PartsRoute worker ready. Provider secrets are never logged.");
const presence = setInterval(() => {
  void reportHeartbeat().catch(() => {
    stopping = true;
  });
}, 10000);
while (!stopping) {
  const job = await claimJob(owner);
  if (!job) {
    await db().query(
      "UPDATE quotes SET status='failed',phase='Worker recovery limit reached',updated_at=now() WHERE status='processing' AND lease_until<now() AND attempts>=3",
    );
    await new Promise((r) => setTimeout(r, 250));
    continue;
  }
  const controller = new AbortController();
  const lease: JobLease = {
    id: job.id,
    owner,
    attempt: job.attempts,
    signal: controller.signal,
  };
  const heartbeat = setInterval(() => {
    void db()
      .query(
        "UPDATE quotes SET lease_until=now()+interval '60 seconds' WHERE id=$1 AND lease_owner=$2 AND attempts=$3 AND status='processing' AND lease_until>now()",
        [job.id, owner, job.attempts],
      )
      .then((result) => {
        if (!result.rowCount) controller.abort(new LeaseLost());
      })
      .catch(() => {
        controller.abort(new LeaseLost());
        stopping = true;
      });
  }, 10000);
  try {
    const result = await processQuote(
      job.id,
      job.input,
      undefined,
      undefined,
      lease,
    );
    await saveResult(job.id, result, lease);
    await completeJob(
      job.id,
      owner,
      result.recommendedId ? "complete" : "partial",
      job.attempts,
    );
  } catch (error) {
    controller.abort(error);
    if (error instanceof LeaseLost) continue;
    console.error(`Quote ${job.id} failed; inspect protected evidence.`);
    await db().query(
      "UPDATE quotes SET status='failed',phase='Could not complete this quote. Retry the saved job.',errors=$2,lease_until=NULL,lease_owner=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$3 AND attempts=$4 AND lease_until>now()",
      [
        job.id,
        JSON.stringify([
          error instanceof Error ? error.message : "Processing failed",
        ]),
        owner,
        job.attempts,
      ],
    );
  } finally {
    clearInterval(heartbeat);
  }
}
clearInterval(presence);
await db().query("DELETE FROM worker_heartbeats WHERE worker_id=$1", [owner]);
await db().end();
