import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { sampleParts } from "../src/domain/catalogue";
import { enqueue, db, saveResult } from "../src/server/db";
import { processQuote } from "../src/server/pipeline";
import { aiConfig } from "../src/server/ai-provider";
for (const key of ["DATABASE_URL", "TINYFISH_API_KEY", aiConfig().keyName])
  if (!process.env[key])
    throw new Error(`${key} is missing. No live validation performed.`);
const input = {
  parts: sampleParts,
  pincode: process.argv[2] || "560001",
  mode: "live" as const,
  refresh: true,
};
const id = await enqueue(input, randomUUID(), "live-validation-cli");
await db().query(
  "UPDATE quotes SET status='processing',attempts=1,lease_until=now()+interval '30 minutes' WHERE id=$1",
  [id],
);
try {
  const result = await processQuote(id, input);
  await saveResult(id, result);
  await db().query(
    "UPDATE quotes SET status=$2,phase='CLI validation finished',lease_until=NULL WHERE id=$1",
    [id, result.recommendedId ? "complete" : "partial"],
  );
  await mkdir("artifacts", { recursive: true });
  await writeFile(`artifacts/live-${id}.json`, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        quoteId: id,
        coverage: result.coverage,
        completeVerifiedPlan: Boolean(result.recommendedId),
        errors: result.errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await db().query(
    "UPDATE quotes SET status='failed',lease_until=NULL WHERE id=$1",
    [id],
  );
  throw error;
} finally {
  await db().end();
}
