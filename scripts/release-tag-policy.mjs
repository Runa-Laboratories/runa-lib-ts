import assert from "node:assert/strict";

export const TAG_ISSUER = "https://token.actions.githubusercontent.com";
export const TAG_CERTIFICATE_IDENTITY =
  "https://github.com/Runa-Laboratories/runa-lib-ts/.github/workflows/release.yml@refs/heads/main";

export function validateReleaseTagIdentity({
  packageVersion,
  refName,
  refType,
  tagObjectType,
  tagCommit,
  workflowCommit,
  verificationOutput,
}) {
  const expectedTag = `ts-v${packageVersion}`;
  assert.equal(refType, "tag", "R-053-02: release ref is not a tag");
  assert.equal(refName, expectedTag, "R-053-02: release tag/version mismatch");
  assert.equal(tagObjectType, "tag", "R-053-02: release tag is not annotated");
  assert.match(tagCommit, /^[a-f0-9]{40}$/);
  assert.equal(tagCommit, workflowCommit, "R-053-02: tag target/source mismatch");
  assert.equal(verificationOutput.includes(TAG_ISSUER), true,
    "R-053-02: tag signature issuer mismatch");
  assert.equal(verificationOutput.includes(TAG_CERTIFICATE_IDENTITY), true,
    "R-053-02: tag certificate identity mismatch");
  return Object.freeze({ expectedTag, tagCommit });
}
