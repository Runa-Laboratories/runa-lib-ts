import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { validateContractProvenance } from "./contract-generation.mjs";
import { validateExternalAcceptancePayload } from "./acceptance-receipts.mjs";
import { appendReleaseManifestState } from "./release-manifest-envelope.mjs";
import { verifyTrustedEnvelope } from "./trusted-evidence.mjs";
import {
  validateAuthorityPayloadRelations,
  validateSbomEvidenceBinding,
  validateTrustedRolePayload,
} from "./release-authority-schema.mjs";
import {
  resolveReleaseChannel,
  validateReleaseMapping,
} from "./postpublish-policy.mjs";
import { verifyAuthorityAssets } from "./public-authority-transport.mjs";

const preflightOnly = process.env.RUNA_AUTHORITY_PREFLIGHT === "1";
const authorityInput = process.env.RUNA_AUTHORITY_INPUT_DIR ?? "authority-input";
let bundle;
let bundleBytes;
try {
  bundleBytes = await readFile(`${authorityInput}/release-authority-bundle.json`);
  bundle = JSON.parse(bundleBytes.toString("utf8"));
} catch {
  throw new Error("Independently downloaded release authority bundle is missing or invalid.");
}
const exact = [
  "contract_provenance",
  "cross_language",
  "external_release_interfaces",
  "approval_receipt",
  "acceptance_results",
  "publication_readiness",
  "repository_controls",
  "sbom_validation",
  "schema_version",
  "version_classification",
].sort();
assert.equal(bundle.schema_version, 1);
assert.deepEqual(Object.keys(bundle).sort(), exact);

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let trustPolicy;
try {
  trustPolicy = JSON.parse(
    await readFile("governance/release-trust.json", "utf8"),
  );
} catch {
  console.log("release authority import: BLOCKED (no accepted trust root)");
  process.exit(0);
}
const authorityAssets = new Map([
  ["release-authority-bundle.json", bundleBytes],
  ["release-authority-bundle.json.sig",
    await readFile(`${authorityInput}/release-authority-bundle.json.sig`)],
  ["release-authority-bundle.json.sha256",
    await readFile(`${authorityInput}/release-authority-bundle.json.sha256`)],
]);
const verifiedAuthority = verifyAuthorityAssets(authorityAssets, trustPolicy, Date.now());
bundle = verifiedAuthority.bundle;
const expectedBundleSha = process.env.RUNA_EXPECTED_AUTHORITY_BUNDLE_SHA256;
if (expectedBundleSha !== undefined) {
  assert.match(expectedBundleSha, /^[a-f0-9]{64}$/u);
  assert.equal(verifiedAuthority.detached.bundle_sha256, expectedBundleSha,
    "Authority bytes differ from the phase-A identity.");
}
const releasePolicy = JSON.parse(await readFile(".runa/release-policy.json", "utf8"));
const authorityRun = JSON.parse(await readFile("evidence/authority-run.json", "utf8"));
assert.deepEqual(Object.keys(authorityRun).sort(), [
  "artifact", "head_sha", "repository", "run_attempt", "run_id",
  "schema_version", "status", "workflow",
].sort());
assert.equal(authorityRun.schema_version, 1);
assert.equal(authorityRun.status, "PASS");
assert.equal(releasePolicy.releaseAuthority.status, "configured");
assert.equal(authorityRun.repository, releasePolicy.releaseAuthority.authority.repository);
assert.equal(authorityRun.workflow, releasePolicy.releaseAuthority.authority.workflow);
assert.equal(authorityRun.artifact, releasePolicy.releaseAuthority.authority.artifact);
assert.match(authorityRun.head_sha, /^[0-9a-f]{40}$/u);
assert(Number.isSafeInteger(authorityRun.run_id) && authorityRun.run_id > 0);
assert(Number.isSafeInteger(authorityRun.run_attempt) && authorityRun.run_attempt > 0);
for (const [environment, actual, pattern] of [
  ["RUNA_EXPECTED_AUTHORITY_HEAD_SHA", authorityRun.head_sha, /^[a-f0-9]{40}$/u],
  ["RUNA_EXPECTED_AUTHORITY_RUN_ID", String(authorityRun.run_id), /^[1-9][0-9]*$/u],
  ["RUNA_EXPECTED_AUTHORITY_RUN_ATTEMPT", String(authorityRun.run_attempt), /^[1-9][0-9]*$/u],
]) {
  const expectedValue = process.env[environment];
  if (expectedValue !== undefined) {
    assert.match(expectedValue, pattern);
    assert.equal(String(actual), expectedValue,
      `${environment} differs from the phase-A authority identity.`);
  }
}
const candidateBytes = await readFile("release-artifacts/candidate.json");
const candidate = JSON.parse(candidateBytes.toString("utf8"));
const releaseManifestCoreBytes = await readFile(
  "release-artifacts/release-manifest-core.json",
);
const releaseMapping = JSON.parse(
  await readFile("governance/release-mapping.json", "utf8"),
);
validateReleaseMapping(releaseMapping);
const releaseChannel = resolveReleaseChannel(releaseMapping, candidate.version);
const projection = await readFile("contracts/runa-sdk.projection.json");
const openapi = await readFile("contracts/runa-api.openapi.json");
const sbomBytes = await readFile("evidence/sbom.cdx.json");
const sbomLocalValidationBytes = await readFile("evidence/sbom-local-validation.json");
const runtimeClosure = JSON.parse(
  await readFile("evidence/runtime-closure.json", "utf8"),
);
const requirementMap = JSON.parse(
  await readFile("evidence/requirement-test-map.json", "utf8"),
);
const canonical = (await readFile("contracts/runa-api.openapi.sha256", "utf8"))
  .trim().split(/\s+/, 1)[0];
