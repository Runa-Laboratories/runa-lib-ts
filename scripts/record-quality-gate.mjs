import { readFile, writeFile } from "node:fs/promises";
import { validateRequirementTestMap } from "./evidence-policy.mjs";

const required = [
  ["documentation", "evidence/docs-readiness.json"],
  ["local-performance", "evidence/performance-local.json"],
  ["requirement-test-map", "evidence/requirement-test-map.json"],
];
const blockers = [];
let commitSha = process.env.GITHUB_SHA ?? null;
if (commitSha === null) {
  try {
    const candidate = JSON.parse(
      await readFile("release-artifacts/candidate.json", "utf8"),
    );
    if (candidate.source_tree_clean === true &&
        typeof candidate.source_commit === "string") {
      commitSha = candidate.source_commit;
    }
  } catch {
    // A local quality run may precede candidate construction.
  }
}
for (const [gate, file] of required) {
  try {
    const evidence = JSON.parse(await readFile(file, "utf8"));
    if (evidence.status !== "PASS") blockers.push({ gate, evidence: file });
    if (gate === "requirement-test-map") {
      try {
        validateRequirementTestMap(evidence);
      } catch {
        blockers.push({ gate, evidence: file });
      }
    }
  } catch {
    blockers.push({ gate, evidence: file });
  }
}
await writeFile("evidence/quality-gate.json", `${JSON.stringify({
  schema_version: 1,
  status: blockers.length === 0 ? "PASS" : "BLOCKED",
  commit_sha: commitSha,
  workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
  blockers,
}, null, 2)}\n`);
