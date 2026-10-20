import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const basePath =
  process.env.PAGES_BASE_PATH || "/PartsRoute---Every-Part-One-Complete-Cost.";
if (!/^\/[A-Za-z0-9._-]+$/.test(basePath)) {
  throw new Error(
    "PAGES_BASE_PATH must be one repository path, beginning with /.",
  );
}
await mkdir(join(root, ".pages-build"), { recursive: true });
const project = await mkdtemp(join(root, ".pages-build", "site-"));
await mkdir(join(project, "src", "app"), { recursive: true });
// Only public UI/domain sources and synthetic data enter this build. Never copy
// server adapters, API routes, .env files, evidence originals or provider keys.
for (const name of [
  "layout.tsx",
  "page.tsx",
  "workspace.tsx",
  "globals.css",
  "ui-icons.tsx",
]) {
  await cp(join(root, "src", "app", name), join(project, "src", "app", name));
}
await cp(join(root, "src", "domain"), join(project, "src", "domain"), {
  recursive: true,
});
await mkdir(join(project, "fixtures"), { recursive: true });
await cp(
  join(root, "fixtures", "synthetic-catalogue.json"),
  join(project, "fixtures", "synthetic-catalogue.json"),
);
for (const name of ["package.json", "postcss.config.mjs", "tsconfig.json"]) {
  await cp(join(root, name), join(project, name));
}
await writeFile(
  join(project, "next.config.mjs"),
  `export default ${JSON.stringify({
    output: "export",
    basePath,
    trailingSlash: true,
    poweredByHeader: false,
    outputFileTracingRoot: root,
    env: { NEXT_PUBLIC_STATIC_DEMO: "true", NEXT_PUBLIC_BASE_PATH: basePath },
  })};\n`,
);
const built = spawnSync(
  process.execPath,
  [
    join(root, "node_modules", "next", "dist", "bin", "next"),
    "build",
    project,
    "--webpack",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  },
);
if (built.status !== 0) process.exit(built.status || 1);
const directory = join(project, "out");
await writeFile(join(directory, ".nojekyll"), "");
await mkdir(join(root, "artifacts"), { recursive: true });
await writeFile(
  join(root, "artifacts", "pages-build.json"),
  JSON.stringify({ directory, basePath }, null, 2),
);
const home = await readFile(join(directory, "index.html"), "utf8");
if (
  !home.includes("GitHub Pages demo") ||
  !home.includes(`${basePath}/_next/`)
) {
  throw new Error(
    "Static export is missing its demo label or repository asset prefix.",
  );
}
console.log(`GitHub Pages export: ${directory}`);
