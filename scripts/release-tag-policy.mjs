import assert from "node:assert/strict";

export const TAG_ISSUER = "https://token.actions.githubusercontent.com";
export const TAG_CERTIFICATE_IDENTITY =
  "https://github.com/Runa-Laboratories/runa-lib-ts/.github/workflows/release.yml@refs/heads/main";

export function gitsignVerifyArgs(refName) {
  return Object.freeze([
    "verify",
    `--certificate-identity=${TAG_CERTIFICATE_IDENTITY}`,
    `--certificate-oidc-issuer=${TAG_ISSUER}`,
    refName,
  ]);
}

export function validateReleaseTagIdentity({
  packageVersion,
  refName,
  refType,
  tagObjectType,
  tagCommit,
  workflowCommit,
}) {
  const expectedTag = `ts-v${packageVersion}`;
  assert.equal(refType, "tag", "R-053-02: release ref is not a tag");
  assert.equal(refName, expectedTag, "R-053-02: release tag/version mismatch");
  assert.equal(tagObjectType, "tag", "R-053-02: release tag is not annotated");
  assert.match(tagCommit, /^[a-f0-9]{40}$/);
  assert.equal(tagCommit, workflowCommit, "R-053-02: tag target/source mismatch");
  return Object.freeze({ expectedTag, tagCommit });
}
