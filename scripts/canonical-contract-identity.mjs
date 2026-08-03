import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const REPOSITORY = "Runa-Laboratories/runa-sdk-contract";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exactKeys = (value, fields, label) => {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object.`);
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(),
    `${label} has missing or additional fields.`);
};

export async function loadCanonicalContractIdentity(repositoryRoot = ".") {
  const contractRoot = path.join(repositoryRoot, "contracts");
  const [
    provenanceBytes, projectionBytes, snapshotBytes, openapiBytes, digestText,
    artifactManifestBytes, generatorBytes, generatedManifestBytes, staged,
  ] =
    await Promise.all([
      readFile(path.join(contractRoot, "runa-sdk-contract.provenance.json")),
      readFile(path.join(contractRoot, "runa-sdk-contract.prd002-projection.json")),
      readFile(path.join(contractRoot, "runa-sdk-contract.snapshot.json")),
      readFile(path.join(contractRoot, "runa-api.openapi.json")),
      readFile(path.join(contractRoot, "runa-api.openapi.sha256"), "utf8"),
      readFile(path.join(contractRoot, "artifact-manifest.json")),
      readFile(path.join(contractRoot, "tools/runa-contract-generator.mjs")),
      readFile(path.join(
        repositoryRoot, "src/internal/contract/generated/generated-manifest.json",
      )),
      execute("git", ["ls-files", "--stage", "--", "contracts"], {
        cwd: repositoryRoot, encoding: "utf8", windowsHide: true,
      }),
    ]);
  const provenance = JSON.parse(provenanceBytes);
  const [mode, approvedCheckout] = staged.stdout.trim().split(/\s+/u);
  assert.equal(mode, "160000", "Canonical contract path is not a gitlink.");
  assert.match(approvedCheckout, COMMIT);
  assert.equal(provenance.schema_version, 3);
  assert.equal(provenance.status, "APPROVED");
  assert.equal(provenance.canonical_repository, REPOSITORY);
  assert.match(provenance.canonical_ref, COMMIT);
  assert.equal(provenance.source_revision, provenance.canonical_ref);
  assert.equal(provenance.reason, null);
  assert.equal(provenance.artifacts?.contract_projection?.sha256,
    sha256(projectionBytes));
  assert.equal(provenance.artifacts?.snapshot?.sha256,
    sha256(snapshotBytes));
  assert.equal(provenance.generator_identity?.sha256, sha256(generatorBytes));
  const digestMatch = /^([a-f0-9]{64})  runa-api\.openapi\.json\n$/u.exec(digestText);
  assert.notEqual(digestMatch, null, "Canonical OpenAPI digest declaration is invalid.");
  return Object.freeze({
    approvedCheckout,
    artifactManifestSha256: sha256(artifactManifestBytes),
    canonicalContractSha256: digestMatch[1],
    canonicalRef: provenance.canonical_ref,
    generatedManifestSha256: sha256(generatedManifestBytes),
    generatorSha256: sha256(generatorBytes),
    openapiSha256: sha256(openapiBytes),
    projectionSha256: sha256(projectionBytes),
    snapshotSha256: sha256(snapshotBytes),
  });
}

export function validateAuthorityContractProvenance(value, identity) {
  exactKeys(value, [
    "approval_sha", "approved_at", "approver_identity", "canonical_contract_sha256",
    "canonical_ref", "canonical_repository", "openapi_sha256", "projection_sha256",
    "schema_version", "status",
  ], "authority contract provenance");
  assert.equal(value.schema_version, 1);
  assert.equal(value.status, "APPROVED");
  assert.equal(value.canonical_repository, REPOSITORY);
  assert.equal(value.canonical_ref, identity.canonicalRef);
  assert.equal(value.approval_sha, identity.approvedCheckout);
  assert.equal(value.approver_identity, `https://github.com/${REPOSITORY}`);
  assert.equal(Number.isFinite(Date.parse(value.approved_at)), true);
  assert.equal(value.canonical_contract_sha256, identity.canonicalContractSha256);
  assert.equal(value.projection_sha256, identity.projectionSha256);
  assert.equal(value.openapi_sha256, identity.openapiSha256);
  for (const field of [
    "canonical_contract_sha256", "projection_sha256", "openapi_sha256",
  ]) assert.match(value[field], SHA256);
  return true;
}
