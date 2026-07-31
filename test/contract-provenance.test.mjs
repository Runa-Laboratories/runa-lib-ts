import assert from "node:assert/strict";
import { test } from "vitest";
import { validateContractProvenance } from "../scripts/contract-generation.mjs";

const digests = {
  canonical: "a".repeat(64),
  projection: "b".repeat(64),
  openapi: "c".repeat(64),
};
const base = {
  schema_version: 1,
  canonical_contract_sha256: digests.canonical,
  projection_sha256: digests.projection,
  openapi_sha256: digests.openapi,
  canonical_repository: "Runa-Laboratories/runa-sdk-contract",
};

test("contract provenance is reachable but fails closed on identity mutations", () => {
  const blocked = {
    ...base,
    status: "BLOCKED",
    canonical_ref: null,
    approval_sha: null,
    reason: "Approval is unavailable.",
  };
  assert.equal(validateContractProvenance(blocked, digests), true);
  const approved = {
    ...base,
    status: "APPROVED",
    canonical_ref: "d".repeat(40),
    approval_sha: "e".repeat(40),
    approver_identity: "https://github.com/runa-release/contract-approvers",
    approved_at: "2026-07-30T12:00:00Z",
  };
  assert.equal(validateContractProvenance(approved, digests), true);
  assert.equal(validateContractProvenance({ ...approved, canonical_ref: "main" }, digests), false);
  assert.equal(validateContractProvenance({ ...approved, approval_sha: null }, digests), false);
  assert.equal(validateContractProvenance({ ...approved, approver_identity: "local" }, digests), false);
  assert.equal(validateContractProvenance({ ...approved, canonical_contract_sha256: "f".repeat(64) }, digests), false);
  assert.equal(validateContractProvenance({ ...approved, status: "PASS" }, digests), false);
});
