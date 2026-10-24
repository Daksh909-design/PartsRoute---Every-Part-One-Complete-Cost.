import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type { QuoteInput, QuoteResult } from "../domain/schema";
import type { Usage } from "./ai";
import { NORMALIZATION_VERSION } from "../domain/normalization";
import { LeaseLost, type JobLease } from "./lease";

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
export class RequestLimit extends Error {
  constructor(
    message: string,
    public retryAfterSeconds = 300,
  ) {
    super(message);
  }
}
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
      "SELECT id FROM quotes WHERE idempotency_key=$1 UNION ALL SELECT quote_id AS id FROM quote_requests WHERE request_key=$1 LIMIT 1",
      [key],
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      return existing.rows[0].id;
    }
    // A refreshed page has a new request key. Recover identical work that is
    // still running for this team, rather than queueing another long paid run.
    const active = await client.query(
      "SELECT id FROM quotes WHERE actor=$1 AND input=$2::jsonb AND status IN ('queued','processing') ORDER BY created_at LIMIT 1",
      [actor, JSON.stringify(input)],
    );
    if (active.rowCount) {
      await client.query(
        "INSERT INTO quote_requests(request_key,quote_id) VALUES($1,$2)",
        [key, active.rows[0].id],
      );
      await client.query("COMMIT");
      return active.rows[0].id;
    }
    const recent = await client.query(
      "SELECT count(*)::int AS n, COALESCE(CEIL(EXTRACT(EPOCH FROM (min(created_at)+interval '1 hour'-now()))),1)::int AS retry_after FROM rate_events WHERE actor=$1 AND created_at>now()-interval '1 hour'",
      [actor],
    );
    const queued = await client.query(
      "SELECT count(*)::int AS n FROM quotes WHERE status IN ('queued','processing')",
    );
    const hourlyLimit = Number(process.env.LIVE_QUOTES_PER_HOUR ?? "6");
    if (!Number.isSafeInteger(hourlyLimit) || hourlyLimit < 0)
      throw new Error("LIVE_QUOTES_PER_HOUR must be a nonnegative integer.");
    if (hourlyLimit > 0 && recent.rows[0].n >= hourlyLimit) {
      const waitSeconds = Math.max(1, recent.rows[0].retry_after);
      throw new RequestLimit(
        `Live quote limit reached: ${hourlyLimit} new quotes per team per rolling hour. Try again in about ${Math.ceil(waitSeconds / 60)} minute(s). Sample calculations and saved observations are still available.`,
        waitSeconds,
      );
    }
    if (queued.rows[0].n >= 3)
      throw new RequestLimit(
        "Three live quotes are already queued or running. Wait for one to finish, or resume your existing quote.",
        30,
      );
    const id = randomUUID();
    await client.query(
      "INSERT INTO quotes(id,idempotency_key,input,status,actor) VALUES($1,$2,$3,'queued',$4)",
      [id, key, JSON.stringify(input), actor],
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
export async function phase(id: string, message: string, lease?: JobLease) {
  await writeForLease(
    lease,
    "UPDATE quotes SET phase=$2,updated_at=now() WHERE id=$1",
    [id, message],
  );
}
export async function saveResult(
  id: string,
  result: QuoteResult,
  lease?: JobLease,
) {
  await writeForLease(
    lease,
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
  lease?: JobLease,
): Promise<Observation> {
  const id = randomUUID();
  return (
    await writeForLease(
      lease,
      "INSERT INTO observations(id,quote_id,operation_key,retailer,source_url,method,run_id,original) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(quote_id,operation_key) DO UPDATE SET original=observations.original RETURNING *",
      [id, jobId, key, retailer, url, method, runId, JSON.stringify(original)],
    )
  ).rows[0];
}
export async function normalizeObservation(
  id: string,
  normalized: unknown,
  lease?: JobLease,
) {
  await writeForLease(
    lease,
    "UPDATE observations SET normalized=$2,normalization_version=$3,normalized_at=now() WHERE id=$1",
    [id, JSON.stringify(normalized), NORMALIZATION_VERSION],
  );
}
export async function preserveObservationTime(
  copyId: string,
  sourceId: string,
  lease?: JobLease,
) {
  // Preserve PostgreSQL's microseconds. Round-tripping through JS Date loses
  // precision and can make an old normalization appear newer than its copy.
  await writeForLease(
    lease,
    "UPDATE observations copy SET retrieved_at=source.retrieved_at FROM observations source WHERE copy.id=$1 AND source.id=$2",
    [copyId, sourceId],
  );
}

// Hold the quote row only for a short database mutation, never a provider call.
// The lock makes the ownership check and write atomic with a replacement claim.
export async function writeForLease(
  lease: JobLease | undefined,
  text: string,
  values: unknown[],
) {
  if (!lease) return db().query(text, values); // Explicit operator scripts and fixtures.
  lease.signal.throwIfAborted();
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query(
      "SELECT id FROM quotes WHERE id=$1 AND lease_owner=$2 AND attempts=$3 AND status='processing' AND lease_until>now() FOR UPDATE",
      [lease.id, lease.owner, lease.attempt],
    );
    if (!owned.rowCount) throw new LeaseLost();
    lease.signal.throwIfAborted();
    const result = await client.query(text, values);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
