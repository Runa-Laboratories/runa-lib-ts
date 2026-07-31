import { writeFile } from "node:fs/promises";

await writeFile("evidence/quality-gate.json", `${JSON.stringify({
  schema_version: 1,
  status: "PASS",
  commit_sha: process.env.GITHUB_SHA ?? null,
  workflow_run_id: process.env.GITHUB_RUN_ID ?? null
}, null, 2)}\n`);
