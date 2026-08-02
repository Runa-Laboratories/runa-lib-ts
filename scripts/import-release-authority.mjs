import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { validateContractProvenance } from "./contract-generation.mjs";
import { verifyTrustedEnvelope } from "./trusted-evidence.mjs";
import {
  validateSbomEvidenceBinding,
  validateTrustedRolePayload,
} from "./release-authority-schema.mjs";
import {
  resolveReleaseChannel,
  validateReleaseMapping,
} from "./postpublish-policy.mjs";

const encoded = process.env.RUNA_RELEASE_AUTHORITY_BUNDLE_BASE64;
if (encoded === undefined || encoded === "") {
  console.log("release authority import: BLOCKED (no authority bundle supplied)");
  process.exit(0);
}
let bundle;
try {
  bundle = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
} catch {
  throw new Error("Release authority bundle is not valid base64 JSON.");
}
const exact = [
  "contract_provenance",
  "cross_language",
  "external_release_interfaces",
  "approval_receipt",
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
const runtimeClosure = JSON.parse(
  await readFile("evidence/runtime-closure.json", "utf8"),
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
    (payload) => payload.canonical_contract_sha256 === canonical],
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
];
const retained = [];
for (const [field, role, filename, binding] of entries) {
  const envelope = bundle[field];
  const payload = verifyTrustedEnvelope(envelope, trustPolicy, role);
  assert.notEqual(payload, undefined, `Invalid trusted ${field} evidence.`);
  if (["approval", "version-classification", "publication", "sbom-validation", "external-interfaces"].includes(role)) {
    assert.equal(validateTrustedRolePayload(role, payload), true);
  }
  assert.equal(binding(payload), true, `Mismatched ${field} candidate binding.`);
  if (role === "sbom-validation") {
    assert.equal(validateSbomEvidenceBinding(payload, {
      candidateSha256: candidate.sha256,
      sbomBytes,
      runtimeClosure,
    }), true);
  }
  retained.push([`evidence/${filename}.json`, envelope]);
}
await mkdir("evidence", { recursive: true });
await writeFile("contracts/runa-sdk-contract.provenance.json",
  `${JSON.stringify(bundle.contract_provenance, null, 2)}\n`);
for (const [filename, envelope] of retained) {
  await writeFile(filename, `${JSON.stringify(envelope, null, 2)}\n`);
}
console.log(`release authority import: PASS (${candidate.sha256})`);
