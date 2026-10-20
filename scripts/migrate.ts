import { db } from "../src/server/db";
import { applyMigrations } from "../src/server/migrations";
try {
  await applyMigrations(db());
} finally {
  await db().end();
}
