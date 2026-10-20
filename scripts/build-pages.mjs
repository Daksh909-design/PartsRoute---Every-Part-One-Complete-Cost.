import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const record = join(root, "artifacts/pages-build.json");
const finishOnly = process.argv.includes("--finish");
let state;
if (finishOnly) state = JSON.parse(await readFile(record, "utf8"));
else {
  const basePath =
    process.env.PAGES_BASE_PATH ??
    "/PartsRoute---Every-Part-One-Complete-Cost.";
  const backend = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  if (basePath !== "" && !/^\/[A-Za-z0-9._-]+$/.test(basePath))
    throw new Error(
      "PAGES_BASE_PATH must be empty or one repository path beginning with /.",
    );
  if (backend) {
    const url = new URL(backend);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error(
        "NEXT_PUBLIC_API_BASE_URL must be an HTTPS origin without credentials, paths or query strings.",
      );
  }
  await mkdir(join(root, ".pages-build"), { recursive: true });
  const directory = await mkdtemp(join(root, ".pages-build/site-"));
  state = {
    directory,
    basePath,
    backend,
    complete: false,
    metafile: join(root, "artifacts", "pages-bundle-meta.json"),
  };
  await mkdir(join(root, "artifacts"), { recursive: true });
  await writeFile(record, JSON.stringify(state, null, 2));
}
const outdir = join(state.directory, "assets");
const define = {
  "process.env.NODE_ENV": JSON.stringify("production"),
  "process.env.NEXT_PUBLIC_STATIC_DEMO": JSON.stringify("true"),
  "process.env.NEXT_PUBLIC_BASE_PATH": JSON.stringify(state.basePath),
  "process.env.NEXT_PUBLIC_API_BASE_URL": JSON.stringify(state.backend),
};
if (process.argv.includes("--prepare")) {
  // The native CLI can consume the same arguments when the host cannot start
  // the JS API's subprocess. Neither build path reads private .env files.
  const args = [
    "scripts/pages-entry.tsx",
    "--bundle",
    "--format=esm",
    "--platform=browser",
    "--target=es2022",
    "--minify",
    "--jsx=automatic",
    `--outdir=${outdir}`,
    "--entry-names=[name]-[hash]",
    `--metafile=${state.metafile}`,
    ...Object.entries(define).map(([key, value]) => `--define:${key}=${value}`),
  ];
  await writeFile(
    join(root, "artifacts/pages-cli-args.json"),
    JSON.stringify(args, null, 2),
  );
  console.log(
    "Static build prepared; compile with the generated esbuild arguments, then run this script with --finish.",
  );
  process.exit(0);
}
if (!finishOnly) {
  const { build } = await import("esbuild");
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["scripts/pages-entry.tsx"],
    outdir,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    jsx: "automatic",
    entryNames: "[name]-[hash]",
    define,
    metafile: true,
    legalComments: "eof",
  });
  await writeFile(state.metafile, JSON.stringify(result.metafile));
}
const meta = JSON.parse(await readFile(state.metafile, "utf8"));
for (const input of Object.keys(meta.inputs)) {
  if (
    !/^(node_modules\/|src\/app\/|src\/domain\/|fixtures\/synthetic-catalogue\.json$|scripts\/pages-entry\.tsx$)/.test(
      input.replaceAll("\\", "/"),
    )
  )
    throw new Error(`Unexpected browser dependency: ${input}`);
  if (/src\/app\/api\//.test(input))
    throw new Error("API routes must never enter a Pages bundle.");
}
const entry = Object.entries(meta.outputs).find(
  ([, output]) => output.entryPoint === "scripts/pages-entry.tsx",
);
if (!entry) throw new Error("No browser entry point built.");
const scriptPath = relative(
  state.directory,
  resolve(root, entry[0]),
).replaceAll("\\", "/");
if (scriptPath.startsWith("..") || !scriptPath.endsWith(".js"))
  throw new Error("Browser bundle is outside the export directory.");
// The workspace uses ordinary CSS rules; the separate Pages target does not
// need Next.js or Tailwind's build process to serve these shared styles.
const css = (await readFile(join(root, "src/app/globals.css"), "utf8")).replace(
  /^@import\s+["']tailwindcss["'];\s*/,
  "",
);
const styleName = `styles-${createHash("sha256").update(css).digest("hex").slice(0, 12)}.css`;
await writeFile(join(outdir, styleName), css);
const home = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#155d48"><title>PartsRoute · Every part. One complete cost.</title><meta name="description" content="Compare complete electronics baskets, including packs, shipping and tax. Labelled sample calculator; live collection requires a server."><link rel="stylesheet" href="${state.basePath}/assets/${styleName}"><script type="module" src="${state.basePath}/${scriptPath}"></script></head><body><div id="root"><main class="app-shell"><h1>PartsRoute</h1><p>Loading the sample calculator…</p></main></div><noscript>Enable JavaScript to calculate the sample. No live offers have been collected.</noscript></body></html>`;
await writeFile(join(state.directory, "index.html"), home);
await writeFile(join(state.directory, "404.html"), home);
await writeFile(join(state.directory, ".nojekyll"), "");
await writeFile(
  record,
  JSON.stringify(
    {
      ...state,
      complete: true,
      scriptPath,
      inputs: Object.keys(meta.inputs).length,
    },
    null,
    2,
  ),
);
console.log(`GitHub Pages sample built: ${state.directory}`);