assert.equal(validateContractProvenance(bundle.contract_provenance, {
  canonical,
  projection: hash(projection),
  openapi: hash(openapi),
}), true);
assert.equal(bundle.contract_provenance.status, "APPROVED");

const entries = [
  ["approval_receipt", "approval", "release-approval",
    (payload) => payload.candidate_sha256 === candidate.sha256 &&
      payload.artifact_sha256 === candidate.sha256 &&
      payload.release_manifest_core_sha256 === hash(releaseManifestCoreBytes)],
  ["version_classification", "version-classification", "version-classification",
    (payload) => payload.candidate_sha256 === candidate.sha256 &&
      payload.version === candidate.version &&
      payload.release_manifest_core_sha256 === hash(releaseManifestCoreBytes)],
  ["repository_controls", "repository-controls", "repository-controls",
    (payload) => payload.commit_sha === candidate.source_commit],
  ["cross_language", "cross-language", "cross-language",
    (payload) => payload.canonical_contract_sha256 === canonical &&
      payload.candidate_sha256 === candidate.sha256 &&
      payload.candidate_source_commit === candidate.source_commit &&
      payload.typescript_artifact.sha256 === candidate.sha256 &&
      payload.typescript_artifact.filename === candidate.filename &&
      payload.authority_head_sha === authorityRun.head_sha],
  ["publication_readiness", "publication", "publication-readiness",
    (payload) => payload.candidate_sha256 === candidate.sha256 &&
      payload.package_name === releaseMapping.package_name &&
      payload.version === candidate.version &&
      payload.registry === releaseMapping.registry &&
      payload.dist_tag === releaseChannel.dist_tag],
  ["sbom_validation", "sbom-validation", "sbom-validation",
    (payload) => payload.candidate_sha256 === candidate.sha256],
  ["external_release_interfaces", "external-interfaces", "external-release-interfaces",
    (payload) => payload.candidate_sha256 === candidate.sha256],
  ["acceptance_results", "acceptance-results", "external-acceptance",
    (payload) => {
      validateExternalAcceptancePayload(payload, {
        catalog: new Set(requirementMap.acceptance_test_ids),
        prdSourceDigest: requirementMap.source_digest,
        candidateSha256: candidate.sha256,
        releaseManifestCoreSha256: hash(releaseManifestCoreBytes),
        expectedOracle: {
          provider: "github-actions",
          repository: authorityRun.repository,
          workflow: authorityRun.workflow,
          run_id: authorityRun.run_id,
          run_attempt: authorityRun.run_attempt,
          head_sha: authorityRun.head_sha,
        },
      });
      return true;
    }],
];
const retained = [];
const payloads = {};
for (const [field, role, filename, binding] of entries) {
  const envelope = bundle[field];
  const payload = verifyTrustedEnvelope(envelope, trustPolicy, role, Date.now(), {
    requiredSchemaVersion: 2,
  });
  assert.notEqual(payload, undefined, `Invalid trusted ${field} evidence.`);
  assert.equal(validateTrustedRolePayload(role, payload), true);
  payloads[field] = payload;
  assert.equal(binding(payload), true, `Mismatched ${field} candidate binding.`);
  if (role === "sbom-validation") {
    assert.equal(validateSbomEvidenceBinding(payload, {
      candidateSha256: candidate.sha256,
      sbomBytes,
      runtimeClosure,
      localValidationBytes: sbomLocalValidationBytes,
    }), true);
  }
  retained.push([`evidence/${filename}.json`, envelope]);
}
assert.equal(validateAuthorityPayloadRelations(payloads, bundle.contract_provenance), true);
if (!preflightOnly) {
  await mkdir("evidence", { recursive: true });
  await writeFile("contracts/runa-sdk-contract.provenance.json",
    `${JSON.stringify(bundle.contract_provenance, null, 2)}\n`);
  for (const [filename, envelope] of retained) {
    await writeFile(filename, `${JSON.stringify(envelope, null, 2)}\n`);
  }
  await appendReleaseManifestState("authority-admitted", Object.fromEntries(
    retained.map(([filename]) => [
      filename.split("/").at(-1).replace(/\.json$/u, ""), filename,
    ]),
  ));
}
console.log(`release authority ${preflightOnly ? "preflight" : "import"}: PASS (${candidate.sha256})`);
