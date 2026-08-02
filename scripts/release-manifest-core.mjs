import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function canonicalizeJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true, "RFC 8785 forbids non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  assert.equal(typeof value, "object");
  const prototype = Object.getPrototypeOf(value);
  assert.equal(prototype === Object.prototype || prototype === null, true);
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`).join(",")}}`;
}

export const EXPECTED_RELEASE_POLICY = Object.freeze({
  packageMetadata: {
    repository: "https://github.com/Runa-Laboratories/runa-lib-ts",
    repositoryVisibility: "public",
    packageAccess: "public",
  },
  releaseAuthority: {
    status: "unconfigured",
    authority: null,
  },
  provenance: {
    attestation: "actions/attest-build-provenance@0f67c3f4856b2e3261c31976d6725780e5e4c373",
    verifier: "gh attestation verify <artifact> --repo Runa-Laboratories/runa-lib-ts --signer-workflow Runa-Laboratories/runa-lib-ts/.github/workflows/release.yml",
  },
  publisher: { ci: {
    environment: "npm", idToken: "write", minimumNode: "22.14.0",
    minimumNpm: "11.5.1", platform: "github-hosted-github-actions",
    workflow: ".github/workflows/release.yml",
  } },
  registry: {
    package: "@runa/sdk", url: "https://registry.npmjs.org/",
    verificationPath: "GET https://registry.npmjs.org/@runa%2fsdk/${version}",
  },
  sbom: {
    format: "CycloneDX 1.6 JSON",
    schemaPath: null,
    verifier: "external-authority-required",
  },
  sourceControl: {
    branchProtection: {
      directPushes: false, dismissStaleApprovals: true,
      requireCodeOwnerReviews: true, requiredApprovingReviews: 1,
      requiredStatusChecks: ["ts-quality-gates", "release-admission"],
    },
    provider: "github", releaseBranch: "main",
    repository: "Runa-Laboratories/runa-lib-ts",
    repositoryUri: "https://github.com/Runa-Laboratories/runa-lib-ts",
  },
  tag: {
    signature: {
      certificateIdentity: "https://github.com/Runa-Laboratories/runa-lib-ts/.github/workflows/release.yml@refs/heads/main",
      issuer: "https://token.actions.githubusercontent.com",
      technology: "sigstore-keyless",
    },
    template: "ts-v${version}",
  },
  trustedPublisher: {
    allowedAction: "npm publish", audience: "npm:registry.npmjs.org",
    environment: "npm", issuer: "https://token.actions.githubusercontent.com",
    organization: "Runa-Laboratories", repository: "runa-lib-ts",
    subject: "repo:Runa-Laboratories/runa-lib-ts:environment:npm",
    workflow: "release.yml",
  },
});

const readBytes = (root, file) => readFile(path.join(root, file));
const jsonDigest = async (root, file) => sha256(Buffer.from(canonicalizeJson(
  JSON.parse((await readBytes(root, file)).toString("utf8")),
)));

export async function createReleaseManifestCore({
  repositoryRoot = ".",
  handoffRoot = ".",
} = {}) {
  const candidate = JSON.parse((await readBytes(
    handoffRoot, "release-artifacts/candidate.json")).toString("utf8"));
  const packageJson = JSON.parse((await readBytes(
    repositoryRoot, "package.json")).toString("utf8"));
  const compatibilityCatalog = JSON.parse((await readBytes(
    repositoryRoot, "compatibility/ts-050-evidence-v1.json")).toString("utf8"));
  const releasePolicy = JSON.parse((await readBytes(
    repositoryRoot, ".runa/release-policy.json")).toString("utf8"));
  assert.deepEqual(releasePolicy, EXPECTED_RELEASE_POLICY);
  assert.equal(candidate.package, packageJson.name);
  assert.equal(candidate.version, packageJson.version);
  const evidenceFiles = [
    "ci-candidate-manifest.json",
    "compatibility-matrix.json",
    "dependency-audit.json",
    "docs-readiness.json",
    "performance-local.json",
    "quality-gate.json",
    "release-smoke.json",
    "requirement-test-map.json",
    "runtime-closure.json",
    "sbom.cdx.json",
  ];
  const evidence = {};
  for (const file of evidenceFiles) {
    evidence[file] = sha256(await readBytes(handoffRoot, `evidence/${file}`));
  }
  const runtimeClosure = JSON.parse((await readBytes(
    handoffRoot, "evidence/runtime-closure.json")).toString("utf8"));
  const sbom = JSON.parse((await readBytes(
    handoffRoot, "evidence/sbom.cdx.json")).toString("utf8"));
  assert.equal(runtimeClosure.candidate_sha256, candidate.sha256);
  assert.equal(sbom.metadata?.component?.hashes?.[0]?.content, candidate.sha256);
  return {
    schema_version: 1,
    package: {
      name: candidate.package,
      version: candidate.version,
      repository: packageJson.repository?.url,
    },
    candidate: {
      filename: candidate.filename,
      sha256: candidate.sha256,
      source_commit: candidate.source_commit,
    },
    release: {
      tag: `ts-v${candidate.version}`,
      release_channel: candidate.version.includes("-") ? "prerelease" : "stable",
      semver_classification: {
        status: "external-authority-required",
        evidence_role: "version-classification",
      },
      compatibility_matrix_revision: compatibilityCatalog.catalog_revision,
    },
    inputs: {
      changelog_sha256: sha256(await readBytes(repositoryRoot, "CHANGELOG.md")),
      ci_workflow_sha256: sha256(await readBytes(
        repositoryRoot, ".github/workflows/ci.yml")),
      lockfile_sha256: sha256(await readBytes(repositoryRoot, "package-lock.json")),
      release_mapping_jcs_sha256: await jsonDigest(
        repositoryRoot, "governance/release-mapping.json"),
      release_policy_jcs_sha256: await jsonDigest(
        repositoryRoot, ".runa/release-policy.json"),
      release_workflow_sha256: sha256(await readBytes(
        repositoryRoot, ".github/workflows/release.yml")),
    },
    evidence,
    runtime_closure_sha256: runtimeClosure.closure_sha256,
    sbom_artifact_subject_sha256:
      sbom.metadata.component.hashes[0].content,
  };
}

export async function validateReleaseManifestCore(core, options) {
  assert.deepEqual(core, await createReleaseManifestCore(options));
  return true;
}

export const releaseManifestCoreBytes = (core) =>
  Buffer.from(canonicalizeJson(core));
