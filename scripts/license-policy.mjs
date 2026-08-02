import assert from "node:assert/strict";

export const APPROVED_LICENSE = "Apache-2.0";

export function validateApprovedLicense(licenseText, packageMetadata) {
  assert.equal(packageMetadata.license, APPROVED_LICENSE,
    `package.json license must be ${APPROVED_LICENSE}.`);
  assert.match(licenseText,
    /^\s*Apache License\r?\n\s*Version 2\.0, January 2004\r?\n/u,
    "LICENSE must contain the Apache License 2.0 text.");
  assert.match(licenseText, /Copyright 2026 Runa Laboratories/u,
    "LICENSE must identify Runa Laboratories as the copyright owner.");
  return true;
}
