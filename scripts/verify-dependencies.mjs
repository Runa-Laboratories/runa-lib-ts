import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
  assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must use an exact pin`);
}
const audit = spawnSync("npm.cmd", ["audit", "--json"], { encoding: "utf8" });
const report = JSON.parse(audit.stdout || "{}");
const vulnerabilities = report.metadata?.vulnerabilities ?? {};
assert.equal(vulnerabilities.critical ?? 0, 0);
assert.equal(vulnerabilities.high ?? 0, 0);
await mkdir("evidence", { recursive: true });
await writeFile("evidence/dependency-audit.json", `${JSON.stringify({
  schema_version: 1,
  status: audit.status === 0 ? "PASS" : "BLOCKED",
  runtime_dependency_count: 0,
  exact_dev_pins: true,
  vulnerabilities
}, null, 2)}\n`);
if (audit.status !== 0) process.exit(audit.status ?? 1);
console.log("dependencies: PASS");
