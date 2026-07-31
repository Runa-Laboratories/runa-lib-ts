import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { validateContractProvenance } from "./contract-generation.mjs";
import { verifyTrustedEnvelope } from "./trusted-evidence.mjs";

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
  "publication_readiness",
  "repository_controls",
  "sbom_validation",
  "schema_version",
  "trust_policy",
].sort();
assert.equal(bundle.schema_version, 1);
assert.deepEqual(Object.keys(bundle).sort(), exact);

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
const projection = await readFile("contracts/runa-sdk.projection.json");
const openapi = await readFile("contracts/runa-api.openapi.json");
const canonical = (await readFile("contracts/runa-api.openapi.sha256", "utf8"))
  .trim().split(/\s+/, 1)[0];
assert.equal(validateContractProvenance(bundle.contract_provenance, {
  canonical,
  projection: hash(projection),
  openapi: hash(openapi),
}), true);
assert.equal(bundle.contract_provenance.status, "APPROVED");

const entries = [
  ["repository_controls", "repository-controls", "repository-controls",
    (payload) => payload.commit_sha === candidate.source_commit],
  ["cross_language", "cross-language", "cross-language",
    (payload) => payload.canonical_contract_sha256 === canonical],
  ["publication_readiness", "publication", "publication-readiness",
    (payload) => payload.candidate_sha256 === candidate.sha256],
  ["sbom_validation", "sbom-validation", "sbom-validation",
    (payload) => payload.candidate_sha256 === candidate.sha256],
  ["external_release_interfaces", "external-interfaces", "external-release-interfaces",
    (payload) => payload.candidate_sha256 === candidate.sha256],
];
const retained = [];
for (const [field, role, filename, binding] of entries) {
  const envelope = bundle[field];
  const payload = verifyTrustedEnvelope(envelope, bundle.trust_policy, role);
  assert.notEqual(payload, undefined, `Invalid trusted ${field} evidence.`);
  assert.equal(binding(payload), true, `Mismatched ${field} candidate binding.`);
  retained.push([`evidence/${filename}.json`, envelope]);
}
await mkdir("governance", { recursive: true });
await mkdir("evidence", { recursive: true });
await writeFile("governance/release-trust.json",
  `${JSON.stringify(bundle.trust_policy, null, 2)}\n`);
await writeFile("contracts/runa-sdk-contract.provenance.json",
  `${JSON.stringify(bundle.contract_provenance, null, 2)}\n`);
for (const [filename, envelope] of retained) {
  await writeFile(filename, `${JSON.stringify(envelope, null, 2)}\n`);
}
console.log(`release authority import: PASS (${candidate.sha256})`);
