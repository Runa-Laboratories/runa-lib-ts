import assert from "node:assert/strict";

import { validateCiRunIdentity } from "./ci-run-policy.mjs";

const repository = process.env.GITHUB_REPOSITORY;
const runId = process.env.RUNA_CANDIDATE_RUN_ID;
const sourceCommit = process.env.GITHUB_SHA;
const token = process.env.GH_TOKEN;
assert.match(repository ?? "", /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
assert.match(runId ?? "", /^\d+$/);
assert.match(sourceCommit ?? "", /^[a-f0-9]{40}$/);
assert.equal(typeof token, "string");
assert.notEqual(token, "");
const response = await fetch(
  `https://api.github.com/repos/${repository}/actions/runs/${runId}`,
  {
    redirect: "error",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  },
);
assert.equal(response.status, 200, "R-053-04: CI run lookup failed");
validateCiRunIdentity(await response.json(), { repository, runId, sourceCommit });
console.log(`CI run admission: PASS (${runId}, ${sourceCommit})`);
