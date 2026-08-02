import assert from "node:assert/strict";
import { test } from "vitest";
import { createHash } from "node:crypto";
import {
  validateSbomEvidenceBinding,
  validateTrustedRolePayload,
} from "../scripts/release-authority-schema.mjs";

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
      approver_role: "release-owner", policy_id: "TS-RELEASE-V1",
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
  };
  for (const [role, payload] of Object.entries(valid)) {
    assert.equal(validateTrustedRolePayload(role, payload), true);
    assert.throws(() => validateTrustedRolePayload(role, common));
    const missing = { ...payload };
    delete missing.candidate_sha256;
    assert.throws(() => validateTrustedRolePayload(role, missing));
  }
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
