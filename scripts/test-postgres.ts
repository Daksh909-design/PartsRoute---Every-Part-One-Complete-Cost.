import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  db,
  enqueue,
  saveObservation,
  normalizeObservation,
  observation,
  saveResult,
  getJob,
} from "../src/server/db";
import { sampleParts } from "../src/domain/catalogue";
import { demoQuote } from "../src/domain/demo";

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
    const migrated = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"],
      { env: { ...process.env, DATABASE_URL: connection }, encoding: "utf8" },
    );
    if (migrated.status !== 0)
      throw new Error(
        "Test database migration failed. Inspect the local test database; credentials are not printed.",
      );
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
  const first = await saveObservation(
    ids[0],
    "synthetic-test",
    "robocraze",
    "https://robocraze.com/products/half-breadboard",
    "synthetic-fixture",
    { label: "Synthetic PostgreSQL persistence check", value: 1 },
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
