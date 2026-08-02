import assert from "node:assert/strict";
import { test } from "vitest";

import {
  canonicalizeJson,
  releaseManifestCoreBytes,
} from "../scripts/release-manifest-core.mjs";

test("release manifest core uses deterministic canonical JSON", () => {
  const first = { z: 0, a: { y: [true, null, "Runa"], x: 1 } };
  const second = { a: { x: 1, y: [true, null, "Runa"] }, z: -0 };
  assert.equal(canonicalizeJson(first), canonicalizeJson(second));
  assert.equal(
    releaseManifestCoreBytes(first).toString("utf8"),
    '{"a":{"x":1,"y":[true,null,"Runa"]},"z":0}\n',
  );
  assert.throws(() => canonicalizeJson({ value: Number.NaN }));
});
