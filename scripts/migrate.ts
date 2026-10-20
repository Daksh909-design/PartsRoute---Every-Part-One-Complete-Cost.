import { readdir, readFile } from "node:fs/promises";
import { db } from "../src/server/db";
const client = await db().connect();
try {
  await client.query("BEGIN");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('partsroute-migrate'))",
  );
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      (
        await client.query("SELECT name FROM schema_migrations WHERE name=$1", [
          name,
        ])
      ).rowCount
    )
      continue;
    await client.query(await readFile(`db/migrations/${name}`, "utf8"));
    await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
      name,
    ]);
    console.log(`Applied ${name}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await db().end();
}
