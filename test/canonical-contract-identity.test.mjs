import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import {
  loadCanonicalContractIdentity,
  validateAuthorityContractProvenance,
} from "../scripts/canonical-contract-identity.mjs";

test("canonical contract identity binds the gitlink and every release input", async () => {
  const identity = await loadCanonicalContractIdentity();
  assert.deepEqual(identity, {
    approvedCheckout: "bb772a134e7722ee9cfe3df9cfc27bc59df03090",
    artifactManifestSha256: "42a36fb04b8d770b16769b064711ab153894d76df96414bca201719d2849a18c",
    canonicalContractSha256: "15669543eef00971c51d0d58ac34f2d6f367bb3f2b4b78acfd5981c55c4973b1",
    canonicalRef: "31ac7cee07007143a41f704569ce6d59e230e276",
    generatedManifestSha256: "3e0ef590f62b1460f8f49b1c93b23bce3f65ace1c99eee8cb3b53bcec65e0a31",
    generatorSha256: "75de6242dde7fccfc9251d371020c5dc5ffb96a65399647b6d54d2c8850202e1",
    openapiSha256: "a89f77203956f45e4e14f80c2b3ce02fcb4e435eaefe22b9515290caf58992a8",
    projectionSha256: "998c10514ce704435e36569243a0e158f5267cecd4be669c2f01e79838484e80",
    snapshotSha256: "497ad3bfd712d7ed0c55289e94808435a924fd5cc909f1ab0620f860a6ebfc98",
  });

  const normalized = {
    approval_sha: identity.approvedCheckout,
    approved_at: "2026-08-02T12:00:00.000Z",
    approver_identity: "https://github.com/Runa-Laboratories/runa-sdk-contract",
    canonical_contract_sha256: identity.canonicalContractSha256,
    canonical_ref: identity.canonicalRef,
    canonical_repository: "Runa-Laboratories/runa-sdk-contract",
    openapi_sha256: identity.openapiSha256,
    projection_sha256: identity.projectionSha256,
    schema_version: 1,
    status: "APPROVED",
  };
  assert.equal(validateAuthorityContractProvenance(normalized, identity), true);
  for (const mutation of [
    { approval_sha: "0".repeat(40) },
    { canonical_ref: "0".repeat(40) },
    { canonical_contract_sha256: "0".repeat(64) },
    { projection_sha256: "0".repeat(64) },
    { openapi_sha256: "0".repeat(64) },
    { approved_at: "not-a-date" },
    { status: "PASS" },
  ]) {
    assert.throws(() => validateAuthorityContractProvenance(
      { ...normalized, ...mutation }, identity,
    ));
  }
});

test("release trust is pinned to one accepted Ed25519 root for every authority role", async () => {
  const policy = JSON.parse(await readFile("governance/release-trust.json", "utf8"));
  const expectedRoles = [
    "acceptance-results", "approval", "cross-language", "external-interfaces",
    "publication", "release-authority", "repository-controls", "sbom-validation",
    "version-classification",
  ];
  assert.equal(policy.schema_version, 1);
  assert.equal(policy.maximum_validity_ms, 3_600_000);
  assert.deepEqual(policy.keys.map((key) => key.role).sort(), expectedRoles);
  assert(policy.keys.every((key) =>
    key.key_id === "runa-release-authority-2026-08-02-v1" &&
    key.algorithm === "Ed25519" &&
    key.public_key_pem === policy.keys[0].public_key_pem
  ));
  assert.equal(
    createHash("sha256").update(policy.keys[0].public_key_pem).digest("hex"),
    "fe7d7259281d512d4f17ef1a0afed3e9b613105ab1a3304e129130b194aa8000",
  );
});
