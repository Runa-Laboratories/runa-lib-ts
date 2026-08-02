import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";

import { canonicalizeJson } from "../scripts/release-manifest-core.mjs";
import { validateReleaseManifestEnvelope } from "../scripts/release-manifest-envelope.mjs";

test("release manifest envelope is append-only and rejects core/state tamper", () => {
  const digest = (value) => createHash("sha256")
    .update(Buffer.from(canonicalizeJson(value))).digest("hex");
  const first = {
    sequence: 1, state: "authority-admitted", previous_state_sha256: null,
    receipt_sha256s: { approval: "c".repeat(64) },
  };
  const envelope = {
    schema_version: 1,
    release_manifest_core_sha256: "a".repeat(64),
    candidate_sha256: "b".repeat(64),
    states: [first, {
      sequence: 2, state: "provenance-attested",
      previous_state_sha256: digest(first),
      receipt_sha256s: { attestation: "d".repeat(64) },
    }, {
      sequence: 3, state: "uploaded-unverified",
      previous_state_sha256: null,
      receipt_sha256s: { registry: "d".repeat(64) },
    }, {
      sequence: 4, state: "registry-verified",
      previous_state_sha256: null,
      receipt_sha256s: { registry: "e".repeat(64) },
    }],
  };
  envelope.states[2].previous_state_sha256 = digest(envelope.states[1]);
  envelope.states[3].previous_state_sha256 = digest(envelope.states[2]);
  assert.equal(validateReleaseManifestEnvelope(envelope, {
    coreSha256: "a".repeat(64), candidateSha256: "b".repeat(64),
  }), true);
  assert.throws(() => validateReleaseManifestEnvelope(
    { ...envelope, release_manifest_core_sha256: "e".repeat(64) },
    { coreSha256: "a".repeat(64), candidateSha256: "b".repeat(64) },
  ));
  const tampered = structuredClone(envelope);
  tampered.states[0].receipt_sha256s.approval = "f".repeat(64);
  assert.throws(() => validateReleaseManifestEnvelope(tampered, {
    coreSha256: "a".repeat(64), candidateSha256: "b".repeat(64),
  }));
});
