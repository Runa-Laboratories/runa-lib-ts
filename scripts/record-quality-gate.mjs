import { readFile, writeFile } from "node:fs/promises";

const required = [
  ["documentation", "evidence/docs-readiness.json"],
  ["local-performance", "evidence/performance-local.json"],
];
const blockers = [];
for (const [gate, file] of required) {
  try {
    const evidence = JSON.parse(await readFile(file, "utf8"));
    if (evidence.status !== "PASS") blockers.push({ gate, evidence: file });
  } catch {
    blockers.push({ gate, evidence: file });
  }
}
let exactEvidence = { passed: 0, total: 0 };
try {
  const map = JSON.parse(
    await readFile("evidence/requirement-test-map.json", "utf8"),
  );
  exactEvidence = {
    passed: map.acceptance_status_summary?.PASS ?? 0,
    total: map.acceptance_test_count ?? 0,
  };
  if (exactEvidence.passed !== exactEvidence.total) {
    blockers.push({
      gate: "exact-acceptance-receipts",
      evidence: "evidence/requirement-test-map.json",
      passed: exactEvidence.passed,
      total: exactEvidence.total,
    });
  }
} catch {
  blockers.push({
    gate: "exact-acceptance-receipts",
    evidence: "evidence/requirement-test-map.json",
  });
}
await writeFile("evidence/quality-gate.json", `${JSON.stringify({
  schema_version: 1,
  status: blockers.length === 0 ? "PASS" : "BLOCKED",
  local_gates_status: blockers.every((item) =>
    item.gate === "exact-acceptance-receipts") ? "PASS" : "BLOCKED",
  release_completeness_status:
    exactEvidence.total > 0 && exactEvidence.passed === exactEvidence.total
      ? "PASS"
      : "BLOCKED",
  commit_sha: process.env.GITHUB_SHA ?? null,
  workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
  blockers,
}, null, 2)}\n`);
