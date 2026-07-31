import assert from "node:assert/strict";
import { test } from "vitest";
import { validateTrustedRolePayload } from "../scripts/release-authority-schema.mjs";

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
