import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const resultsFile = "evidence/vitest-results.json";
const receiptFile = "evidence/vitest-acceptance.json";
await mkdir("evidence", { recursive: true });

const run = spawnSync(process.execPath, [
  "node_modules/vitest/vitest.mjs",
  "run",
  "--maxWorkers=1",
  "--no-file-parallelism",
  "--reporter=json",
  `--outputFile=${resultsFile}`,
], { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status ?? 1);

const resultsBytes = await readFile(resultsFile);
const report = JSON.parse(resultsBytes.toString("utf8"));
assert.equal(report.success, true, "Vitest did not report a successful run.");
const assertions = (report.testResults ?? []).flatMap(
  (suite) => suite.assertionResults ?? [],
);
assert(assertions.length > 0, "Vitest reported no assertions.");
const passedIds = new Set();
for (const result of assertions) {
  if (result.status !== "passed") continue;
  const title = result.fullName ?? result.title ?? "";
  for (const testId of title.match(/TC-\d{3}-\d{2}/gu) ?? []) {
    assert.equal(passedIds.has(testId), false, `Duplicate exact TC receipt: ${testId}`);
    passedIds.add(testId);
  }
}
assert(passedIds.size > 0, "No passed assertion carried an exact TC identifier.");
const acceptanceTests = [...passedIds].sort();
await writeFile(receiptFile, `${JSON.stringify({
  schema_version: 1,
  status: "PASS",
  runner: "vitest",
  results_sha256: createHash("sha256").update(resultsBytes).digest("hex"),
  passed_assertion_count: assertions.filter((item) => item.status === "passed").length,
  acceptance_tests: acceptanceTests,
}, null, 2)}\n`);
console.log(`vitest acceptance receipt: PASS (${acceptanceTests.length} exact TC IDs)`);
