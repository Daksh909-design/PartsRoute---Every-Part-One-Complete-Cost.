import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { parseEnv } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const envPath = join(root, ".env.local");
let text = await readFile(
  existsSync(envPath) ? envPath : ".env.example",
  "utf8",
);
const config = parseEnv(text);
function set(name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  text = pattern.test(text)
    ? text.replace(pattern, () => line)
    : `${text}\n${line}\n`;
}
if (!config.APP_ACCESS_TOKEN)
  set("APP_ACCESS_TOKEN", randomBytes(32).toString("hex"));

const binOption = process.argv.indexOf("--postgres-bin");
if (binOption !== -1) {
  const bin = resolve(process.argv[binOption + 1] || "");
  const initdb = join(
    bin,
    process.platform === "win32" ? "initdb.exe" : "initdb",
  );
  if (!existsSync(initdb))
    throw new Error(
      "--postgres-bin must point to a PostgreSQL bin directory containing initdb.",
    );
  const recordPath = join(root, "artifacts", "local-db.json");
  await mkdir("artifacts", { recursive: true });
  let local;
  if (existsSync(recordPath)) {
    local = JSON.parse(await readFile(recordPath, "utf8"));
    if (local.bin !== bin)
      throw new Error(
        "A local database is already configured with another binary directory. Keep its current configuration or use DATABASE_URL.",
      );
  } else {
    const port = await new Promise((resolvePort, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        server.close(() => resolvePort(address.port));
      });
    });
    local = {
      bin,
      data: join(root, "artifacts", "postgres"),
      passwordFile: join(root, "artifacts", "postgres-password"),
      port,
    };
    await writeFile(local.passwordFile, randomBytes(32).toString("hex"), {
      mode: 0o600,
    });
    await writeFile(recordPath, JSON.stringify(local, null, 2), {
      mode: 0o600,
    });
  }
  if (!existsSync(join(local.data, "PG_VERSION"))) {
    const result = spawnSync(
      initdb,
      [
        "-D",
        local.data,
        "-U",
        "partsroute",
        "-A",
        "scram-sha-256",
        "--pwfile",
        local.passwordFile,
        "--encoding=UTF8",
        "--no-locale",
      ],
      { windowsHide: true, encoding: "utf8" },
    );
    if (result.status !== 0)
      throw new Error(
        `PostgreSQL initialization failed: ${result.stderr || result.error?.message || "inspect the binary installation"}`,
      );
    await writeFile(
      join(local.data, "postgresql.auto.conf"),
      `listen_addresses = '127.0.0.1'\nport = ${local.port}\n`,
    );
  }
  const password = (await readFile(local.passwordFile, "utf8")).trim();
  if (
    !config.DATABASE_URL ||
    config.DATABASE_URL ===
      parseEnv(await readFile(".env.example", "utf8")).DATABASE_URL
  ) {
    set(
      "DATABASE_URL",
      `postgresql://partsroute:${encodeURIComponent(password)}@127.0.0.1:${local.port}/partsroute`,
    );
    set(
      "TEST_DATABASE_URL",
      `postgresql://partsroute:${encodeURIComponent(password)}@127.0.0.1:${local.port}/partsroute_test`,
    );
  }
  console.log(
    `Local PostgreSQL configured on loopback port ${local.port}. Run pnpm local:db start next.`,
  );
}
await writeFile(envPath, text, { mode: 0o600 });
console.log(
  "Private .env.local is ready. Fill provider keys there; your generated team token is in APP_ACCESS_TOKEN. No secrets were printed.",
);
