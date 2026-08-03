import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { containsProhibitedMarker } from "../dist/internal/boundary-policy.js";

const ignored = new Set([".git", "node_modules", "coverage"]);
const canonicalContractRoot = path.resolve("contracts");
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.endsWith(".tgz")) continue;
    const target = path.join(directory, entry.name);
    // The immutable submodule is separately verified by contract:verify. Its
    // accepted source PRD intentionally documents a synthetic Bearer example.
    if (path.resolve(target) === canonicalContractRoot) continue;
    if (entry.isDirectory()) await walk(target);
    else files.push(target);
  }
}
await walk(".");
const credentialPrefix = ["runa", "sk"].join("_") + "_";
const secretPatterns = [
  new RegExp(`${credentialPrefix}[A-Za-z0-9_-]{16,}`, "g"),
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /Authorization\s*[:=]\s*Bearer\s+\S+/gi
];
const failures = [];
for (const file of files) {
  const bytes = await readFile(file);
  if (bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  if (containsProhibitedMarker(text)) failures.push({ category: "boundary-marker", path: file });
  if (secretPatterns.some((pattern) => (pattern.lastIndex = 0, pattern.test(text)))) {
    failures.push({ category: "credential-material", path: file });
  }
}
if (failures.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}
console.log(`security: PASS (${files.length} files)`);
