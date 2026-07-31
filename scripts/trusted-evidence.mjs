import { verify } from "node:crypto";

export function verifyTrustedEnvelope(envelope, policy, role, now = Date.now()) {
  const exact = ["key_id", "payload", "schema_version", "signature"].sort();
  if (envelope?.schema_version !== 1 || Object.keys(envelope).sort().join() !== exact.join()) return undefined;
  const key = policy?.keys?.find((item) => item.key_id === envelope.key_id && item.role === role);
  if (key === undefined || !verify(null, Buffer.from(JSON.stringify(envelope.payload)),
    key.public_key_pem, Buffer.from(envelope.signature, "base64"))) return undefined;
  const issued = Date.parse(envelope.payload.issued_at);
  const expires = Date.parse(envelope.payload.expires_at);
  if (envelope.payload.status !== "PASS" || !Number.isFinite(issued) ||
      !Number.isFinite(expires) || issued > now || expires <= now ||
      expires - issued > policy.maximum_validity_ms) return undefined;
  return envelope.payload;
}
