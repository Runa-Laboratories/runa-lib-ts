import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  canonicalJson,
  exactSnapshotSchema,
  generateOperations,
  validateContractProvenance,
} from "./contract-generation.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const projectionBytes = await readFile("contracts/runa-sdk.projection.json");
const projection = JSON.parse(projectionBytes);
const snapshot = JSON.parse(await readFile("contracts/runa-sdk-contract.snapshot.json", "utf8"));
const schema = JSON.parse(await readFile("contracts/runa-sdk-contract.snapshot.schema.json", "utf8"));
const baseline = JSON.parse(await readFile("contracts/runa-sdk-baseline.expectation.json", "utf8"));
const generated = await readFile("src/internal/contract/generated/operations.ts", "utf8");
const provenance = JSON.parse(await readFile("contracts/runa-sdk-contract.provenance.json", "utf8"));
const openapiBytes = await readFile("contracts/runa-api.openapi.json");
const openapi = JSON.parse(openapiBytes);
const digestArtifact = (await readFile("contracts/runa-api.openapi.sha256", "utf8")).trim();
const [declaredCanonical, declaredFilename, ...extraDigestFields] = digestArtifact.split(/\s+/);
assert.deepEqual(extraDigestFields, []);
assert.equal(declaredFilename, "runa-api.openapi.json");
assert.match(declaredCanonical, /^[0-9a-f]{64}$/);
assert.deepEqual(snapshot, projection);
assert.deepEqual(schema, exactSnapshotSchema(projection));
assert.equal(digest(projectionBytes), provenance.projection_sha256);
assert.equal(digest(openapiBytes), provenance.openapi_sha256);
assert.equal(digest(Buffer.from(JSON.stringify(canonicalJson(openapi)))), declaredCanonical);
assert.equal(provenance.canonical_contract_sha256, declaredCanonical);
assert.equal(validateContractProvenance(provenance, {
  canonical: declaredCanonical,
  projection: digest(projectionBytes),
  openapi: digest(openapiBytes),
}), true);
const keys = Object.keys(projection.operations).sort();
assert.equal(keys.length, 13);
assert.deepEqual(keys, baseline.operationKeys);
assert.equal(baseline.operationCount, 13);
assert.equal(baseline.contractVersion, projection.contractVersion);
const regeneratedA = generateOperations(projection, declaredCanonical);
const regeneratedB = generateOperations(JSON.parse(JSON.stringify(projection)), declaredCanonical);
assert.equal(regeneratedA, regeneratedB);
assert.equal(generated, regeneratedA);
console.log(`contract projection: PASS (${declaredCanonical}); canonical repository provenance: ${provenance.status}`);
