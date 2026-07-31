import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const module = await import("../dist/index.js");
assert.deepEqual(Object.keys(module).sort(), [
  "ApiError", "CommandError", "ConfigError", "Runa", "RunaError", "Session",
  "stderrText", "stdoutText"
]);
const manifest = JSON.parse(await readFile("docs/reference-manifest.json", "utf8"));
const declaration = await readFile("dist/index.d.ts", "utf8");
for (const name of [...manifest.runtime, ...manifest.types]) {
  assert.match(declaration, new RegExp(`\\b${name}\\b`));
}
const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert.deepEqual(Object.keys(pkg.exports), ["."]);
assert.equal("default" in pkg.exports["."], false);
assert.equal("require" in pkg.exports["."], false);
await writeFile("evidence/export-snapshot.json", `${JSON.stringify({
  schema_version: 1,
  status: "PASS",
  runtime_exports: Object.keys(module).sort(),
  type_exports: [...manifest.types].sort(),
  package_exports: pkg.exports,
  default_export: false,
  commonjs_entry: false,
  subpath_exports: false
}, null, 2)}\n`);
console.log("surface: PASS");
