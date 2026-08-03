import assert from "node:assert/strict";
import { test } from "vitest";
import { runReferencePipeline } from "../scripts/reference/pipeline.mjs";

test("PRD-048 reference pipeline covers the exact surface and rejects mutations", async () => {
  const result = await runReferencePipeline({ write: false });
  assert.equal(result.model.entries.length, 28);
  assert.equal(result.model.entries.filter((entry) => entry.kind === "runtime").length, 8);
  assert.equal(result.model.entries.filter((entry) => entry.kind === "type").length, 20);
  assert.deepEqual(result.mutations, [
    "missing", "extra", "alias", "page-ownership", "signature",
    "private-source", "link", "safety", "throws", "example", "claim-tag",
    "reflection-tag-delete", "reflection-tag-change", "reflection-param",
    "reflection-returns", "reflection-throws", "reflection-example",
  ]);
}, 20_000);
