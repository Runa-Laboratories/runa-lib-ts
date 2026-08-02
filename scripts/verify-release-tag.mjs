import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import {
  gitsignVerifyArgs,
  validateReleaseTagIdentity,
} from "./release-tag-policy.mjs";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const refName = process.env.RUNA_RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
const refType = process.env.RUNA_RELEASE_TAG === undefined
  ? process.env.GITHUB_REF_TYPE
  : "tag";
const workflowCommit = process.env.RUNA_RELEASE_COMMIT ?? process.env.GITHUB_SHA;
assert.equal(typeof refName, "string", "R-053-02: missing GitHub tag name");
assert.equal(typeof refType, "string", "R-053-02: missing GitHub ref type");
assert.match(workflowCommit ?? "", /^[a-f0-9]{40}$/,
  "R-053-02: missing workflow source commit");
const tagRef = `refs/tags/${refName}`;
const tagObjectType = execFileSync("git", ["cat-file", "-t", tagRef], {
  encoding: "utf8",
}).trim();
const tagCommit = execFileSync("git", ["rev-list", "-n", "1", tagRef], {
  encoding: "utf8",
}).trim();
const verification = spawnSync("gitsign", gitsignVerifyArgs(refName), {
  encoding: "utf8",
});
assert.equal(verification.status, 0,
  "R-053-02: gitsign tag identity verification failed");
validateReleaseTagIdentity({
  packageVersion: packageJson.version,
  refName,
  refType,
  tagObjectType,
  tagCommit,
  workflowCommit,
});
console.log(`release tag admission: PASS (${refName}, ${tagCommit})`);
