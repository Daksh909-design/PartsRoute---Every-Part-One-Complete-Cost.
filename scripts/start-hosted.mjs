import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// A small host can share one instance between the web and collection processes.
// Both stop together, so the host can recover the entire app after a failure.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "3000";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error("PORT must be a valid TCP port.");
const aiKey =
  process.env.AI_PROVIDER === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
for (const key of ["DATABASE_URL", "TINYFISH_API_KEY", aiKey])
  if (!process.env[key]) throw new Error(`Configure ${key} before starting.`);
if ((process.env.APP_ACCESS_TOKEN || "").length < 24)
  throw new Error("APP_ACCESS_TOKEN must contain at least 24 characters.");

const children = new Set();
let stopping = false;
let killTimer;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  if (children.size) {
    killTimer = setTimeout(() => {
      for (const child of children) child.kill("SIGKILL");
    }, 10000);
    killTimer.unref();
  }
}
process.once("SIGTERM", () => stop(0));
process.once("SIGINT", () => stop(0));

function launch(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(child);
  child.once("error", () => {
    console.error(`${name} could not start.`);
    stop(1);
  });
  child.once("close", () => {
    children.delete(child);
    if (!children.size) clearTimeout(killTimer);
    if (name !== "migration" && !stopping) {
      console.error(
        `${name} stopped; stopping the other service for recovery.`,
      );
      stop(1);
    }
  });
  return child;
}

const migration = launch("migration", [
  "--import",
  "tsx",
  "scripts/migrate.ts",
]);
const migrationCode = await new Promise((done) => {
  migration.once("close", done);
  migration.once("error", () => done(1));
});
if (migrationCode !== 0) stop(1);
if (!stopping) {
  launch("worker", ["--import", "tsx", "src/worker.ts"]);
  launch("web", [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    port,
  ]);
  console.log(
    "PartsRoute web and worker started. Runtime secrets stay on the host.",
  );
}
