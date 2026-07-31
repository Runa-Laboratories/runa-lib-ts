import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["src", "test", "scripts", "examples"];
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (/\.(?:ts|mjs)$/.test(entry.name)) files.push(target);
  }
}
for (const root of roots) await walk(root);
for (const file of files) {
  const text = await readFile(file, "utf8");
  if (/\r(?!\n)/.test(text) || !text.endsWith("\n")) {
    throw new Error(`Formatting check failed: ${file}`);
  }
}
console.log(`lint: PASS (${files.length} files)`);
