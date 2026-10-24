import { randomUUID } from "node:crypto";
import { applyMigrations } from "../src/server/migrations";
import {
  db,
  enqueue,
  saveObservation,
  normalizeObservation,
  observation,
  saveResult,
  getJob,
  preserveObservationTime,
  RequestLimit,
} from "../src/server/db";
import { sampleParts } from "../src/domain/catalogue";
import { demoQuote } from "../src/domain/demo";
import { claimJob, completeJob } from "../src/server/queue";
import { LeaseLost } from "../src/server/lease";

const connection = process.env.TEST_DATABASE_URL;
if (!connection || !new URL(connection).pathname.endsWith("_test"))
  throw new Error(
    "Set TEST_DATABASE_URL to a dedicated database whose name ends in _test. Never run this check against the live database.",
  );
process.env.DATABASE_URL = connection;
const input = {
  parts: sampleParts,
  pincode: "560001",
  mode: "demo" as const,
  refresh: false,
};
function check(ok: boolean, label: string) {
  if (!ok) throw new Error(label);
  console.log(`PASS ${label}`);
}
const actor = `synthetic-postgres-test:${randomUUID()}`;
try {
  for (let run = 0; run < 2; run++) {
    await applyMigrations(db());
  }
  check(
    (await db().query("SELECT name FROM schema_migrations")).rows.some(
      (row) => row.name === "002_worker_heartbeat.sql",
    ),
    "real PostgreSQL migrations run and can be repeated",
  );
  const key = randomUUID();
  const ids = await Promise.all([
    enqueue(input, key, actor),
    enqueue(input, key, actor),
  ]);
  check(
    ids[0] === ids[1],
    "concurrent duplicate submissions share one PostgreSQL job",
  );
  const refreshedKey = randomUUID();
  check(
    (await enqueue(input, refreshedKey, actor)) === ids[0],
    "a refreshed browser request recovers identical active team work",
  );
  await db().query("UPDATE quotes SET status='partial' WHERE id=$1", [ids[0]]);
  check(
    (await enqueue(input, refreshedKey, actor)) === ids[0],
    "the recovered request stays idempotent after the job finishes",
  );
  const newId = await enqueue(input, randomUUID(), actor);
  check(
    newId !== ids[0],
    "a deliberate new request after completion creates fresh work",
  );
  await db().query("DELETE FROM quotes WHERE id=$1", [newId]);
  const configuredHourlyLimit = process.env.LIVE_QUOTES_PER_HOUR;
  try {
    process.env.LIVE_QUOTES_PER_HOUR = "2";
    let limited = false;
    try {
      await enqueue(input, randomUUID(), actor);
    } catch (error) {
      limited = error instanceof RequestLimit && error.retryAfterSeconds > 0;
    }
    check(
      limited,
      "the configured rolling-hour limit reports a positive retry delay",
    );
    process.env.LIVE_QUOTES_PER_HOUR = "0";
    const unrestricted = await enqueue(input, randomUUID(), actor);
    check(
      Boolean(unrestricted),
      "zero disables the hourly limit for local testing",
    );
    await db().query("DELETE FROM quotes WHERE id=$1", [unrestricted]);
  } finally {
    if (configuredHourlyLimit === undefined)
      delete process.env.LIVE_QUOTES_PER_HOUR;
    else process.env.LIVE_QUOTES_PER_HOUR = configuredHourlyLimit;
  }
  await db().query("UPDATE quotes SET status='queued' WHERE id=$1", [ids[0]]);
  const first = await saveObservation(
    ids[0],
    "synthetic-test",
    "robocraze",
    "https://robocraze.com/products/half-breadboard",
    "synthetic-fixture",
    { label: "Synthetic PostgreSQL persistence check", value: 1 },
  );
  const owners = [randomUUID(), randomUUID()];
  const copied = await saveObservation(
    ids[0],
    "synthetic-time-copy",
    "robocraze",
    first.source_url,
    "synthetic-fixture",
    { label: "Synthetic PostgreSQL timestamp check" },
  );
  await db().query(
    "UPDATE observations SET retrieved_at='2026-01-01T00:00:00.123456Z' WHERE id=$1",
    [first.id],
  );
  await preserveObservationTime(copied.id, first.id);
  const precision = await db().query(
    "SELECT a.retrieved_at=b.retrieved_at AS same FROM observations a, observations b WHERE a.id=$1 AND b.id=$2",
    [first.id, copied.id],
  );
  check(
    precision.rows[0].same === true,
    "cached observations preserve exact PostgreSQL source timestamps",
  );
  const claims = await Promise.all(owners.map((owner) => claimJob(owner)));
  check(
    claims.filter(Boolean).length === 1 && claims.find(Boolean)?.id === ids[0],
    "two workers cannot claim the same PostgreSQL job concurrently",
  );
  const previousOwner = owners[claims.findIndex(Boolean)];
  await db().query(
    "UPDATE quotes SET lease_until=now()-interval '1 second' WHERE id=$1",
    [ids[0]],
  );
  const replacementOwner = randomUUID();
  const recovered = await claimJob(replacementOwner);
  check(
    recovered?.id === ids[0] && recovered.attempts === 2,
    "expired PostgreSQL leases are recovered with an incremented attempt count",
  );
  const staleLease = {
    id: ids[0],
    owner: previousOwner,
    attempt: 1,
    signal: new AbortController().signal,
  };
  const replacementLease = {
    id: ids[0],
    owner: replacementOwner,
    attempt: 2,
    signal: new AbortController().signal,
  };
  await saveResult(ids[0], demoQuote(input), replacementLease);
  let rejectedWrites = 0;
  for (const write of [
    () =>
      saveResult(
        ids[0],
        { ...demoQuote(input), explanation: "stale overwrite" },
        staleLease,
      ),
    () => normalizeObservation(first.id, { stale: true }, staleLease),
    () =>
      saveObservation(
        ids[0],
        "stale-write",
        "robu",
        first.source_url,
        "synthetic-fixture",
        {},
        null,
        staleLease,
      ),
  ]) {
    try {
      await write();
    } catch (error) {
      if (!(error instanceof LeaseLost)) throw error;
      rejectedWrites++;
    }
  }
  check(
    rejectedWrites === 3 &&
      (await getJob(ids[0]))?.result?.explanation !== "stale overwrite",
    "stale workers cannot write results, normalized evidence or observations after takeover",
  );
  check(
    !(await completeJob(ids[0], previousOwner, "complete")) &&
      (await completeJob(ids[0], replacementOwner, "partial")),
    "a stale worker cannot finish a job after its lease changes owner",
  );
  const second = await saveObservation(
    ids[0],
    "synthetic-test",
    "robocraze",
    first.source_url,
    "synthetic-fixture",
    { label: "Replacement must not overwrite original", value: 2 },
  );
  check(
    first.id === second.id &&
      (second.original as { value: number }).value === 1,
    "saved observations preserve their first original response",
  );
  await normalizeObservation(first.id, { synthetic: true });
  check(
    (await observation(ids[0], "synthetic-test"))?.normalized !== null,
    "normalized evidence survives PostgreSQL persistence",
  );
  await saveResult(ids[0], demoQuote(input));
  check(
    (await getJob(ids[0]))?.result?.plans[0].totalPaise === 29500,
    "calculated sample result survives PostgreSQL persistence",
  );
  const worker = randomUUID();
  await db().query("INSERT INTO worker_heartbeats(worker_id) VALUES($1)", [
    worker,
  ]);
  check(
    (
      await db().query(
        "SELECT EXISTS(SELECT 1 FROM worker_heartbeats WHERE worker_id=$1 AND last_seen>now()-interval '45 seconds') AS present",
        [worker],
      )
    ).rows[0].present,
    "PostgreSQL worker heartbeat query detects recent presence",
  );
  await db().query("DELETE FROM worker_heartbeats WHERE worker_id=$1", [
    worker,
  ]);
  await db().query("DELETE FROM observations WHERE quote_id=$1", [ids[0]]);
  await db().query("DELETE FROM quotes WHERE id=$1", [ids[0]]);
  await db().query("DELETE FROM rate_events WHERE actor=$1", [actor]);
} finally {
  await db().end();
}
