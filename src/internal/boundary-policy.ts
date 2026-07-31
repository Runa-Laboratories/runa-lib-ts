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
    })
    .toLowerCase();
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
  const normalized = decodeEscapes(value);
  for (const [length, targets] of TARGETS) {
    if (normalized.length < length) continue;
    let hash = polynomial(normalized, 0, length);
    if (targets.has(hash)) return true;
    let power = 1;
    for (let index = 1; index < length; index += 1) {
      power = Math.imul(power, BASE) >>> 0;
    }
    for (let index = length; index < normalized.length; index += 1) {
      const outgoing = normalized.charCodeAt(index - length);
      const incoming = normalized.charCodeAt(index);
      hash = Math.imul((hash - Math.imul(outgoing, power)) >>> 0, BASE);
      hash = (hash + incoming) >>> 0;
      if (targets.has(hash)) return true;
    }
  }
  return false;
}
