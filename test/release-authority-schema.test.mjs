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

test("trusted signatures cannot substitute for closed release-role semantics", () => {
  const valid = {
    publication: {
      ...common, candidate_sha256: digest, package_name: "@runa/sdk",
      version: "0.1.0", registry: "https://registry.npmjs.org",
      dist_tag: "next", oidc_trusted_publisher: true,
      provenance_attestation_required: true,
      registry_retrieval_required: true,
    },
    "sbom-validation": {
      ...common, candidate_sha256: digest, sbom_sha256: digest,
      artifact_subject_sha256: digest, dependency_closure_sha256: digest,
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
  const payload = {
    status: "PASS",
    issued_at: "2026-08-01T00:00:00Z",
    expires_at: "2026-08-03T00:00:00Z",
    candidate_sha256: candidate,
    artifact_subject_sha256: candidate,
    dependency_closure_sha256: closure,
    sbom_sha256: createHash("sha256").update(sbomBytes).digest("hex"),
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
    };
    mutate(value, context);
    assert.throws(() => validateSbomEvidenceBinding(value, context));
  }
});
