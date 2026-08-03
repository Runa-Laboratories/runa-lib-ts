import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fetchAuthorityRun } from "./public-authority-transport.mjs";

const policy = JSON.parse(await readFile(".runa/release-policy.json", "utf8"));
assert.equal(policy.releaseAuthority.status, "configured",
  "No independently governed release authority has been accepted.");
const expected = policy.releaseAuthority.authority;
assert.notEqual(expected, null);
const runId = process.env.RUNA_AUTHORITY_RUN_ID;
assert.match(runId ?? "", /^[1-9][0-9]*$/u);
const run = await fetchAuthorityRun(expected, runId);
await mkdir("evidence", { recursive: true });
await writeFile("evidence/authority-run.json", `${JSON.stringify({
  schema_version: 1,
  status: "PASS",
  repository: expected.repository,
  workflow: expected.workflow,
  artifact: expected.artifact,
  run_id: run.id,
  run_attempt: run.run_attempt,
  head_sha: run.head_sha,
}, null, 2)}\n`);
console.log(`release-authority run: PASS (${run.id}/${run.run_attempt})`);
