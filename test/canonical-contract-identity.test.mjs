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
    approvedCheckout: "be050f7a2cc479fef33b9469cb77de6d2976acdf",
    artifactManifestSha256: "b107d51e22566a52b12fddd1dbd1ed378c60c4d6c81544ae0f48e5374c00ad2b",
    canonicalContractSha256: "be686d0e1246365d7fde6aa2a9b7ff027ea18e74801ed00340d634ef8921f433",
    canonicalRef: "fc7a377cedc8f8d6d2300b6a632f79e3a70fb376",
    generatedManifestSha256: "89b8668e65fad55027671b29bd31815f72e745e92d476ec9b53cfec1432c7dc0",
    generatorSha256: "75de6242dde7fccfc9251d371020c5dc5ffb96a65399647b6d54d2c8850202e1",
    openapiSha256: "de2cf711b1148457eb6fda8b094c0a07fc3890c096de984b9cf13407c5f08937",
    projectionSha256: "bf50160fdb56de6de29acd6ff17ea97dcf8543e7f2fb8f8600028052f6f5bf00",
    snapshotSha256: "d5e78a8913b059a7e0ee7a2e119c4c2c882768378ceb57a216e43b5f564c2954",
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
