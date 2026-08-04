import assert from "node:assert/strict";
import { test } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  validateAuthorityPayloadRelations,
  validateSbomEvidenceBinding,
  validateTrustedRolePayload,
} from "../scripts/release-authority-schema.mjs";
import { jcsBytes } from "../scripts/trusted-evidence.mjs";

const common = {
  status: "PASS",
  issued_at: "2026-07-30T00:00:00.000Z",
  expires_at: "2026-07-30T00:30:00.000Z",
};
const digest = "a".repeat(64);
const tool = {
  name: "cyclonedx-cli", version: "0.32.0",
  sha256: "454879e6a4a405c8a13bff49b8982adcb0596f3019b26b0811c66e4d7f0783e1",
};
const schemaSha256s = {
  ".runa/schemas/cyclonedx-1.6.schema.json": "3e92dddbc30cf7f6a02b80f0942b1a4cfd4fb1c26f1dfc4310afa9d613cafb93",
  ".runa/schemas/jsf-0.82.schema.json": "8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae",
  ".runa/schemas/spdx.schema.json": "baa9d3bd1ed57b6751b0887edead6b5063ff53ff7429cf85d476c6c94af0166e",
};

test("trusted signatures cannot substitute for closed release-role semantics", () => {
  const valid = {
    approval: {
      ...common, candidate_sha256: digest, artifact_sha256: digest,
      release_manifest_core_sha256: digest, approval_decision: "APPROVE",
      approver_identity: "github-actor-id:1234567", approver_login: "release-owner",
      approver_role: "release-owner", policy_id: "RUNA-RELEASE-V1",
    },
    "version-classification": {
      ...common, candidate_sha256: digest,
      release_manifest_core_sha256: digest, version: "0.1.0",
      classification: "initial",
    },
    publication: {
      ...common, candidate_sha256: digest, package_name: "@runa_laboratories/sdk",
      version: "0.1.0", registry: "https://registry.npmjs.org",
      dist_tag: "next", oidc_trusted_publisher: true,
      provenance_attestation_required: true,
      registry_retrieval_required: true,
    },
    "sbom-validation": {
      ...common, candidate_sha256: digest, sbom_sha256: digest,
      artifact_subject_sha256: digest, dependency_closure_sha256: digest,
      local_validation_sha256: digest, schema_sha256s: schemaSha256s, tool,
      bom_format: "CycloneDX", spec_version: "1.6",
    },
    "external-interfaces": {
      ...common, candidate_sha256: digest,
      github_attestations_api_required: true, github_release_required: true,
      npm_registry_required: true,
      receipt_types: ["github-attestation", "npm-registry", "provenance"],
      withdrawal_policy_id: "TS-053-WITHDRAWAL-V1",
    },
    "repository-controls": {
      ...common, administrators_enforced: true, branch: "main",
      commit_sha: "a".repeat(40), deletions_allowed: false,
      dismiss_stale_reviews: true, force_pushes_allowed: false,
      pull_request_required: true, repository: "Runa-Laboratories/runa-lib-ts",
      required_approving_reviews: 0,
      required_status_checks: ["release-admission", "ts-quality-gates"],
    },
    "cross-language": (() => {
      const wheel = "b".repeat(64);
      const sdist = "c".repeat(64);
      const candidateSet = createHash("sha256").update(jcsBytes([
        { form: "python-sdist", digest: `sha256:${sdist}` },
        { form: "python-wheel", digest: `sha256:${wheel}` },
        { form: "typescript-tarball", digest: `sha256:${digest}` },
      ])).digest("hex");
      return {
        ...common, authority_head_sha: "d".repeat(40), candidate_sha256: digest,
        candidate_source_commit: "a".repeat(40),
        candidate_set_digest: `sha256:${candidateSet}`,
        canonical_contract_sha256: "e".repeat(64),
        conformance_counts: { fixtures: 1, modes: 3, operations: 14 },
        conformance_verdict_sha256: "f".repeat(64),
        python_artifacts: {
          candidate_manifest_sha256: "1".repeat(64), candidate_run_id: 2,
          source_commit: "2".repeat(40),
          wheel: { filename: "runa_sdk-0.1.0-py3-none-any.whl", sha256: wheel },
          sdist: { filename: "runa_sdk-0.1.0.tar.gz", sha256: sdist },
        },
        typescript_artifact: {
          filename: "runa_laboratories-sdk-0.1.0.tgz", sha256: digest,
        },
      };
    })(),
    "acceptance-results": {
      schema_version: 1, ...common, candidate_sha256: digest,
      oracle: {
        provider: "github-actions",
        repository: "Runa-Laboratories/runa-release-authority",
        workflow: ".github/workflows/release-authority.yml",
        run_id: 123, run_attempt: 1, head_sha: "d".repeat(40),
      },
      prd_source_digest: "2".repeat(64),
      release_manifest_core_sha256: digest,
      results: [{
        test_id: "TC-001-01", status: "PASS",
        oracle_case: "verified-candidate:TC-001-01",
      }],
    },
  };
  for (const [role, payload] of Object.entries(valid)) {
    assert.equal(validateTrustedRolePayload(role, payload), true);
    assert.throws(() => validateTrustedRolePayload(role, common));
    const missing = { ...payload };
    delete missing[role === "repository-controls" ? "commit_sha" : "candidate_sha256"];
    assert.throws(() => validateTrustedRolePayload(role, missing));
  }
  for (const mutation of [
    { role: "repository-controls", field: "force_pushes_allowed", value: true },
    { role: "cross-language", field: "untrusted_binding", value: digest },
    { role: "approval", field: "approver_identity", value: "github-login:owner" },
  ]) {
    const payload = structuredClone(valid[mutation.role]);
    payload[mutation.field] = mutation.value;
    assert.throws(() => validateTrustedRolePayload(mutation.role, payload));
  }
});

