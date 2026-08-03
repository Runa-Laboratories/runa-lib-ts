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
    approvedCheckout: "ffac863592620c6519072e447c6b6073092ea299",
    artifactManifestSha256: "109ddbdb95e11aa4824dfcfbcf0cd2eff46c717caaea6ec2042d256c899f401c",
    canonicalContractSha256: "6ebdc83d6136ac3f7372ce3f6c890169cf4584b10ca10ce94b44d7150869e54d",
    canonicalRef: "259e8d9f6f3afda94120777d1a03999c9713b4bd",
    generatedManifestSha256: "bd487d047abf107b7ba3e791171230ec2888464995398b4e1af71c3dd90f087e",
    generatorSha256: "75de6242dde7fccfc9251d371020c5dc5ffb96a65399647b6d54d2c8850202e1",
    openapiSha256: "e4c7a55fe7f857e00a28e5926f04c9ad0d7205ec8c7bcf4863c721c7c8b732d9",
    projectionSha256: "7a41d941210d85820f0d0dbbef66842ec3fff7cd6b8ca47ef557d98955bf489a",
    snapshotSha256: "a5dd2ebb2c0cc509051774e3d184386cf5d9f845865267d8ba38278cb47ad6a4",
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
