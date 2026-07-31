import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projection = JSON.parse(await readFile("contracts/runa-sdk.projection.json", "utf8"));
const baseline = JSON.parse(await readFile("contracts/runa-sdk-baseline.expectation.json", "utf8"));
const generated = await readFile("src/internal/contract/generated/operations.ts", "utf8");
const keys = Object.keys(projection.operations).sort();
assert.equal(keys.length, 13);
assert.deepEqual(keys, baseline.operationKeys);
for (const key of keys) {
  const operation = projection.operations[key];
  assert.match(generated, new RegExp(`"${key.replaceAll(".", "\\.")}"`));
  assert.match(generated, new RegExp(`pathTemplate: "${operation.path.replaceAll("/", "\\/").replace(/[{}]/g, "\\$&")}"`));
  assert.match(generated, new RegExp(`successStatus: ${operation.successStatus}`));
}
console.log("contract projection: PASS; canonical provenance: BLOCKED");
