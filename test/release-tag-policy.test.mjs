import assert from "node:assert/strict";
import { test } from "vitest";

import {
  TAG_CERTIFICATE_IDENTITY,
  TAG_ISSUER,
  gitsignVerifyArgs,
  validateReleaseTagIdentity,
} from "../scripts/release-tag-policy.mjs";

const commit = "a".repeat(40);
const valid = () => ({
  packageVersion: "0.1.0",
  refName: "ts-v0.1.0",
  refType: "tag",
  tagObjectType: "tag",
  tagCommit: commit,
  workflowCommit: commit,
});

test("PRD-053 release tag admission rejects every identity mutation", () => {
  assert.deepEqual(validateReleaseTagIdentity(valid()), {
    expectedTag: "ts-v0.1.0",
    tagCommit: commit,
  });
  assert.deepEqual(gitsignVerifyArgs("ts-v0.1.0"), [
    "verify",
    `--certificate-identity=${TAG_CERTIFICATE_IDENTITY}`,
    `--certificate-oidc-issuer=${TAG_ISSUER}`,
    "ts-v0.1.0",
  ]);
  for (const mutate of [
    (value) => { value.refName = "ts-v0.1.1"; },
    (value) => { value.refType = "branch"; },
    (value) => { value.tagObjectType = "commit"; },
    (value) => { value.tagCommit = "b".repeat(40); },
  ]) {
    const candidate = valid();
    mutate(candidate);
    assert.throws(() => validateReleaseTagIdentity(candidate));
  }
});
