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
  if (containsMarker(value)) throw new TypeError("Unsafe Runa response.");
  return value;
}
