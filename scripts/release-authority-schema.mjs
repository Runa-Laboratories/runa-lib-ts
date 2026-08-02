import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const sha256 = (value, field) =>
  assert.match(value, /^[a-f0-9]{64}$/, `Invalid ${field}.`);
const exact = (payload, fields) =>
  assert.deepEqual(Object.keys(payload).sort(), [...fields].sort());
const common = (payload) => {
  assert.equal(payload.status, "PASS");
  assert.equal(Number.isFinite(Date.parse(payload.issued_at)), true);
  assert.equal(Number.isFinite(Date.parse(payload.expires_at)), true);
};

export function validateTrustedRolePayload(role, payload) {
  assert.equal(payload !== null && typeof payload === "object", true);
  common(payload);
  if (role === "approval") {
    exact(payload, [
      "approval_decision", "approver_role", "artifact_sha256",
      "candidate_manifest_sha256", "candidate_sha256", "expires_at",
      "issued_at", "policy_id", "status",
    ]);
    sha256(payload.artifact_sha256, "artifact_sha256");
    sha256(payload.candidate_sha256, "candidate_sha256");
    sha256(payload.candidate_manifest_sha256, "candidate_manifest_sha256");
    assert.equal(payload.artifact_sha256, payload.candidate_sha256);
    assert.equal(payload.approval_decision, "APPROVE");
    assert.match(payload.approver_role, /^[A-Za-z0-9._-]+$/);
    assert.match(payload.policy_id, /^[A-Za-z0-9._-]+$/);
  } else if (role === "publication") {
    exact(payload, [
      "candidate_sha256", "dist_tag", "expires_at", "issued_at",
      "oidc_trusted_publisher", "package_name", "provenance_attestation_required",
      "registry", "registry_retrieval_required", "status", "version",
    ]);
    sha256(payload.candidate_sha256, "candidate_sha256");
    assert.equal(payload.package_name, "@runa/sdk");
    assert.match(payload.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    assert.equal(payload.registry, "https://registry.npmjs.org");
    assert.match(payload.dist_tag, /^(?:latest|next|beta|rc)$/);
    assert.equal(payload.oidc_trusted_publisher, true);
    assert.equal(payload.provenance_attestation_required, true);
    assert.equal(payload.registry_retrieval_required, true);
  } else if (role === "sbom-validation") {
    exact(payload, [
      "artifact_subject_sha256", "bom_format", "candidate_sha256",
      "dependency_closure_sha256", "expires_at", "issued_at",
      "sbom_sha256", "spec_version", "status",
    ]);
    for (const field of [
      "artifact_subject_sha256", "candidate_sha256",
      "dependency_closure_sha256", "sbom_sha256",
    ]) sha256(payload[field], field);
    assert.equal(payload.artifact_subject_sha256, payload.candidate_sha256);
    assert.equal(payload.bom_format, "CycloneDX");
    assert.equal(payload.spec_version, "1.6");
  } else if (role === "external-interfaces") {
    exact(payload, [
      "candidate_sha256", "expires_at", "github_attestations_api_required",
      "github_release_required", "issued_at", "npm_registry_required",
      "receipt_types", "status", "withdrawal_policy_id",
    ]);
    sha256(payload.candidate_sha256, "candidate_sha256");
    assert.equal(payload.github_attestations_api_required, true);
    assert.equal(payload.github_release_required, true);
    assert.equal(payload.npm_registry_required, true);
    assert.deepEqual(payload.receipt_types, [
      "github-attestation", "npm-registry", "provenance",
    ]);
    assert.equal(payload.withdrawal_policy_id, "TS-053-WITHDRAWAL-V1");
  }
  return true;
}

export function validateSbomEvidenceBinding(payload, {
  candidateSha256,
  sbomBytes,
  runtimeClosure,
}) {
  validateTrustedRolePayload("sbom-validation", payload);
  assert.equal(payload.candidate_sha256, candidateSha256);
  assert.equal(payload.artifact_subject_sha256, candidateSha256);
  assert.equal(
    payload.sbom_sha256,
    createHash("sha256").update(sbomBytes).digest("hex"),
  );
  assert.equal(runtimeClosure.status, "PASS");
  assert.equal(runtimeClosure.candidate_sha256, candidateSha256);
  sha256(runtimeClosure.closure_sha256, "runtimeClosure.closure_sha256");
  assert.equal(
    payload.dependency_closure_sha256,
    runtimeClosure.closure_sha256,
  );
  return true;
}
