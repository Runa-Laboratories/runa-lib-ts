const BASE = 257;
const TARGETS = new Map<number, ReadonlySet<number>>([
  [5, new Set([1_098_742_058])],
  [6, new Set([136_129_161])],
  [9, new Set([3_847_020_951, 3_847_084_439, 1_161_608_401])],
  [10, new Set([2_179_956_528, 2_895_058_756])],
  [11, new Set([3_928_627_619])],
  [16, new Set([578_114_754])],
  [18, new Set([4_262_251_136])],
  [24, new Set([1_853_816_080])],
  [25, new Set([3_984_330_115])],
  [26, new Set([1_988_911_822])],
  [27, new Set([49_230_145])],
]);

// Vendor names and domains must be detected even when embedded in a larger
// string. Generic upstream vocabulary is token-aware so ordinary English words
// that merely contain the same character sequence do not become false positives.
const SUBSTRING_TARGETS = new Map<number, ReadonlySet<number>>([
  [5, new Set([1_098_742_058])],
  [9, new Set([3_847_020_951, 3_847_084_439])],
]);

function decodeEscapes(value: string): string {
  let result = value;
  try {
    result = decodeURIComponent(result);
  } catch {
    // Invalid percent encoding remains comparable as received.
  }
  return result
    .replace(/\\u([0-9a-f]{4})/gi, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\(["\\/bfnrt])/g, (_match, code: string) => {
      switch (code) {
        case "b":
          return "\b";
        case "f":
          return "\f";
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        default:
          return code;
      }
    });
}

function isAsciiLetterOrDigit(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

function isLowerAsciiOrDigit(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

function isUpperAscii(code: number): boolean {
  return code >= 0x41 && code <= 0x5a;
}

function hasTokenBoundaries(value: string, start: number, length: number): boolean {
  const end = start + length;
  const first = value.charCodeAt(start);
  const last = value.charCodeAt(end - 1);
  const before = value.charCodeAt(start - 1);
  const after = value.charCodeAt(end);
  const leftBoundary =
    start === 0 ||
    !isAsciiLetterOrDigit(before) ||
    (isLowerAsciiOrDigit(before) && isUpperAscii(first));
  const rightBoundary =
    end === value.length ||
    !isAsciiLetterOrDigit(after) ||
    (isLowerAsciiOrDigit(last) && isUpperAscii(after));
  return leftBoundary && rightBoundary;
}

function polynomial(value: string, start: number, length: number): number {
  let result = 0;
  for (let index = start; index < start + length; index += 1) {
    result =
      (Math.imul(result, BASE) + (value.charCodeAt(index) || 0)) >>> 0;
  }
  return result;
}

export function containsProhibitedMarker(value: string): boolean {
  const decoded = decodeEscapes(value);
  const normalized = decoded.toLowerCase();
  for (const [length, targets] of TARGETS) {
    if (normalized.length < length) continue;
    let hash = polynomial(normalized, 0, length);
    if (
      targets.has(hash) &&
      (SUBSTRING_TARGETS.get(length)?.has(hash) ??
        hasTokenBoundaries(decoded, 0, length))
    ) {
      return true;
    }
    let power = 1;
    for (let index = 1; index < length; index += 1) {
      power = Math.imul(power, BASE) >>> 0;
    }
    for (let index = length; index < normalized.length; index += 1) {
      const outgoing = normalized.charCodeAt(index - length);
      const incoming = normalized.charCodeAt(index);
      hash = Math.imul((hash - Math.imul(outgoing, power)) >>> 0, BASE);
      hash = (hash + incoming) >>> 0;
      if (
        targets.has(hash) &&
        (SUBSTRING_TARGETS.get(length)?.has(hash) ??
          hasTokenBoundaries(decoded, index - length + 1, length))
      ) {
        return true;
      }
    }
  }
  return false;
}
