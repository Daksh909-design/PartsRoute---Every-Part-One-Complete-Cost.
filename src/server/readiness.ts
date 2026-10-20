import { db } from "./db";
import { aiConfig } from "./ai-provider";
import { providerFingerprint } from "./provider-error";

export type Readiness = {
  ready: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
};
export async function readiness(): Promise<Readiness> {
  const ai = aiConfig();
  const checks = [
    {
      name: "TinyFish",
      ok: Boolean(process.env.TINYFISH_API_KEY),
      detail: process.env.TINYFISH_API_KEY
        ? "Server API key configured; account access is checked when collecting."
        : "Set TINYFISH_API_KEY on the server.",
    },
    {
      name: ai.name,
      ok: Boolean(process.env[ai.keyName]),
      detail: process.env[ai.keyName]
        ? "Server API key configured; model access is checked when extracting."
        : `Set ${ai.keyName} on the server.`,
    },
    {
      name: "Database",
      ok: false,
      detail: "Set DATABASE_URL and run migrations.",
    },
    {
      name: "Worker",
      ok: false,
      detail:
        "Start the background worker. It must report within the last 45 seconds.",
    },
  ];
  if (process.env.DATABASE_URL) {
    try {
      const result = await db().query(
        "SELECT EXISTS(SELECT 1 FROM worker_heartbeats WHERE last_seen > now() - interval '45 seconds') AS worker, to_regclass('public.quotes') IS NOT NULL AND to_regclass('public.observations') IS NOT NULL AND to_regclass('public.provider_operations') IS NOT NULL AS migrated, (SELECT details FROM provider_usage WHERE provider=$1 AND details->>'fingerprint'=$2 AND created_at>now()-interval '5 minutes' ORDER BY id DESC LIMIT 1) AS provider_check",
        [
          ai.provider,
          providerFingerprint(
            ai.provider,
            ai.model,
            process.env[ai.keyName] || "",
          ),
        ],
      );
      const providerCheck = result.rows[0].provider_check;
      if (providerCheck?.state === "blocked")
        checks[1] = {
          name: ai.name,
          ok: false,
          detail: `${providerCheck.detail} Further live quotes are blocked for five minutes to avoid repeated failed calls. A changed key or model is checked separately.`,
        };
      else if (providerCheck?.state === "responded")
        checks[1].detail =
          "The configured model recently responded. Product matching and complete basket verification are separate checks.";
      checks[2] = {
        name: "Database",
        ok: result.rows[0].migrated === true,
        detail: result.rows[0].migrated
          ? "Connected and migrated."
          : "Run database migrations.",
      };
      checks[3] = {
        name: "Worker",
        ok: result.rows[0].worker === true,
        detail: result.rows[0].worker
          ? "Worker heartbeat received."
          : "No recent worker heartbeat. Start or restart the worker.",
      };
    } catch {
      checks[2].detail =
        "Cannot read the live schema. Check database access and run migrations.";
    }
  }
  return { ready: checks.every((check) => check.ok), checks };
}
