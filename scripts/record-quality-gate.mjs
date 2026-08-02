import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { validateRequirementTestMap } from "./evidence-policy.mjs";

const required = [
  ["documentation", "evidence/docs-readiness.json"],
  ["local-performance", "evidence/performance-local.json"],
  ["requirement-test-map", "evidence/requirement-test-map.json"],
];
const blockers = [];
const commitSha = process.env.GITHUB_SHA ?? execFileSync(
  "git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
try {
  const candidate = JSON.parse(
    await readFile("release-artifacts/candidate.json", "utf8"),
  );
  if (candidate.source_tree_clean !== true || candidate.source_commit !== commitSha) {
    blockers.push({
      gate: "candidate-identity",
      evidence: "release-artifacts/candidate.json",
    });
  }
} catch {
  blockers.push({
    gate: "candidate-identity",
    evidence: "release-artifacts/candidate.json",
  });
}
for (const [gate, file] of required) {
  try {
    const evidence = JSON.parse(await readFile(file, "utf8"));
    let valid = gate === "requirement-test-map" || evidence.status === "PASS";
    if (gate === "requirement-test-map") {
      try {
        validateRequirementTestMap(evidence);
      } catch {
        valid = false;
      }
    }
    if (!valid) blockers.push({ gate, evidence: file });
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
