import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  verifyDetachedAuthorityBundle,
  verifyTrustedEnvelope,
} from "./trusted-evidence.mjs";

export const AUTHORITY_REPOSITORY = "Runa-Laboratories/runa-release-authority";
export const AUTHORITY_WORKFLOW = ".github/workflows/release-authority.yml";
const API_ROOT = "https://api.github.com";
const ASSET_NAMES = Object.freeze([
  "release-authority-bundle.json",
  "release-authority-bundle.json.sig",
  "release-authority-bundle.json.sha256",
]);
const MAXIMUM_BYTES = Object.freeze({
  "release-authority-bundle.json": 5_242_880,
  "release-authority-bundle.json.sig": 65_536,
  "release-authority-bundle.json.sha256": 256,
});
const ROLE_FIELDS = Object.freeze([
  ["approval_receipt", "approval"],
  ["version_classification", "version-classification"],
  ["repository_controls", "repository-controls"],
  ["cross_language", "cross-language"],
  ["publication_readiness", "publication"],
  ["sbom_validation", "sbom-validation"],
  ["external_release_interfaces", "external-interfaces"],
  ["acceptance_results", "acceptance-results"],
]);
const apiHeaders = Object.freeze({
  accept: "application/vnd.github+json",
  "user-agent": "runa-lib-ts-public-authority-transport",
  "x-github-api-version": "2022-11-28",
});
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function limitedBytes(response, maximumBytes, label) {
  const length = response.headers.get("content-length");
  if (length !== null) {
    assert.match(length, /^\d+$/u, `${label} content length is invalid.`);
    assert(Number(length) <= maximumBytes, `${label} exceeds the size limit.`);
  }
  assert.notEqual(response.body, null, `${label} response body is absent.`);
  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length;
    assert(received <= maximumBytes, `${label} exceeds the size limit.`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function getJson(url, fetchImpl, maximumBytes = 262_144) {
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.hostname, "api.github.com");
  const response = await fetchImpl(parsed, {
    redirect: "error",
    headers: apiHeaders,
  });
  assert.equal(response.status, 200, `GitHub public REST lookup failed (${response.status}).`);
  return JSON.parse((await limitedBytes(response, maximumBytes, "GitHub REST response"))
    .toString("utf8"));
}

export function validateAuthorityRun(run, expected, runId) {
  assert.equal(expected.repository, AUTHORITY_REPOSITORY,
    "The configured authority repository is not accepted.");
  assert.equal(expected.workflow, AUTHORITY_WORKFLOW,
    "The configured authority workflow is not accepted.");
  assert.equal(run.id, Number(runId));
  assert.equal(run.repository?.full_name, AUTHORITY_REPOSITORY);
  assert.equal(run.repository?.private, false);
  assert.equal(run.path, expected.workflow);
  assert.equal(run.event, expected.event);
  assert.equal(run.head_branch, expected.branch);
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert.match(run.head_sha, /^[0-9a-f]{40}$/u);
  assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
  return run;
}

export async function fetchAuthorityRun(expected, runId, fetchImpl = fetch) {
  assert.match(String(runId), /^[1-9][0-9]*$/u);
  const run = await getJson(
    `${API_ROOT}/repos/${AUTHORITY_REPOSITORY}/actions/runs/${runId}`,
    fetchImpl,
  );
  return validateAuthorityRun(run, expected, runId);
}

const tagForRun = (run) => `authority-run-${run.id}-${run.run_attempt}`;
const assetUrl = (tag, name) =>
  `https://github.com/${AUTHORITY_REPOSITORY}/releases/download/${tag}/${name}`;

function validateRelease(release, run) {
  const tag = tagForRun(run);
  assert.equal(release.tag_name, tag);
  assert.equal(release.target_commitish, run.head_sha);
  assert.equal(release.draft, false);
  assert.equal(release.prerelease, false);
  assert(Array.isArray(release.assets));
  assert.deepEqual(release.assets.map((asset) => asset.name).sort(), [...ASSET_NAMES].sort());
  const result = new Map();
  for (const asset of release.assets) {
    assert.equal(asset.state, "uploaded");
    assert.equal(asset.browser_download_url, assetUrl(tag, asset.name));
    assert(Number.isSafeInteger(asset.size) && asset.size > 0 &&
      asset.size <= MAXIMUM_BYTES[asset.name]);
    result.set(asset.name, asset.browser_download_url);
  }
  return result;
}

async function downloadAsset(url, maximumBytes, fetchImpl) {
  const initial = new URL(url);
  assert.equal(initial.protocol, "https:");
  assert.equal(initial.hostname, "github.com");
  assert.equal(initial.username, "");
  assert.equal(initial.password, "");
  const redirect = await fetchImpl(initial, {
    redirect: "manual",
    headers: { "user-agent": apiHeaders["user-agent"] },
  });
  assert.equal(redirect.status, 302, "Public release asset did not return the expected redirect.");
  const location = new URL(redirect.headers.get("location"));
  assert.equal(location.protocol, "https:");
  assert.equal(location.hostname, "release-assets.githubusercontent.com",
    "Public release asset redirected to an unexpected host.");
  assert.equal(location.username, "");
  assert.equal(location.password, "");
  const response = await fetchImpl(location, {
    redirect: "error",
    headers: { "user-agent": apiHeaders["user-agent"] },
  });
  assert.equal(response.status, 200, `Public release asset download failed (${response.status}).`);
  return limitedBytes(response, maximumBytes, "Public release asset");
}

export function verifyAuthorityAssets(assets, trustPolicy, now = Date.now()) {
  const bundleBytes = assets.get("release-authority-bundle.json");
  const signatureBytes = assets.get("release-authority-bundle.json.sig");
  const checksumBytes = assets.get("release-authority-bundle.json.sha256");
  assert(Buffer.isBuffer(bundleBytes) && Buffer.isBuffer(signatureBytes) &&
    Buffer.isBuffer(checksumBytes));
  const checksum = checksumBytes.toString("utf8");
  const match = /^([a-f0-9]{64})  release-authority-bundle\.json\n$/u.exec(checksum);
  assert.notEqual(match, null, "Authority checksum file is invalid.");
  assert.equal(sha256(bundleBytes), match[1], "Authority bundle SHA-256 differs.");
  const bundle = JSON.parse(bundleBytes.toString("utf8"));
  const detached = JSON.parse(signatureBytes.toString("utf8"));
  assert.equal(verifyDetachedAuthorityBundle(
    bundleBytes, bundle, detached, trustPolicy,
  ), true, "Detached authority signature is invalid.");
  for (const [field, role] of ROLE_FIELDS) {
    assert.notEqual(verifyTrustedEnvelope(
      bundle[field], trustPolicy, role, now, { requiredSchemaVersion: 2 },
    ), undefined, `Embedded ${role} JCS signature is invalid.`);
  }
  return { bundle, bundleBytes, detached };
}

export async function retrievePublicAuthorityAssets(expected, runId, trustPolicy, {
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  const run = await fetchAuthorityRun(expected, runId, fetchImpl);
  const release = await getJson(
    `${API_ROOT}/repos/${AUTHORITY_REPOSITORY}/releases/tags/${tagForRun(run)}`,
    fetchImpl,
  );
  const urls = validateRelease(release, run);
  const assets = new Map();
  for (const name of ASSET_NAMES) {
    assets.set(name, await downloadAsset(urls.get(name), MAXIMUM_BYTES[name], fetchImpl));
  }
  const verified = verifyAuthorityAssets(assets, trustPolicy, now);
  return { ...verified, assets, run };
}
