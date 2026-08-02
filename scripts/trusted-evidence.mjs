import { createHash, verify } from "node:crypto";

const exactKeys = (value, fields) =>
  value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...fields].sort().join();

const unicodeScalarString = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
};

export function canonicalizeJson(value) {
  if (typeof value === "string") {
    if (!unicodeScalarString(value)) throw new TypeError("JCS requires Unicode scalar values.");
    return JSON.stringify(value);
  }
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JCS requires finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
  if (value === null || typeof value !== "object") {
    throw new TypeError("JCS value is not JSON-compatible.");
  }
  return `{${Object.keys(value).sort().map((key) => {
    if (!unicodeScalarString(key)) throw new TypeError("JCS requires Unicode scalar keys.");
    return `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`;
  }).join(",")}}`;
}

export const jcsBytes = (value) => Buffer.from(canonicalizeJson(value));

const trustedKey = (policy, keyId, role) => {
  if (policy?.schema_version !== 1 ||
      !Number.isSafeInteger(policy.maximum_validity_ms) ||
      policy.maximum_validity_ms <= 0 || !Array.isArray(policy.keys)) return undefined;
  const matches = policy.keys.filter((item) =>
    item.key_id === keyId && item.role === role && item.algorithm === "Ed25519");
  return matches.length === 1 ? matches[0] : undefined;
};

export function verifyTrustedEnvelope(envelope, policy, role, now = Date.now(), {
  requiredSchemaVersion,
} = {}) {
  try {
    const version = envelope?.schema_version;
    if (requiredSchemaVersion !== undefined && version !== requiredSchemaVersion) return undefined;
    const legacy = version === 1 && exactKeys(envelope,
      ["key_id", "payload", "schema_version", "signature"]);
    const jcs = version === 2 && exactKeys(envelope,
      ["canonicalization", "key_id", "payload", "schema_version", "signature"]) &&
      envelope.canonicalization === "RFC8785-JCS";
    if (!legacy && !jcs) return undefined;
    const key = trustedKey(policy, envelope.key_id, role);
    const signedBytes = jcs ? jcsBytes(envelope.payload) :
      Buffer.from(JSON.stringify(envelope.payload));
    if (key === undefined || !verify(null, signedBytes,
      key.public_key_pem, Buffer.from(envelope.signature, "base64"))) return undefined;
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

export function verifyDetachedAuthorityBundle(bundleBytes, bundle, detached, policy) {
  try {
    if (!exactKeys(detached, [
      "bundle_sha256", "canonical_sha256", "canonicalization", "key_id",
      "schema_version", "signature",
    ]) || detached.schema_version !== 2 ||
        detached.canonicalization !== "RFC8785-JCS") return false;
    const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
    if (detached.bundle_sha256 !== sha256(bundleBytes)) return false;
    const canonicalBytes = jcsBytes(bundle);
    if (detached.canonical_sha256 !== sha256(canonicalBytes)) return false;
    const key = trustedKey(policy, detached.key_id, "release-authority");
    const { signature, ...statement } = detached;
    return key !== undefined && verify(null, jcsBytes(statement), key.public_key_pem,
      Buffer.from(detached.signature, "base64"));
  } catch {
    return false;
  }
}
