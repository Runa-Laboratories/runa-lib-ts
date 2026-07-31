import { containsProhibitedMarker } from "./boundary-policy.js";

function containsMarker(value: unknown): boolean {
  if (typeof value === "string") return containsProhibitedMarker(value);
  if (Array.isArray(value)) return value.some(containsMarker);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(
      ([key, nested]) =>
        containsProhibitedMarker(key) || containsMarker(nested),
    );
  }
  return false;
}

export function sanitizeWire(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeWire(item));
  }
  if (value === null || typeof value !== "object") return value;
  const source = value as globalThis.Record<string, unknown>;
  const output: globalThis.Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(source)) {
    if (containsProhibitedMarker(key) || containsMarker(nested)) continue;
    // detail is opaque and must preserve its exact received identity.
    output[key] = key === "detail" ? nested : sanitizeWire(nested);
  }
  return output;
}
