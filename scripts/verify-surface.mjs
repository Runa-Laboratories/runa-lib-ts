import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
console.log("surface: PASS");
