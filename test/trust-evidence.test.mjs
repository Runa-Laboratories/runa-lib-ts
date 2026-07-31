import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "vitest";
import { verifyTrustedEnvelope } from "../scripts/trusted-evidence.mjs";

test("release trust accepts valid evidence and rejects tamper, stale, and wrong role", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const now = Date.parse("2026-07-30T12:00:00Z");
  const payload = {
    status: "PASS",
    issued_at: "2026-07-30T11:55:00Z",
    expires_at: "2026-07-30T12:05:00Z",
    candidate_sha256: "a".repeat(64),
  };
  const envelope = {
    schema_version: 1,
    key_id: "synthetic",
    payload,
    signature: sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString("base64"),
  };
  const policy = {
    schema_version: 1,
    maximum_validity_ms: 3_600_000,
    keys: [{ key_id: "synthetic", role: "compatibility", public_key_pem: publicKey.export({ type: "spki", format: "pem" }) }],
  };
  assert.equal(verifyTrustedEnvelope(envelope, policy, "compatibility", now), payload);
  assert.equal(verifyTrustedEnvelope({ ...envelope, payload: { ...payload, status: "FAIL" } }, policy, "compatibility", now), undefined);
  assert.equal(verifyTrustedEnvelope(envelope, policy, "publication", now), undefined);
  assert.equal(verifyTrustedEnvelope(envelope, policy, "compatibility", Date.parse("2026-07-30T12:06:00Z")), undefined);
});
