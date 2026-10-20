import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const record = "artifacts/public-preview.json";
const local = "http://127.0.0.1:3000";
const validOrigin = (value) =>
  /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(value);
async function healthy(origin, timeout = 4000) {
  try {
    const response = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(timeout),
    });
    return response.ok && (await response.json()).service === "PartsRoute";
  } catch {
    return false;
  }
}
if (!(await healthy(local)))
  throw new Error(
    "Start the PartsRoute web service, PostgreSQL and worker first.",
  );
await mkdir("artifacts", { recursive: true });
const old = JSON.parse(await readFile(record, "utf8").catch(() => "null"));
if (
  old?.state === "ready" &&
  validOrigin(old.origin) &&
  (await healthy(old.origin))
) {
  console.log(
    JSON.stringify({ origin: old.origin, kind: "temporary", reused: true }),
  );
} else {
  const binary = process.env.CLOUDFLARED_PATH || "cloudflared";
  if (process.env.CLOUDFLARED_PATH && !existsSync(binary))
    throw new Error(
      "CLOUDFLARED_PATH does not exist. Install cloudflared from Cloudflare's official downloads.",
    );
  const child = spawn(
    binary,
    ["tunnel", "--no-autoupdate", "--protocol", "http2", "--url", local],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let origin = null;
  let stopping = false;
  let pending = "";
  let writes = Promise.resolve();
  function collect(chunk) {
    const text = chunk.toString();
    writes = writes.then(() =>
      appendFile("artifacts/public-preview.log", text),
    );
    pending = (pending + text).slice(-12000);
    const found = pending.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (found && validOrigin(found[0]) && !origin) {
      origin = found[0];
      void announce();
    }
  }
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  async function announce() {
    const readyDeadline = Date.now() + 90000;
    while (Date.now() < readyDeadline && !stopping) {
      if (await healthy(origin)) {
        await writeFile(
          record,
          JSON.stringify(
            {
              state: "ready",
              kind: "temporary",
              origin,
              startedAt: new Date().toISOString(),
              pid: child.pid,
            },
            null,
            2,
          ),
        );
        console.log(
          JSON.stringify({
            origin,
            kind: "temporary",
            dependsOnThisComputer: true,
          }),
        );
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.error(
      "The preview URL is not verified yet; the tunnel remains running. Check artifacts/public-preview.log and test /api/health before publishing it.",
    );
    if (!stopping)
      await writeFile(
        record,
        JSON.stringify(
          { state: "unverified", kind: "temporary", origin },
          null,
          2,
        ),
      );
  }
  child.once("error", () => {
    console.error("Could not start cloudflared. Check its installation path.");
    process.exitCode = 1;
  });
  child.once("close", async () => {
    stopping = true;
    await writes;
    await writeFile(
      record,
      JSON.stringify(
        {
          state: "stopped",
          kind: "temporary",
          origin,
          stoppedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      stopping = true;
      child.kill();
    });
  const startup = setTimeout(() => {
    if (!origin) {
      console.error(
        "Cloudflare did not return a preview URL within 45 seconds.",
      );
      child.kill();
    }
  }, 45000);
  startup.unref();
}
