import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { jcsBytes } from "./trusted-evidence.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const TEST_ID = /^TC-\d{3}-\d{2}$/u;
const AUTHORITY_REPOSITORY = "Runa-Laboratories/runa-release-authority";
const AUTHORITY_WORKFLOW = ".github/workflows/release-authority.yml";

const sha256 = (value, field) => assert.match(value, SHA256, `Invalid ${field}.`);
const exact = (payload, fields, label = "trusted payload") => {
  assert.equal(payload !== null && typeof payload === "object" &&
    !Array.isArray(payload), true, `${label} must be an object.`);
  assert.deepEqual(Object.keys(payload).sort(), [...fields].sort(),
    `${label} has missing or additional fields.`);
};
const common = (payload) => {
  assert.equal(payload.status, "PASS");
  const issued = Date.parse(payload.issued_at);
  const expires = Date.parse(payload.expires_at);
  assert.equal(Number.isFinite(issued), true);
  assert.equal(Number.isFinite(expires), true);
  assert(expires > issued);
};
const artifact = (value, kind) => {
  exact(value, ["filename", "sha256"], `${kind} artifact`);
  assert.match(value.filename, kind === "wheel" ? /^[A-Za-z0-9_.-]+\.whl$/u :
    kind === "sdist" ? /^[A-Za-z0-9_.-]+\.tar\.gz$/u :
      /^runa_laboratories-sdk-[0-9A-Za-z.-]+\.tgz$/u);
  sha256(value.sha256, `${kind}.sha256`);
};

