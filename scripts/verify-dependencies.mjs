import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
  assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must use an exact pin`);
}
assert.equal(pkg.devDependencies.vitest, "3.2.7");
assert.equal(lock.packages["node_modules/vitest"].version, "3.2.7");
const allowedLicenses = new Set([
  "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "BlueOak-1.0.0",
  "ISC", "MIT", "Python-2.0"
]);
const licenseCounts = {};
for (const packagePath of Object.keys(lock.packages).filter((key) => key.startsWith("node_modules/"))) {
  try {
    const installed = JSON.parse(await readFile(`${packagePath}/package.json`, "utf8"));
    assert.equal(typeof installed.license, "string", `${packagePath} has no declared license`);
    assert.equal(allowedLicenses.has(installed.license), true, `${packagePath} has an unapproved license`);
    licenseCounts[installed.license] = (licenseCounts[installed.license] ?? 0) + 1;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
const audit = process.platform === "win32"
  ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm audit --json"], { encoding: "utf8" })
  : spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
if (audit.error) throw audit.error;
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
  vitest_security_floor: "3.2.7",
  vitest_lock_exact: true,
  licenses: { status: "PASS", counts: licenseCounts },
  vulnerabilities
}, null, 2)}\n`);
if (audit.status !== 0) process.exit(audit.status ?? 1);
console.log("dependencies: PASS");
