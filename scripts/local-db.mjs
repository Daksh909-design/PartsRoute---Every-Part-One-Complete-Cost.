import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executable = (name) =>
  join(config.bin, process.platform === "win32" ? `${name}.exe` : name);
const config = JSON.parse(
  await readFile(join(root, "artifacts", "local-db.json"), "utf8"),
);
const action = process.argv[2] || "status";
if (!["start", "stop", "status"].includes(action))
  throw new Error("Use start, stop or status.");
const command =
  action === "start"
    ? ["-D", config.data, "-l", join(config.data, "server.log"), "-w", "start"]
    : action === "stop"
      ? ["-D", config.data, "-m", "fast", "-w", "stop"]
      : ["-D", config.data, "status"];
const alreadyRunning =
  action === "start" &&
  spawnSync(executable("pg_ctl"), ["-D", config.data, "status"], {
    stdio: "ignore",
    windowsHide: true,
  }).status === 0;
const run = alreadyRunning
  ? { status: 0 }
  : spawnSync(executable("pg_ctl"), command, {
      stdio: "inherit",
      windowsHide: true,
      timeout: 45000,
    });
if (run.status !== 0) {
  console.error(
    "Database command did not complete. Run this helper from your own Windows terminal, outside the coding sandbox.",
  );
  process.exit(run.status || 1);
}
if (action === "start") {
  const password = (await readFile(config.passwordFile, "utf8")).trim();
  const connection = {
    host: "127.0.0.1",
    port: config.port,
    user: "partsroute",
    password,
  };
  const client = new pg.Client({
    ...connection,
    database: "postgres",
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    for (const name of ["partsroute", "partsroute_test"]) {
      if (
        !(
          await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [
            name,
          ])
        ).rowCount
      )
        await client.query(`CREATE DATABASE ${name}`);
    }
  } finally {
    await client.end();
  }
  const path = join(root, ".env.local");
  const original = await readFile(path, "utf8");
  const defaultLine =
    "DATABASE_URL=postgresql://partsroute:partsroute@localhost:5432/partsroute";
  if (original.includes(defaultLine))
    await writeFile(
      path,
      original.replace(
        defaultLine,
        `DATABASE_URL=postgresql://partsroute:${encodeURIComponent(password)}@127.0.0.1:${config.port}/partsroute`,
      ),
    );
  console.log(
    `Local project and test databases ready on 127.0.0.1:${config.port}. No database password was printed. Run pnpm db:migrate next.`,
  );
}
