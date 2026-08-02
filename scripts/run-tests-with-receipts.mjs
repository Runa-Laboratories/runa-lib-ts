import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { computeTestEvidenceBinding } from "./test-evidence-binding.mjs";

const resultsFile = ".runa-tmp/vitest-results.json";
const oracleFile = "evidence/vitest-oracle.json";
const receiptFile = "evidence/vitest-acceptance.json";
await mkdir("evidence", { recursive: true });
await mkdir(".runa-tmp", { recursive: true });

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
if (run.status !== 0) {
  try {
    const failureReport = JSON.parse(await readFile(resultsFile, "utf8"));
    const failures = (failureReport.testResults ?? []).flatMap((suite) =>
      (suite.assertionResults ?? [])
        .filter((result) => result.status === "failed")
        .map((result) => ({
          failureMessages: result.failureMessages ?? [],
          testFile: suite.name,
          testName: result.fullName ?? result.title ?? "unknown",
        })),
    );
    process.stderr.write(`${JSON.stringify({
      failedSuites: failureReport.numFailedTestSuites ?? null,
      failedTests: failureReport.numFailedTests ?? failures.length,
      failures,
    }, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Unable to read Vitest failure report: ${message}\n`);
  }
  process.exit(run.status ?? 1);
}

const resultsBytes = await readFile(resultsFile);
const report = JSON.parse(resultsBytes.toString("utf8"));
assert.equal(report.success, true, "Vitest did not report a successful run.");
const assertions = (report.testResults ?? []).flatMap(
  (suite) => (suite.assertionResults ?? []).map((result) => ({
    ...result,
    testFile: suite.name,
  })),
);
assert(assertions.length > 0, "Vitest reported no assertions.");
const passedIds = new Set();
const oracleAssertions = [];
for (const result of assertions) {
  if (result.status !== "passed") continue;
  const title = result.fullName ?? result.title ?? "";
  for (const testId of title.match(/TC-\d{3}-\d{2}/gu) ?? []) {
    assert.equal(passedIds.has(testId), false, `Duplicate exact TC receipt: ${testId}`);
    passedIds.add(testId);
    const absoluteFile = result.testFile ?? "";
    const relativeFile = absoluteFile === "" ? "unknown" :
      path.relative(process.cwd(), absoluteFile).replaceAll("\\", "/");
    oracleAssertions.push({ test_file: relativeFile, test_id: testId, status: "PASS" });
  }
}
assert(passedIds.size > 0, "No passed assertion carried an exact TC identifier.");
const acceptanceTests = [...passedIds].sort();
oracleAssertions.sort((a, b) => a.test_id.localeCompare(b.test_id));
const oracleBytes = Buffer.from(`${JSON.stringify({
  schema_version: 1,
  status: "PASS",
  assertions: oracleAssertions,
}, null, 2)}\n`);
await writeFile(oracleFile, oracleBytes);
const binding = await computeTestEvidenceBinding();
await writeFile(receiptFile, `${JSON.stringify({
  schema_version: 1,
  status: "PASS",
  runner: "vitest",
  oracle_sha256: createHash("sha256").update(oracleBytes).digest("hex"),
  passed_assertion_count: assertions.filter((item) => item.status === "passed").length,
  acceptance_tests: acceptanceTests,
  ...binding,
}, null, 2)}\n`);
console.log(`vitest acceptance receipt: PASS (${acceptanceTests.length} exact TC IDs)`);
