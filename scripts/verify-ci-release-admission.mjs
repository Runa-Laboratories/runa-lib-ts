import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { EXPECTED_RELEASE_POLICY } from "./release-manifest-core.mjs";

const candidate = JSON.parse(await readFile(
  "release-artifacts/candidate.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const releasePolicy = JSON.parse(await readFile(
  ".runa/release-policy.json", "utf8"));
const workflow = await readFile(".github/workflows/release.yml", "utf8");
assert.match(process.env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/);
assert.equal(candidate.source_commit, process.env.GITHUB_SHA);
assert.equal(candidate.source_tree_clean, true);
assert.equal(candidate.package, packageJson.name);
assert.equal(candidate.version, packageJson.version);
assert.deepEqual(releasePolicy, EXPECTED_RELEASE_POLICY);
assert.match(workflow, /workflow_dispatch:/u);
assert.doesNotMatch(workflow, /push:\s*\n\s+tags:/u);
console.log(`release admission: PASS (${candidate.source_commit})`);
