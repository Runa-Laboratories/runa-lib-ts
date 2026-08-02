import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import { validateReleaseTagIdentity } from "./release-tag-policy.mjs";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const refName = process.env.GITHUB_REF_NAME;
const refType = process.env.GITHUB_REF_TYPE;
const workflowCommit = process.env.GITHUB_SHA;
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
const verification = spawnSync("git", ["verify-tag", "--raw", refName], {
  encoding: "utf8",
});
assert.equal(verification.status, 0, "R-053-02: tag signature verification failed");
validateReleaseTagIdentity({
  packageVersion: packageJson.version,
  refName,
  refType,
  tagObjectType,
  tagCommit,
  workflowCommit,
  verificationOutput: `${verification.stdout}\n${verification.stderr}`,
});
console.log(`release tag admission: PASS (${refName}, ${tagCommit})`);
