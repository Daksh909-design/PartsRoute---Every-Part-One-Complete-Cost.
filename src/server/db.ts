import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type { QuoteInput, QuoteResult } from "../domain/schema";
import type { Usage } from "./ai";
import { NORMALIZATION_VERSION } from "../domain/normalization";

let instance: Pool | undefined;
export function db(): Pool {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required for live quotes");
  return (instance ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 1500,
    statement_timeout: 10000,
  }));
}
export type Job = {
  id: string;
  input: QuoteInput;
  status: string;
  phase: string;
  result: QuoteResult | null;
  errors: string[];
  attempts: number;
  created_at: string;
  updated_at: string;
};
export class RequestLimit extends Error {}
export async function enqueue(
  input: QuoteInput,
  key: string,
  actor: string,
): Promise<string> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('partsroute-create'))",
    );
    const existing = await client.query(
      "SELECT id FROM quotes WHERE idempotency_key=$1",
      [key],
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      return existing.rows[0].id;
    }
    const recent = await client.query(
      "SELECT count(*)::int AS n FROM rate_events WHERE actor=$1 AND created_at>now()-interval '1 hour'",
      [actor],
    );
    const queued = await client.query(
      "SELECT count(*)::int AS n FROM quotes WHERE status IN ('queued','processing')",
    );
    if (recent.rows[0].n >= 6 || queued.rows[0].n >= 3)
      throw new RequestLimit(
        "Live quote limit reached. Please wait before trying again.",
      );
    const id = randomUUID();
    await client.query(
      "INSERT INTO quotes(id,idempotency_key,input,status) VALUES($1,$2,$3,'queued')",
      [id, key, JSON.stringify(input)],
    );
    await client.query("INSERT INTO rate_events(actor) VALUES($1)", [actor]);
    await client.query(
      "DELETE FROM rate_events WHERE created_at<now()-interval '2 days'",
    );
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function getJob(id: string): Promise<Job | null> {
  return (
    (
      await db().query(
        "SELECT id,input,status,phase,result,errors,attempts,created_at,updated_at FROM quotes WHERE id=$1",
        [id],
      )
    ).rows[0] ?? null
  );
}
export async function phase(id: string, message: string) {
  await db().query("UPDATE quotes SET phase=$2,updated_at=now() WHERE id=$1", [
    id,
    message,
  ]);
}
export async function saveResult(id: string, result: QuoteResult) {
  await db().query(
    "UPDATE quotes SET result=$2,errors=$3,updated_at=now() WHERE id=$1",
    [id, JSON.stringify(result), JSON.stringify(result.errors)],
  );
}
export async function usage(quoteId: string, u: Usage) {
  await db().query(
    "INSERT INTO provider_usage(quote_id,provider,model,request_id,input_tokens,output_tokens,details) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      quoteId,
      u.provider,
      u.model,
      u.requestId,
      u.inputTokens,
      u.outputTokens,
      JSON.stringify(u.raw),
    ],
  );
}
export type Observation = {
  id: string;
  source_url: string;
  method: string;
  run_id: string | null;
  retrieved_at: Date;
  original: unknown;
  normalized: unknown;
  normalization_version?: string | null;
  normalized_at?: Date | null;
};
export async function observation(
  jobId: string,
  key: string,
): Promise<Observation | null> {
  return (
    (
      await db().query(
        "SELECT * FROM observations WHERE quote_id=$1 AND operation_key=$2",
        [jobId, key],
      )
    ).rows[0] ?? null
  );
}
export async function saveObservation(
  jobId: string,
  key: string,
  retailer: string,
  url: string,
  method: string,
  original: unknown,
  runId: string | null = null,
): Promise<Observation> {
  const id = randomUUID();
  return (
    await db().query(
      "INSERT INTO observations(id,quote_id,operation_key,retailer,source_url,method,run_id,original) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(quote_id,operation_key) DO UPDATE SET original=observations.original RETURNING *",
      [id, jobId, key, retailer, url, method, runId, JSON.stringify(original)],
    )
  ).rows[0];
}
export async function normalizeObservation(id: string, normalized: unknown) {
  await db().query(
    "UPDATE observations SET normalized=$2,normalization_version=$3,normalized_at=now() WHERE id=$1",
    [id, JSON.stringify(normalized), NORMALIZATION_VERSION],
  );
}
export async function preserveObservationTime(
  copyId: string,
  sourceId: string,
) {
  // Preserve PostgreSQL's microseconds. Round-tripping through JS Date loses
  // precision and can make an old normalization appear newer than its copy.
  await db().query(
    "UPDATE observations copy SET retrieved_at=source.retrieved_at FROM observations source WHERE copy.id=$1 AND source.id=$2",
    [copyId, sourceId],
  );
}
