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
await writeFile("evidence/quality-gate.json", `${JSON.stringify({
  schema_version: 1,
  status: blockers.length === 0 ? "PASS" : "BLOCKED",
  commit_sha: process.env.GITHUB_SHA ?? null,
  workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
  blockers,
}, null, 2)}\n`);