export function validateTrustedRolePayload(role, payload) {
  exact(payload, Object.keys(payload));
  common(payload);
  if (role === "approval") {
    exact(payload, [
      "approval_decision", "approver_identity", "approver_login", "approver_role",
      "artifact_sha256", "candidate_sha256", "expires_at", "issued_at", "policy_id",
      "release_manifest_core_sha256", "status",
    ], "approval receipt");
    sha256(payload.artifact_sha256, "artifact_sha256");
    sha256(payload.candidate_sha256, "candidate_sha256");
    sha256(payload.release_manifest_core_sha256, "release_manifest_core_sha256");
    assert.equal(payload.artifact_sha256, payload.candidate_sha256);
    assert.equal(payload.approval_decision, "APPROVE");
    assert.match(payload.approver_identity, /^github-actor-id:[1-9][0-9]*$/u);
    assert.match(payload.approver_login, /^[A-Za-z0-9-]{1,39}$/u);
    assert.equal(payload.approver_role, "release-owner");
    assert.equal(payload.policy_id, "RUNA-RELEASE-V1");
  } else if (role === "version-classification") {
    exact(payload, [
      "candidate_sha256", "classification", "expires_at", "issued_at",
      "release_manifest_core_sha256", "status", "version",
    ], "version classification");
    sha256(payload.candidate_sha256, "candidate_sha256");
    sha256(payload.release_manifest_core_sha256, "release_manifest_core_sha256");
    assert.match(payload.version, VERSION);
    assert.match(payload.classification, /^(?:initial|major|minor|patch)$/u);
  } else if (role === "repository-controls") {
    exact(payload, [
      "administrators_enforced", "branch", "commit_sha", "deletions_allowed",
      "dismiss_stale_reviews", "expires_at", "force_pushes_allowed", "issued_at",
      "pull_request_required", "repository", "required_approving_reviews",
      "required_status_checks", "status",
    ], "repository controls");
    assert.equal(payload.repository, "Runa-Laboratories/runa-lib-ts");
    assert.equal(payload.branch, "main");
    assert.match(payload.commit_sha, COMMIT);
    assert.equal(payload.pull_request_required, true);
    assert.equal(payload.required_approving_reviews, 0);
    assert.equal(payload.dismiss_stale_reviews, true);
    assert.deepEqual(payload.required_status_checks,
      ["release-admission", "ts-quality-gates"]);
    assert.equal(payload.administrators_enforced, true);
    assert.equal(payload.force_pushes_allowed, false);
    assert.equal(payload.deletions_allowed, false);
  } else if (role === "cross-language") {
    exact(payload, [
      "authority_head_sha", "candidate_sha256", "candidate_source_commit",
      "candidate_set_digest", "canonical_contract_sha256", "conformance_counts",
      "conformance_verdict_sha256", "expires_at", "issued_at", "python_artifacts",
      "status", "typescript_artifact",
    ], "cross-language evidence");
    sha256(payload.candidate_sha256, "candidate_sha256");
    assert.match(payload.candidate_source_commit, COMMIT);
    assert.match(payload.authority_head_sha, COMMIT);
    sha256(payload.canonical_contract_sha256, "canonical_contract_sha256");
    sha256(payload.conformance_verdict_sha256, "conformance_verdict_sha256");
    assert.match(payload.candidate_set_digest, /^sha256:[a-f0-9]{64}$/u);
    exact(payload.conformance_counts, ["fixtures", "modes", "operations"],
      "cross-language conformance counts");
    assert(Number.isSafeInteger(payload.conformance_counts.fixtures) &&
      payload.conformance_counts.fixtures > 0);
    assert.equal(payload.conformance_counts.modes, 3);
    assert.equal(payload.conformance_counts.operations, 13);
    artifact(payload.typescript_artifact, "typescript");
    exact(payload.python_artifacts, [
      "candidate_manifest_sha256", "candidate_run_id", "sdist", "source_commit", "wheel",
    ], "Python artifact bindings");
    sha256(payload.python_artifacts.candidate_manifest_sha256,
      "python_artifacts.candidate_manifest_sha256");
    assert(Number.isSafeInteger(payload.python_artifacts.candidate_run_id) &&
      payload.python_artifacts.candidate_run_id > 0);
    assert.match(payload.python_artifacts.source_commit, COMMIT);
    artifact(payload.python_artifacts.wheel, "wheel");
    artifact(payload.python_artifacts.sdist, "sdist");
    const candidateSet = [
      { form: "python-sdist", digest: `sha256:${payload.python_artifacts.sdist.sha256}` },
      { form: "python-wheel", digest: `sha256:${payload.python_artifacts.wheel.sha256}` },
      { form: "typescript-tarball", digest: `sha256:${payload.candidate_sha256}` },
    ];
    assert.equal(payload.candidate_set_digest,
      `sha256:${createHash("sha256").update(jcsBytes(candidateSet)).digest("hex")}`);
  } else if (role === "publication") {
    exact(payload, [
      "candidate_sha256", "dist_tag", "expires_at", "issued_at",
      "oidc_trusted_publisher", "package_name", "provenance_attestation_required",
      "registry", "registry_retrieval_required", "status", "version",
    ], "publication readiness");
    sha256(payload.candidate_sha256, "candidate_sha256");
    assert.equal(payload.package_name, "@runa_laboratories/sdk");
    assert.match(payload.version, VERSION);
    assert.equal(payload.registry, "https://registry.npmjs.org");
    assert.match(payload.dist_tag, /^(?:latest|next|beta|rc)$/u);
    assert.equal(payload.oidc_trusted_publisher, true);
    assert.equal(payload.provenance_attestation_required, true);
    assert.equal(payload.registry_retrieval_required, true);
  } else if (role === "sbom-validation") {
    exact(payload, [
      "artifact_subject_sha256", "bom_format", "candidate_sha256",
      "dependency_closure_sha256", "expires_at", "issued_at",
      "local_validation_sha256", "sbom_sha256", "schema_sha256s",
      "spec_version", "status", "tool",
    ], "SBOM validation");
    for (const field of [
      "artifact_subject_sha256", "candidate_sha256", "dependency_closure_sha256",
      "sbom_sha256", "local_validation_sha256",
    ]) sha256(payload[field], field);
    assert.equal(payload.artifact_subject_sha256, payload.candidate_sha256);
    assert.equal(payload.bom_format, "CycloneDX");
    assert.equal(payload.spec_version, "1.6");
    assert.deepEqual(payload.tool, {
      name: "cyclonedx-cli", version: "0.32.0",
      sha256: "454879e6a4a405c8a13bff49b8982adcb0596f3019b26b0811c66e4d7f0783e1",
    });
    assert.deepEqual(payload.schema_sha256s, {
      ".runa/schemas/cyclonedx-1.6.schema.json": "3e92dddbc30cf7f6a02b80f0942b1a4cfd4fb1c26f1dfc4310afa9d613cafb93",
      ".runa/schemas/jsf-0.82.schema.json": "8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae",
      ".runa/schemas/spdx.schema.json": "baa9d3bd1ed57b6751b0887edead6b5063ff53ff7429cf85d476c6c94af0166e",
    });
  } else if (role === "external-interfaces") {
    exact(payload, [
      "candidate_sha256", "expires_at", "github_attestations_api_required",
      "github_release_required", "issued_at", "npm_registry_required",
      "receipt_types", "status", "withdrawal_policy_id",
    ], "external release interfaces");
    sha256(payload.candidate_sha256, "candidate_sha256");
    assert.equal(payload.github_attestations_api_required, true);
    assert.equal(payload.github_release_required, true);
    assert.equal(payload.npm_registry_required, true);
    assert.deepEqual(payload.receipt_types,
      ["github-attestation", "npm-registry", "provenance"]);
    assert.equal(payload.withdrawal_policy_id, "TS-053-WITHDRAWAL-V1");
  } else if (role === "acceptance-results") {
    exact(payload, [
      "candidate_sha256", "expires_at", "issued_at", "oracle", "prd_source_digest",
      "release_manifest_core_sha256", "results", "schema_version", "status",
    ], "acceptance results");
    assert.equal(payload.schema_version, 1);
    sha256(payload.candidate_sha256, "candidate_sha256");
    sha256(payload.release_manifest_core_sha256, "release_manifest_core_sha256");
    assert.match(payload.prd_source_digest, /^sha256:[a-f0-9]{64}$/u);
    exact(payload.oracle, [
      "head_sha", "provider", "repository", "run_attempt", "run_id", "workflow",
    ], "acceptance oracle");
    assert.equal(payload.oracle.provider, "github-actions");
    assert.equal(payload.oracle.repository, AUTHORITY_REPOSITORY);
    assert.equal(payload.oracle.workflow, AUTHORITY_WORKFLOW);
    assert.match(payload.oracle.head_sha, COMMIT);
    assert(Number.isSafeInteger(payload.oracle.run_id) && payload.oracle.run_id > 0);
    assert(Number.isSafeInteger(payload.oracle.run_attempt) && payload.oracle.run_attempt > 0);
    assert(Array.isArray(payload.results) && payload.results.length > 0);
    const seen = new Set();
    for (const result of payload.results) {
      exact(result, ["oracle_case", "status", "test_id"], "acceptance result");
      assert.match(result.test_id, TEST_ID);
      assert.equal(seen.has(result.test_id), false);
      seen.add(result.test_id);
      assert.equal(result.status, "PASS");
      assert.match(result.oracle_case, /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u);
    }
  } else {
    assert.fail(`Unknown trusted release role: ${role}`);
  }
  return true;
}

