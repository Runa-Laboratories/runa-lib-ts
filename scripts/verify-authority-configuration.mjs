import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(".runa/release-policy.json", "utf8"));
assert.equal(policy.releaseAuthority?.status, "configured",
  "Release authority is intentionally unconfigured; an accepted governance change is required before tagging.");
const authority = policy.releaseAuthority.authority;
assert.deepEqual(Object.keys(authority).sort(), [
  "artifact", "branch", "event", "repository", "workflow",
].sort());
assert.match(authority.repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);
assert.match(authority.workflow, /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/u);
assert.match(authority.artifact, /^[A-Za-z0-9_.-]+$/u);
assert.match(authority.branch, /^[A-Za-z0-9._/-]+$/u);
assert.equal(authority.event, "workflow_dispatch");
await access("governance/release-trust.json");
const output = process.env.GITHUB_OUTPUT;
if (output !== undefined) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(output, [
    `repository=${authority.repository}`,
    `artifact=${authority.artifact}`,
  ].join("\n") + "\n");
}
console.log(`release authority configuration: PASS (${authority.repository})`);
