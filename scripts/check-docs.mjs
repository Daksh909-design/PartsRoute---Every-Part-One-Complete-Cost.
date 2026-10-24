import { readFile, readdir, access } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? markdownFiles(path)
        : path.endsWith(".md")
          ? [path]
          : [];
    }),
  );
  return groups.flat();
}
const files = [
  join(root, "README.md"),
  ...(await markdownFiles(join(root, "docs"))),
];
const failures = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const match of text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = resolve(
      dirname(file),
      decodeURIComponent(target.split("#")[0]),
    );
    try {
      await access(path);
    } catch {
      failures.push(`${file.slice(root.length + 1)}: ${target}`);
    }
  }
}
if (failures.length) {
  console.error("Broken documentation links:\n" + failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(`Documentation links checked in ${files.length} Markdown files.`);
