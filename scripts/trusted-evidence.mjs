import { verify } from "node:crypto";

export function verifyTrustedEnvelope(envelope, policy, role, now = Date.now()) {
  try {
    const exact = ["key_id", "payload", "schema_version", "signature"].sort();
    if (envelope?.schema_version !== 1 ||
        Object.keys(envelope).sort().join() !== exact.join() ||
        policy?.schema_version !== 1 ||
        !Number.isSafeInteger(policy.maximum_validity_ms) ||
        policy.maximum_validity_ms <= 0 ||
        !Array.isArray(policy.keys)) return undefined;
    const matches = policy.keys.filter((item) =>
      item.key_id === envelope.key_id && item.role === role);
    if (matches.length !== 1 || matches[0].algorithm !== "Ed25519" ||
        !verify(null, Buffer.from(JSON.stringify(envelope.payload)),
          matches[0].public_key_pem, Buffer.from(envelope.signature, "base64"))) {
      return undefined;
    }
    const issued = Date.parse(envelope.payload.issued_at);
    const expires = Date.parse(envelope.payload.expires_at);
    if (envelope.payload.status !== "PASS" || !Number.isFinite(issued) ||
        !Number.isFinite(expires) || issued > now || expires <= now ||
        expires <= issued || expires - issued > policy.maximum_validity_ms) return undefined;
    return envelope.payload;
  } catch {
    return undefined;
  }
}
