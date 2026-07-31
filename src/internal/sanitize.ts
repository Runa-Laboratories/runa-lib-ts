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
    for (let index = value.length - 1; index >= 0; index -= 1) {
      if (containsMarker(value[index])) {
        value.splice(index, 1);
      } else {
        sanitizeWire(value[index]);
      }
    }
    return value;
  }
  if (value === null || typeof value !== "object") return value;
  const source = value as globalThis.Record<string, unknown>;
  for (const [key, nested] of Object.entries(source)) {
    if (containsProhibitedMarker(key) || containsMarker(nested)) {
      delete source[key];
      continue;
    }
    // Parsed response objects are private to this SDK, so in-place sanitizing
    // preserves opaque field identity while preventing boundary leakage.
    if (key !== "detail") sanitizeWire(nested);
  }
  return source;
}
