import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import {
  canonicalizeJson,
  EXPECTED_RELEASE_POLICY,
  releaseManifestCoreBytes,
} from "../scripts/release-manifest-core.mjs";

test("release manifest core uses deterministic canonical JSON", () => {
  const first = { z: 0, a: { y: [true, null, "Runa"], x: 1 } };
  const second = { a: { x: 1, y: [true, null, "Runa"] }, z: -0 };
  assert.equal(canonicalizeJson(first), canonicalizeJson(second));
  assert.equal(
    releaseManifestCoreBytes(first).toString("utf8"),
    '{"a":{"x":1,"y":[true,null,"Runa"]},"z":0}',
  );
  const digest = (value) => createHash("sha256")
    .update(releaseManifestCoreBytes(value)).digest("hex");
  assert.equal(digest(first), digest(JSON.parse(JSON.stringify(second, null, 4))));
  assert.throws(() => canonicalizeJson({ value: Number.NaN }));
});

test("version-controlled release policy matches the exact accepted policy", async () => {
  const policy = JSON.parse(await readFile(".runa/release-policy.json", "utf8"));
  assert.deepEqual(policy, EXPECTED_RELEASE_POLICY);
});
