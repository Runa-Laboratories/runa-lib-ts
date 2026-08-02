import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(".runa/release-policy.json", "utf8"));
assert.equal(policy.releaseAuthority.status, "configured",
  "No independently governed release authority has been accepted.");
const expected = policy.releaseAuthority.authority;
assert.notEqual(expected, null);
const runId = process.env.RUNA_AUTHORITY_RUN_ID;
const token = process.env.GH_TOKEN;
assert.match(runId ?? "", /^\d+$/u);
assert.notEqual(token, "");
const response = await fetch(
  `https://api.github.com/repos/${expected.repository}/actions/runs/${runId}`,
  {
    redirect: "error",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  },
);
assert.equal(response.status, 200, "Release-authority run lookup failed.");
const run = await response.json();
assert.equal(run.id, Number(runId));
assert.equal(run.repository?.full_name, expected.repository);
assert.equal(run.path, expected.workflow);
assert.equal(run.event, expected.event);
assert.equal(run.head_branch, expected.branch);
assert.equal(run.status, "completed");
assert.equal(run.conclusion, "success");
assert.match(run.head_sha, /^[0-9a-f]{40}$/u);
assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
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
