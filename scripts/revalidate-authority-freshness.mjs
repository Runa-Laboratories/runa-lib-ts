import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  validateAuthorityContinuity,
  verifyAuthorityAssets,
} from "./public-authority-transport.mjs";

const input = process.env.RUNA_AUTHORITY_INPUT_DIR ?? "authority-preflight";
const trustPolicy = JSON.parse(await readFile("governance/release-trust.json", "utf8"));
const authorityRun = JSON.parse(await readFile("evidence/authority-run.json", "utf8"));
const assets = new Map(await Promise.all([
  "release-authority-bundle.json",
  "release-authority-bundle.json.sig",
  "release-authority-bundle.json.sha256",
].map(async (name) => [name, await readFile(`${input}/${name}`)])));

const verified = verifyAuthorityAssets(assets, trustPolicy, Date.now(), authorityRun);
assert.equal(validateAuthorityContinuity({
  bundleSha256: verified.detached.bundle_sha256,
  headSha: authorityRun.head_sha,
  runId: authorityRun.run_id,
  runAttempt: authorityRun.run_attempt,
}, {
  bundleSha256: process.env.RUNA_EXPECTED_AUTHORITY_BUNDLE_SHA256,
  headSha: process.env.RUNA_EXPECTED_AUTHORITY_HEAD_SHA,
  runId: process.env.RUNA_EXPECTED_AUTHORITY_RUN_ID,
  runAttempt: process.env.RUNA_EXPECTED_AUTHORITY_RUN_ATTEMPT,
}), true);

console.log(`release authority freshness: PASS (${verified.detached.bundle_sha256})`);
