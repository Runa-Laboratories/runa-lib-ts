import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const sources = [
  { root: path.resolve("../../prds/libs/shared"), scope: "shared-applicable" },
  { root: path.resolve("../../prds/libs/typescript"), scope: "typescript" }
];
const rows = [];
const acceptanceTestIds = new Set();
const verified = new Map(Object.entries({
  "TC-020-01": "scripts/verify-surface.mjs + scripts/verify-pack.mjs",
  "TC-020-03": "build output inspection + scripts/verify-security.mjs",
  "TC-020-05": "scripts/verify-pack.mjs + dynamic release license gate",
  "TC-021-01": "scripts/verify-contract.mjs + test/transport.test.mjs",
  "TC-021-02": "test/transport.test.mjs",
  "TC-021-03": "test/core.test.mjs",
  "TC-021-05": "scripts/verify-surface.mjs + import probe",
  "TC-021-06": "scripts/verify-security.mjs",
  "TC-022-02": "test/core.test.mjs",
  "TC-022-03": "test/transport.test.mjs",
  "TC-022-04": "test/core.test.mjs + test/types/public-surface.mts",
  "TC-022-05": "test/core.test.mjs",
  "TC-022-06": "test/core.test.mjs",
  "TC-022-07": "test/resources.test.mjs",
  "TC-022-08": "test/core.test.mjs",
  "TC-023-01": "test/core.test.mjs",
  "TC-023-04": "test/core.test.mjs",
  "TC-023-05": "test/core.test.mjs",
  "TC-023-06": "test/core.test.mjs",
  "TC-024-01": "scripts/verify-surface.mjs + test/core.test.mjs",
  "TC-024-02": "test/core.test.mjs",
  "TC-024-03": "test/transport.test.mjs",
  "TC-024-05": "test/resources.test.mjs",
  "TC-025-01": "test/transport.test.mjs",
  "TC-025-02": "test/transport.test.mjs",
  "TC-025-03": "test/transport.test.mjs",
  "TC-025-04": "test/transport.test.mjs",
  "TC-025-05": "test/transport.test.mjs",
  "TC-025-06": "test/transport.test.mjs",
  "TC-025-07": "test/transport.test.mjs",
  "TC-026-01": "test/resilience.test.mjs",
  "TC-026-02": "test/resilience.test.mjs",
  "TC-026-07": "test/resilience.test.mjs",
  "TC-027-02": "test/resources.test.mjs",
  "TC-027-07": "test/resources.test.mjs",
  "TC-027-10": "test/resources.test.mjs",
  "TC-035-01": "test/resources.test.mjs",
  "TC-035-03": "test/resources.test.mjs",
  "TC-036-01": "test/resources.test.mjs",
  "TC-037-01": "test/resources.test.mjs",
  "TC-039-01": "test/resilience.test.mjs",
  "TC-040-01": "scripts/verify-security.mjs",
  "TC-048-01": "npm run docs:api + scripts/verify-docs.mjs",
  "TC-049-01": "scripts/verify-docs.mjs",
  "TC-049-06": "scripts/verify-docs.mjs",
  "TC-051-03": "scripts/verify-pack.mjs",
  "TC-051-06": "scripts/verify-security.mjs"
}));
for (const source of sources) {
  for (const file of (await readdir(source.root)).filter((name) => /^PRD-\d+.*\.md$/.test(name)).sort()) {
    const text = await readFile(path.join(source.root, file), "utf8");
    const owner = file.match(/^PRD-(\d{3})/)?.[1];
    const requirements = [...new Set(text.match(/R-\d{3}-\d{2}/g) ?? [])]
      .filter((id) => id.slice(2, 5) === owner)
      .sort();
    const tests = [...new Set(text.match(/TC-\d{3}-\d{2}/g) ?? [])]
      .filter((id) => id.slice(3, 6) === owner)
      .sort();
    for (const test of tests) acceptanceTestIds.add(test);
    for (const requirement of requirements) {
      rows.push({
        requirement,
        scope: source.scope,
        prd: `prds/libs/${source.scope === "typescript" ? "typescript" : "shared"}/${file}`,
        acceptance_test_ids: tests,
        status: "NOT_RUN",
        evidence_missing: "The PRD acceptance cases are traced but have not each been executed and recorded under their exact TC identifier."
      });
    }
  }
}
if (rows.length !== 984 || acceptanceTestIds.size !== 522) {
  throw new Error(`Trace catalog mismatch: ${rows.length} requirements and ${acceptanceTestIds.size} acceptance tests.`);
}
const receipted = new Map();
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
await writeFile("evidence/requirement-test-map.json", `${JSON.stringify({
  schema_version: 2,
  status: passedCount === acceptanceResults.length && passedRequirements === rows.length
    ? "PASS"
    : "BLOCKED",
  generated_from: ["prds/libs/shared", "prds/libs/typescript"],
  source_digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
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
