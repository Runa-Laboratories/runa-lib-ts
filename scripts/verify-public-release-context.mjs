import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(".runa/release-policy.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(packageJson.publishConfig?.access, "public");
assert.equal(policy.packageMetadata.packageAccess, "public");
assert.equal(policy.packageMetadata.repositoryVisibility, "public");
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
assert.equal(repository, policy.sourceControl.repository);
assert.notEqual(token, "");
const response = await fetch(`https://api.github.com/repos/${repository}`, {
  redirect: "error",
  headers: {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
  },
});
assert.equal(response.status, 200, "Repository visibility lookup failed.");
const metadata = await response.json();
assert.equal(metadata.full_name, repository);
assert.equal(metadata.visibility, "public",
  "npm provenance requires this public package's source repository to be public.");
assert.equal(metadata.private, false);
console.log(`public release context: PASS (${repository})`);
