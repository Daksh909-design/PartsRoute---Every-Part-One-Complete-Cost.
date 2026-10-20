import { db } from "../src/server/db";
import { TinyFishClient } from "../src/server/tinyfish";
const [quoteId, operationKey, runId] = process.argv.slice(2);
if (!quoteId || !operationKey || !runId)
  throw new Error(
    "Usage: pnpm recover:run <quote UUID> <operation key> <existing TinyFish run ID>",
  );
const op = (
  await db().query(
    "SELECT * FROM provider_operations WHERE quote_id=$1 AND operation_key=$2 AND status IN ('initiating','uncertain') AND run_id IS NULL",
    [quoteId, operationKey],
  )
).rows[0];
if (!op)
  throw new Error(
    "No uncertain operation found; existing run IDs cannot be overwritten",
  );
const run = await new TinyFishClient().getRun(runId);
if (
  !run.goal ||
  !String(run.goal).includes(op.payload.pincode) ||
  !String(run.goal).includes("PartsRoute")
)
  throw new Error(
    "Run goal does not match this PartsRoute request. Verify the exact basket manually.",
  );
await db().query(
  "UPDATE provider_operations SET run_id=$3,status='running',updated_at=now() WHERE quote_id=$1 AND operation_key=$2 AND run_id IS NULL",
  [quoteId, operationKey, runId],
);
await db().query(
  "UPDATE quotes SET status='queued',phase='Recovering existing provider run',attempts=0 WHERE id=$1 AND status IN ('failed','partial')",
  [quoteId],
);
console.log("Attached existing run. No new automation was started.");
await db().end();
