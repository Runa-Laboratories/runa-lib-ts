import { mkdir, readFile, writeFile } from "node:fs/promises";
import { validateVitestAcceptanceReceipt } from "./acceptance-receipts.mjs";
import { loadPrdCatalog } from "./prd-catalog.mjs";
import { computeTestEvidenceBinding } from "./test-evidence-binding.mjs";
import { requirementRowsDigest } from "./requirement-ledger-digest.mjs";

const prdCatalog = await loadPrdCatalog();
const rows = [];
const acceptanceTestIds = new Set();
const requirementIds = new Set();
const sourceFiles = [];
for (const source of prdCatalog.sources) {
  const requirements = source.requirements;
  const tests = source.acceptance_tests;
  sourceFiles.push({
    file: source.file,
    sha256: source.sha256,
    requirement_count: requirements.length,
    acceptance_test_count: tests.length,
  });
  for (const test of tests) acceptanceTestIds.add(test);
  for (const requirement of requirements) {
    if (requirementIds.has(requirement)) {
      throw new Error(`Duplicate requirement identifier: ${requirement}`);
    }
    requirementIds.add(requirement);
    rows.push({
      requirement,
      scope: source.scope,
      prd: source.file,
      acceptance_test_ids: tests,
      status: "NOT_RUN",
      evidence_missing: "The PRD acceptance cases are traced but have not each been executed and recorded under their exact TC identifier.",
    });
  }
}
if (sourceFiles.length === 0 || rows.length === 0 || acceptanceTestIds.size === 0) {
  throw new Error("Trace catalog is empty.");
}
const receipted = new Map();
try {
  const oracleBytes = await readFile("evidence/vitest-oracle.json");
  const receipt = JSON.parse(await readFile("evidence/vitest-acceptance.json", "utf8"));
  for (const testId of validateVitestAcceptanceReceipt(
    receipt, oracleBytes, acceptanceTestIds, await computeTestEvidenceBinding(),
  )) receipted.set(testId, "evidence/vitest-acceptance.json");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const receiptOracles = [
  {
    file: "evidence/docs-readiness.json",
    tests: [
      "TC-048-01", "TC-048-02", "TC-048-03", "TC-048-04",
      "TC-048-05", "TC-048-06", "TC-048-07",
    ],
  },
  {
    file: "evidence/performance-local.json",
    tests: [
      "TC-017-02", "TC-017-03", "TC-017-04", "TC-017-05",
      "TC-017-06", "TC-017-07", "TC-017-08",
      "TC-050-05", "TC-050-06", "TC-050-08",
    ],
  },
];
for (const oracle of receiptOracles) {
  let receipt;
  try {
    receipt = JSON.parse(await readFile(oracle.file, "utf8"));
  } catch {
    continue;
  }
  if (receipt.status !== "PASS" ||
      !Array.isArray(receipt.acceptance_tests) ||
      JSON.stringify([...receipt.acceptance_tests].sort()) !==
        JSON.stringify([...oracle.tests].sort())) continue;
  for (const testId of oracle.tests) receipted.set(testId, oracle.file);
}
await mkdir("evidence", { recursive: true });
const acceptanceResults = [...acceptanceTestIds].sort().map((testId) =>
  receipted.has(testId)
    ? { test_id: testId, status: "PASS", evidence: receipted.get(testId) }
    : { test_id: testId, status: "NOT_RUN", reason: "No exact-ID execution receipt is retained; external-state cases remain blocked until their owning gate supplies one." }
);
const passedCount = acceptanceResults.filter((result) => result.status === "PASS").length;
for (const row of rows) {
  if (row.acceptance_test_ids.every((testId) => receipted.has(testId))) {
    row.status = "PASS";
    delete row.evidence_missing;
  }
}
const passedRequirements = rows.filter((row) => row.status === "PASS").length;
const sourceDigest = requirementRowsDigest(rows);
await writeFile("evidence/requirement-test-map.json", `${JSON.stringify({
  schema_version: 2,
  generated_from: prdCatalog.catalog.generated_from,
  prd_catalog_sha256: prdCatalog.digest,
  source_files: sourceFiles,
  source_digest: sourceDigest,
  requirement_count: rows.length,
  acceptance_test_count: acceptanceTestIds.size,
  requirement_status_summary: {
    NOT_RUN: rows.length - passedRequirements,
    PASS: passedRequirements,
    BLOCKED: 0,
  },
  acceptance_status_summary: { PASS: passedCount, NOT_RUN: acceptanceResults.length - passedCount },
  acceptance_test_ids: [...acceptanceTestIds].sort(),
  acceptance_results: acceptanceResults,
  rows
}, null, 2)}\n`);
console.log(`evidence: ${rows.length} requirements; ${passedCount}/${acceptanceTestIds.size} exact TC IDs have retained local evidence`);
