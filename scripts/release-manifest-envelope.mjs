import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { canonicalizeJson } from "./release-manifest-core.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const envelopeFile = "release-artifacts/release-manifest-envelope.json";

export function validateReleaseManifestEnvelope(envelope, {
  coreSha256, candidateSha256,
}) {
  assert.deepEqual(Object.keys(envelope).sort(), [
    "candidate_sha256", "release_manifest_core_sha256", "schema_version", "states",
  ].sort());
  assert.equal(envelope.schema_version, 1);
  assert.equal(envelope.candidate_sha256, candidateSha256);
  assert.equal(envelope.release_manifest_core_sha256, coreSha256);
  assert(Array.isArray(envelope.states) && envelope.states.length > 0);
  let previous = null;
  for (const [index, state] of envelope.states.entries()) {
    assert.deepEqual(Object.keys(state).sort(), [
      "previous_state_sha256", "receipt_sha256s", "sequence", "state",
    ].sort());
    assert.equal(state.sequence, index + 1);
    assert.equal(state.previous_state_sha256, previous);
    assert.match(state.state, /^(?:authority-admitted|registry-verified)$/u);
    assert.equal(state.receipt_sha256s !== null &&
      typeof state.receipt_sha256s === "object", true);
    for (const digest of Object.values(state.receipt_sha256s)) {
      assert.match(digest, /^[0-9a-f]{64}$/u);
    }
    previous = sha256(Buffer.from(canonicalizeJson(state)));
  }
  return true;
}

export async function appendReleaseManifestState(state, receiptFiles) {
  const coreBytes = await readFile("release-artifacts/release-manifest-core.json");
  const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
  const coreSha256 = sha256(coreBytes);
  let envelope;
  try {
    envelope = JSON.parse(await readFile(envelopeFile, "utf8"));
    validateReleaseManifestEnvelope(envelope, {
      coreSha256, candidateSha256: candidate.sha256,
    });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    envelope = {
      schema_version: 1,
      release_manifest_core_sha256: coreSha256,
      candidate_sha256: candidate.sha256,
      states: [],
    };
  }
  assert.equal(envelope.states.some((entry) => entry.state === state), false,
    `Release manifest state ${state} already exists.`);
  const receiptSha256s = {};
  for (const [name, file] of Object.entries(receiptFiles).sort()) {
    receiptSha256s[name] = sha256(await readFile(file));
  }
  const previous = envelope.states.at(-1);
  envelope.states.push({
    sequence: envelope.states.length + 1,
    state,
    previous_state_sha256: previous === undefined ? null :
      sha256(Buffer.from(canonicalizeJson(previous))),
    receipt_sha256s: receiptSha256s,
  });
  validateReleaseManifestEnvelope(envelope, {
    coreSha256, candidateSha256: candidate.sha256,
  });
  await writeFile(envelopeFile, `${JSON.stringify(envelope, null, 2)}\n`);
  return envelope;
}