test("producer buildClaims approval fixture round-trips through the consumer schema", async () => {
  const payload = JSON.parse(await readFile(new URL(
    "./fixtures/release-authority-v2/producer-approval-receipt.json", import.meta.url,
  ), "utf8"));
  assert.equal(validateTrustedRolePayload("approval", payload), true);
});

test("cross-role contradictions are rejected", () => {
  const candidate = "a".repeat(64);
  const manifest = "d".repeat(64);
  const base = {
    approval_receipt: { candidate_sha256: candidate, artifact_sha256: candidate,
      release_manifest_core_sha256: manifest },
    version_classification: { candidate_sha256: candidate,
      release_manifest_core_sha256: manifest, version: "0.1.0" },
    repository_controls: { commit_sha: "1".repeat(40) },
    cross_language: {
      candidate_sha256: candidate, candidate_source_commit: "1".repeat(40),
      authority_head_sha: "2".repeat(40), canonical_contract_sha256: "e".repeat(64),
      typescript_artifact: { sha256: candidate },
    },
    publication_readiness: { candidate_sha256: candidate, version: "0.1.0" },
    sbom_validation: { candidate_sha256: candidate, artifact_subject_sha256: candidate },
    external_release_interfaces: { candidate_sha256: candidate },
    acceptance_results: { candidate_sha256: candidate,
      release_manifest_core_sha256: manifest, oracle: { head_sha: "2".repeat(40) } },
  };
  assert.equal(validateAuthorityPayloadRelations(base, {
    canonical_contract_sha256: "e".repeat(64),
  }), true);
  const contradictory = structuredClone(base);
  contradictory.cross_language.typescript_artifact.sha256 = "f".repeat(64);
  assert.throws(() => validateAuthorityPayloadRelations(contradictory, {
    canonical_contract_sha256: "e".repeat(64),
  }));
});

test("trusted SBOM authority is bound to exact local bytes and closure", () => {
  const candidate = "a".repeat(64);
  const closure = "b".repeat(64);
  const sbomBytes = Buffer.from('{"bomFormat":"CycloneDX"}\n');
  const localValidationBytes = Buffer.from(`${JSON.stringify({
    status: "PASS", schema_sha256s: schemaSha256s, tool,
  })}\n`);
  const payload = {
    status: "PASS",
    issued_at: "2026-08-01T00:00:00Z",
    expires_at: "2026-08-03T00:00:00Z",
    candidate_sha256: candidate,
    artifact_subject_sha256: candidate,
    dependency_closure_sha256: closure,
    local_validation_sha256: createHash("sha256").update(localValidationBytes).digest("hex"),
    sbom_sha256: createHash("sha256").update(sbomBytes).digest("hex"),
    schema_sha256s: schemaSha256s,
    tool,
    bom_format: "CycloneDX",
    spec_version: "1.6",
  };
  const runtimeClosure = {
    status: "PASS",
    candidate_sha256: candidate,
    closure_sha256: closure,
  };
  assert.equal(validateSbomEvidenceBinding(payload, {
    candidateSha256: candidate,
    sbomBytes,
    runtimeClosure,
    localValidationBytes,
  }), true);
  for (const mutate of [
    (_value, context) => { context.sbomBytes = Buffer.from("changed"); },
    (value) => { value.dependency_closure_sha256 = "c".repeat(64); },
    (_value, context) => { context.runtimeClosure.candidate_sha256 = "d".repeat(64); },
  ]) {
    const value = structuredClone(payload);
    const context = {
      candidateSha256: candidate,
      sbomBytes,
      runtimeClosure: structuredClone(runtimeClosure),
      localValidationBytes,
    };
    mutate(value, context);
    assert.throws(() => validateSbomEvidenceBinding(value, context));
  }
});
