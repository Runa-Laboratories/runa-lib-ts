import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { npmSpawnSync } from "./npm-process.mjs";
import {
  resolveReleaseChannel,
  validatePostpublishReceipt,
  validateReleaseMapping,
} from "./postpublish-policy.mjs";
import { validateAttestationJsonl } from "./attestation-bundle.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const mapping = JSON.parse(await readFile("governance/release-mapping.json", "utf8"));
validateReleaseMapping(mapping);
const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
const release = resolveReleaseChannel(mapping, candidate.version);
const bundle = process.env.RUNA_ATTESTATION_BUNDLE ??
  `evidence/${candidate.filename}.intoto.jsonl`;
const receiptPath = "evidence/postpublish-receipt.json";
await mkdir("evidence", { recursive: true });
const transitions = ["published-unverified"];
const writeState = async (state, extra = {}) => writeFile(receiptPath,
  `${JSON.stringify({
    schema_version: 1,
    state,
    package_name: mapping.package_name,
    version: candidate.version,
    dist_tag: release.dist_tag,
    candidate_sha256: candidate.sha256,
    transitions,
    ...extra,
  }, null, 2)}\n`);
await writeState("published-unverified");

try {
  const metadataResult = npmSpawnSync([
    "view", `${mapping.package_name}@${candidate.version}`, "--json",
    "--registry", mapping.registry,
  ], { encoding: "utf8" });
  assert.equal(metadataResult.status, 0, "R-053-11: registry metadata retrieval failed");
  const metadata = JSON.parse(metadataResult.stdout);
  assert.equal(metadata.name, mapping.package_name);
  assert.equal(metadata.version, candidate.version);
  assert.equal(typeof metadata.dist?.tarball, "string");
  const tagsResult = npmSpawnSync([
    "view", mapping.package_name, "dist-tags", "--json",
    "--registry", mapping.registry,
  ], { encoding: "utf8" });
  assert.equal(tagsResult.status, 0, "R-053-11: dist-tag retrieval failed");
  const tags = JSON.parse(tagsResult.stdout);
  assert.equal(tags[release.dist_tag], candidate.version);
  const response = await fetch(metadata.dist.tarball, { redirect: "error" });
  assert.equal(response.ok, true);
  const registryBytes = Buffer.from(await response.arrayBuffer());
  const registrySha256 = hash(registryBytes);
  assert.equal(registrySha256, candidate.sha256);
  transitions.push("registry-verified");
  await writeState("registry-verified", {
    registry_tarball_sha256: registrySha256,
    registry_metadata_verified: true,
  });

  const repository = process.env.GITHUB_REPOSITORY;
  assert.equal(typeof repository, "string");
  assert.match(repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  assert.equal(path.extname(bundle), ".jsonl");
  const verifyResult = spawnSync("gh", [
    "attestation", "verify",
    path.resolve("release-artifacts", candidate.filename),
    "--repo", repository,
  ], { encoding: "utf8" });
  assert.equal(verifyResult.status, 0, "R-018-12: GitHub attestation verification failed");
  const apiResult = spawnSync("gh", [
    "api",
    `repos/${repository}/attestations/sha256:${candidate.sha256}`,
  ], { encoding: "utf8" });
  assert.equal(apiResult.status, 0, "R-018-12: GitHub Attestations API lookup failed");
  assert.equal(validateAttestationJsonl(
    await readFile(bundle, "utf8"),
    candidate,
  ), true);
  transitions.push("handoff");
  const receipt = {
    schema_version: 1,
    state: "handoff",
    package_name: mapping.package_name,
    version: candidate.version,
    dist_tag: release.dist_tag,
    candidate_sha256: candidate.sha256,
    registry_tarball_sha256: registrySha256,
    registry_metadata_verified: true,
    provenance_verified: true,
    github_attestations_api_verified: true,
    attestation_bundle: bundle,
    transitions,
  };
  assert.equal(validatePostpublishReceipt(receipt, candidate, mapping), true);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`postpublish: PASS (${candidate.version}, ${release.dist_tag})`);
} catch (error) {
  await writeState(transitions.at(-1), {
    status: "BLOCKED",
    failure_category: "postpublish-verification",
  });
  throw error;
}
