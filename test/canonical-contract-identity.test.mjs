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
    approvedCheckout: "18cf8ff7d343ccbdbfac1493937bf20f49b238b6",
    artifactManifestSha256: "ff86b646a624063876a28ac5c8766e0b2e52f94f16d94993f5db13d3e24c7507",
    canonicalContractSha256: "30af2ff539ee69ac72364bff81ebd8ec42f517a1a061a4a2714086ee44fb2ea5",
    canonicalRef: "286bdb84448b61f2f8142bc27daae48ad78cdf63",
    generatedManifestSha256: "3b086a9ce20ae1222374b416a16a456069f2ddf2c124edad15c2baf165218e09",
    generatorSha256: "75de6242dde7fccfc9251d371020c5dc5ffb96a65399647b6d54d2c8850202e1",
    openapiSha256: "1a5f589aa60eff78e19c95df6c410e80d65dc1e7cf0421b196b6c201e73ba925",
    projectionSha256: "1b6078b566428fcdb21e1913a1fa012955a5a7ab5dac9b429d1f2bac45aa679b",
    snapshotSha256: "327c6ccc6a4572929ff737bc8b1af6bd3189e139548af632245ce93118368298",
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
