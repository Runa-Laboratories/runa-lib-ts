import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runReferencePipeline } from "./reference/pipeline.mjs";

const result = await runReferencePipeline({ write: false });
for (const [file, expected] of Object.entries(result.files)) {
  assert.equal(await readFile(file, "utf8"), expected, `R-048-15: generated drift in ${file}`);
}
const evidence = JSON.parse(await readFile("evidence/docs-readiness.json", "utf8"));
assert.equal(evidence.status, "PASS");
assert.equal(evidence.deterministic_output_sha256, result.outputDigest);
assert.equal(evidence.runtime_export_count, 8);
assert.equal(evidence.type_export_count, 18);
assert.deepEqual(evidence.acceptance_tests, [
  "TC-048-01", "TC-048-02", "TC-048-03", "TC-048-04",
  "TC-048-05", "TC-048-06", "TC-048-07",
]);
console.log(`docs: PASS (${result.model.entries.length} entries, ${result.mutations.length} hostile mutations rejected)`);
