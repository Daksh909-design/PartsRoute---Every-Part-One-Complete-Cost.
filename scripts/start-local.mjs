import { spawn } from "node:child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  createWriteStream,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (!existsSync(".env.local"))
  throw new Error(
    "Copy .env.example to .env.local and fill your private keys first.",
  );
const privateEnv = parseEnv(readFileSync(".env.local", "utf8"));
const existing = await fetch("http://127.0.0.1:3000/api/health", {
  signal: AbortSignal.timeout(1000),
})
  .then((response) => response.json())
  .catch(() => null);
if (existing?.service === "PartsRoute") {
  console.log(
    "PartsRoute is already running: http://localhost:3000. No duplicate services were started.",
  );
  process.exit(0);
}
if (
  !privateEnv.TINYFISH_API_KEY ||
  !(privateEnv.AI_PROVIDER === "openai"
    ? privateEnv.OPENAI_API_KEY
    : privateEnv.GEMINI_API_KEY)
)
  throw new Error(
    "Enter the TinyFish and selected AI keys in .env.local first.",
  );
if ((privateEnv.APP_ACCESS_TOKEN || "").length < 24)
  throw new Error("APP_ACCESS_TOKEN must contain at least 24 characters.");
const secrets = Object.entries(privateEnv)
  .filter(([name, value]) => value && /KEY|TOKEN|DATABASE_URL/.test(name))
  .map(([, value]) => value);
function sanitize(data) {
  let text = String(data);
  for (const secret of secrets) text = text.replaceAll(secret, "[private]");
  return text;
}
mkdirSync("artifacts/local-run", { recursive: true });
const children = new Set();
let closing = false;
function launch(name, args) {
  const log = createWriteStream(
    join(root, "artifacts/local-run", `${name}.log`),
    { flags: "w" },
  );
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      ...(process.platform === "win32"
        ? { PARTSROUTE_BUILD_THREADS: "1" }
        : {}),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      const safe = sanitize(chunk);
      log.write(safe);
      if (name !== "web" && name !== "worker") process.stdout.write(safe);
    });
  child.on("error", () => {
    console.error(
      `${name} could not start. Run this launcher in your own terminal, outside the coding runtime.`,
    );
  });
  child.on("close", () => {
    children.delete(child);
    log.end();
  });
  return child;
}
async function run(name, args) {
  const child = launch(name, args);
  const code = await new Promise((resolve) => {
    child.once("close", resolve);
    child.once("error", () => resolve(1));
  });
  if (code !== 0)
    throw new Error(`${name} failed. See artifacts/local-run/${name}.log.`);
}
async function stop() {
  closing = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid) {
      const killer = spawn(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      await new Promise((resolve) => {
        killer.once("close", resolve);
        killer.once("error", resolve);
      });
    } else child.kill("SIGTERM");
  }
}
process.once("SIGINT", () => {
  void stop().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void stop().finally(() => process.exit(0));
});
try {
  if (existsSync("artifacts/local-db.json"))
    await run("database", ["scripts/local-db.mjs", "start"]);
  await run("migrate", [
    "--import",
    "tsx",
    "--env-file=.env.local",
    "scripts/migrate.ts",
  ]);
  await run("build", ["node_modules/next/dist/bin/next", "build", "--webpack"]);
  const web = launch("web", [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
  ]);
  const worker = launch("worker", [
    "--import",
    "tsx",
    "--env-file=.env.local",
    "src/worker.ts",
  ]);
  for (const child of [web, worker])
    child.once("close", (code) => {
      if (!closing) {
        closing = true;
        console.error(
          `A service stopped (exit ${code}). Check artifacts/local-run logs.`,
        );
        void stop().finally(() => process.exit(1));
      }
    });
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if (
        (
          await fetch("http://127.0.0.1:3000/api/health", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      ) {
        console.log(
          "PartsRoute: http://localhost:3000 — leave this terminal open. Press Ctrl+C to stop web and worker.",
        );
        console.log(
          "Choose Live quote and enter APP_ACCESS_TOKEN from .env.local. Provider keys stay server-side.",
        );
        break;
      }
    } catch {}
    if (attempt === 39)
      throw new Error(
        "Web startup timed out. Check artifacts/local-run/web.log.",
      );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
} catch (error) {
  console.error(error.message);
  await stop();
  process.exitCode = 1;
}
