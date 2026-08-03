import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(".runa/release-policy.json", "utf8"));
assert.equal(policy.releaseAuthority?.status, "configured",
  "Release authority is intentionally unconfigured; an accepted governance change is required before tagging.");
const authority = policy.releaseAuthority.authority;
assert.deepEqual(authority, {
  repository: "Runa-Laboratories/runa-release-authority",
  workflow: ".github/workflows/release-authority.yml",
  artifact: "release-authority-bundle",
  branch: "main",
  event: "workflow_dispatch",
});
const trust = JSON.parse(await readFile("governance/release-trust.json", "utf8"));
assert.deepEqual(Object.keys(trust).sort(), [
  "keys", "maximum_validity_ms", "schema_version",
].sort());
assert.equal(trust.schema_version, 1);
assert.equal(trust.maximum_validity_ms, 3_600_000);
assert.deepEqual(trust.keys.map((key) => key.role).sort(), [
  "acceptance-results", "approval", "cross-language", "external-interfaces",
  "publication", "release-authority", "repository-controls", "sbom-validation",
  "version-classification",
]);
for (const key of trust.keys) {
  assert.deepEqual(Object.keys(key).sort(), [
    "algorithm", "key_id", "public_key_pem", "role",
  ].sort());
  assert.equal(key.algorithm, "Ed25519");
  assert.equal(key.key_id, "runa-release-authority-2026-08-02-v1");
  assert.equal(createHash("sha256").update(key.public_key_pem).digest("hex"),
    "fe7d7259281d512d4f17ef1a0afed3e9b613105ab1a3304e129130b194aa8000");
}
const output = process.env.GITHUB_OUTPUT;
if (output !== undefined) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(output, [
    `repository=${authority.repository}`,
    `artifact=${authority.artifact}`,
  ].join("\n") + "\n");
}
console.log(`release authority configuration: PASS (${authority.repository})`);