export function validateAuthorityPayloadRelations(payloads, contractProvenance) {
  const approval = payloads.approval_receipt;
  const version = payloads.version_classification;
  const repository = payloads.repository_controls;
  const crossLanguage = payloads.cross_language;
  const publication = payloads.publication_readiness;
  const sbom = payloads.sbom_validation;
  const external = payloads.external_release_interfaces;
  const acceptance = payloads.acceptance_results;
  const candidateSha = approval.candidate_sha256;
  assert.equal(approval.artifact_sha256, candidateSha);
  for (const payload of [version, crossLanguage, publication, sbom, external, acceptance]) {
    assert.equal(payload.candidate_sha256, candidateSha);
  }
  assert.equal(sbom.artifact_subject_sha256, candidateSha);
  assert.equal(crossLanguage.typescript_artifact.sha256, candidateSha);
  assert.equal(crossLanguage.candidate_source_commit, repository.commit_sha);
  assert.equal(crossLanguage.authority_head_sha, acceptance.oracle.head_sha);
  assert.equal(crossLanguage.canonical_contract_sha256,
    contractProvenance.canonical_contract_sha256);
  assert.equal(version.version, publication.version);
  assert.equal(approval.release_manifest_core_sha256,
    version.release_manifest_core_sha256);
  assert.equal(approval.release_manifest_core_sha256,
    acceptance.release_manifest_core_sha256);
  return true;
}

export function validateSbomEvidenceBinding(payload, {
  candidateSha256,
  sbomBytes,
  runtimeClosure,
  localValidationBytes,
}) {
  validateTrustedRolePayload("sbom-validation", payload);
  assert.equal(payload.candidate_sha256, candidateSha256);
  assert.equal(payload.artifact_subject_sha256, candidateSha256);
  assert.equal(payload.sbom_sha256,
    createHash("sha256").update(sbomBytes).digest("hex"));
  assert.equal(payload.local_validation_sha256,
    createHash("sha256").update(localValidationBytes).digest("hex"));
  const localValidation = JSON.parse(localValidationBytes.toString("utf8"));
  assert.equal(localValidation.status, "PASS");
  assert.deepEqual(payload.schema_sha256s, localValidation.schema_sha256s);
  assert.deepEqual(payload.tool, localValidation.tool);
  assert.equal(runtimeClosure.status, "PASS");
  assert.equal(runtimeClosure.candidate_sha256, candidateSha256);
  sha256(runtimeClosure.closure_sha256, "runtimeClosure.closure_sha256");
  assert.equal(payload.dependency_closure_sha256, runtimeClosure.closure_sha256);
  return true;
}
