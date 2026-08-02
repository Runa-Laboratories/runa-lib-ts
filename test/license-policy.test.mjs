import assert from "node:assert/strict";
import { test } from "vitest";
import {
  APPROVED_LICENSE,
  validateApprovedLicense,
} from "../scripts/license-policy.mjs";

const approvedText = `Apache License
Version 2.0, January 2004
Copyright 2026 Runa Laboratories
`;

test("the GA license policy accepts only the approved Apache-2.0 identity", () => {
  assert.equal(validateApprovedLicense(approvedText, {
    license: APPROVED_LICENSE,
  }), true);
  assert.throws(() => validateApprovedLicense(approvedText, { license: "MIT" }));
  assert.throws(() => validateApprovedLicense(
    approvedText.replace("Apache License", "Different License"),
    { license: APPROVED_LICENSE },
  ));
  assert.throws(() => validateApprovedLicense(
    approvedText.replace("Runa Laboratories", "Unknown Owner"),
    { license: APPROVED_LICENSE },
  ));
});
