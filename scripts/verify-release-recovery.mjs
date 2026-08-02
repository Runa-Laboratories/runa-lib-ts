import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { validateAttestationJsonl } from "./attestation-bundle.mjs";
import { validateReleaseManifestCore } from "./release-manifest-core.mjs";
import { validateReleaseManifestEnvelope } from "./release-manifest-envelope.mjs";
import {
  resolveReleaseChannel,
  validatePostpublishReceipt,
  validateReleaseMapping,
} from "./postpublish-policy.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const tag = process.env.RUNA_RELEASE_TAG;
const repository = process.env.GITHUB_REPOSITORY;
assert.match(tag ?? "", /^ts-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
assert.equal(repository, "Runa-Laboratories/runa-lib-ts");
const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
assert.equal(tag, `ts-v${candidate.version}`);
assert.equal(execFileSync("git", ["rev-list", "-n", "1", tag], {
  encoding: "utf8",
}).trim(), candidate.source_commit);
const view = spawnSync("gh", [
  "release", "view", tag, "--json", "assets,isDraft,tagName",
], { encoding: "utf8" });
assert.equal(view.status, 0, view.stderr);
const release = JSON.parse(view.stdout);
assert.equal(release.tagName, tag);
assert.equal(release.isDraft, false);
const assetNames = release.assets.map((asset) => asset.name).sort();
const provenanceNames = assetNames.filter((name) => name.endsWith(".intoto.jsonl"));
assert.equal(provenanceNames.length, 1);
assert.deepEqual(assetNames, [
  candidate.filename,
  "postpublish-receipt.json",
  "release-manifest-core.json",
  "release-manifest-envelope.authority-admitted.json",
  "release-manifest-envelope.provenance-attested.json",
  "release-manifest-envelope.json",
  "sbom.cdx.json",
  provenanceNames[0],
].sort());
const directory = await mkdtemp(path.join(tmpdir(), "runa-recovery-"));
try {
  const download = spawnSync("gh", ["release", "download", tag, "--dir", directory], {
    encoding: "utf8",
  });
  assert.equal(download.status, 0, download.stderr);
  const candidateBytes = await readFile(path.join(directory, candidate.filename));
  assert.equal(hash(candidateBytes), candidate.sha256);
  assert.equal(hash(candidateBytes), hash(await readFile(
    `release-artifacts/${candidate.filename}`,
  )));
  const coreBytes = await readFile(path.join(directory, "release-manifest-core.json"));
  const localCoreBytes = await readFile("release-artifacts/release-manifest-core.json");
  assert.equal(hash(coreBytes), hash(localCoreBytes));
  assert.equal(await validateReleaseManifestCore(JSON.parse(coreBytes)), true);
  const sbomBytes = await readFile(path.join(directory, "sbom.cdx.json"));
  assert.equal(hash(sbomBytes), hash(await readFile("evidence/sbom.cdx.json")));
  const envelope = JSON.parse(await readFile(
    path.join(directory, "release-manifest-envelope.json"), "utf8",
  ));
  const admittedEnvelope = JSON.parse(await readFile(
    path.join(directory, "release-manifest-envelope.authority-admitted.json"), "utf8",
  ));
  assert.equal(validateReleaseManifestEnvelope(admittedEnvelope, {
    coreSha256: hash(coreBytes), candidateSha256: candidate.sha256,
  }), true);
  assert.deepEqual(admittedEnvelope.states.map((state) => state.state), [
    "authority-admitted",
  ]);
  const provenanceEnvelope = JSON.parse(await readFile(
    path.join(directory, "release-manifest-envelope.provenance-attested.json"), "utf8",
  ));
  assert.equal(validateReleaseManifestEnvelope(provenanceEnvelope, {
    coreSha256: hash(coreBytes), candidateSha256: candidate.sha256,
  }), true);
  assert.deepEqual(provenanceEnvelope.states.map((state) => state.state), [
    "authority-admitted", "provenance-attested",
  ]);
  assert.equal(validateReleaseManifestEnvelope(envelope, {
    coreSha256: hash(coreBytes), candidateSha256: candidate.sha256,
  }), true);
  assert.deepEqual(envelope.states.map((state) => state.state), [
    "authority-admitted", "provenance-attested", "uploaded-unverified",
    "registry-verified",
  ]);
  assert.deepEqual(envelope.states[0], admittedEnvelope.states[0]);
  assert.deepEqual(envelope.states.slice(0, 2), provenanceEnvelope.states);
  const postpublishBytes = await readFile(path.join(directory, "postpublish-receipt.json"));
  const mapping = JSON.parse(await readFile("governance/release-mapping.json", "utf8"));
  validateReleaseMapping(mapping);
  assert.equal(validatePostpublishReceipt(
    JSON.parse(postpublishBytes), candidate, mapping,
  ), true);
  const provenanceBytes = await readFile(path.join(directory, provenanceNames[0]));
  assert.equal(validateAttestationJsonl(provenanceBytes.toString("utf8"), candidate), true);
  assert.equal(envelope.states[1].receipt_sha256s.attestation, hash(provenanceBytes));
  assert.equal(envelope.states[2].receipt_sha256s.attestation, hash(provenanceBytes));
  assert.equal(envelope.states[3].receipt_sha256s.attestation, hash(provenanceBytes));
  assert.equal(envelope.states[3].receipt_sha256s.postpublish, hash(postpublishBytes));
  const attestation = spawnSync("gh", [
    "attestation", "verify", path.join(directory, candidate.filename),
    "--repo", repository,
    "--signer-workflow", "Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml",
  ], { encoding: "utf8" });
  assert.equal(attestation.status, 0, attestation.stderr);
  const metadataResponse = await fetch(
    `${mapping.registry.replace(/\/$/u, "")}/@runa_laboratories%2fsdk/${candidate.version}`,
    { redirect: "error" },
  );
  assert.equal(metadataResponse.status, 200);
  const metadata = await metadataResponse.json();
  assert.equal(metadata.name, mapping.package_name);
  assert.equal(metadata.version, candidate.version);
  const registryResponse = await fetch(metadata.dist.tarball, { redirect: "error" });
  assert.equal(registryResponse.status, 200);
  assert.equal(hash(Buffer.from(await registryResponse.arrayBuffer())), candidate.sha256);
  const channel = resolveReleaseChannel(mapping, candidate.version);
  const tagsResponse = await fetch(
    `${mapping.registry.replace(/\/$/u, "")}/-/package/@runa_laboratories/sdk/dist-tags`,
    { redirect: "error" },
  );
  assert.equal(tagsResponse.status, 200);
  assert.equal((await tagsResponse.json())[channel.dist_tag], candidate.version);
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log(`release recovery: PASS read-only (${tag}, ${candidate.sha256})`);
