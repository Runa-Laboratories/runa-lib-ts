import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const infra = path.resolve("../../infra/contracts");
const projectionBytes = await readFile(path.join(infra, "runa-sdk.projection.json"));
const openapiBytes = await readFile(path.join(infra, "runa-api.openapi.json"));
const projection = JSON.parse(projectionBytes);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir("contracts", { recursive: true });
await writeFile("contracts/runa-sdk.projection.json", projectionBytes);
await writeFile("contracts/runa-sdk-contract.snapshot.json", `${JSON.stringify(projection, null, 2)}\n`);
await writeFile("contracts/runa-sdk-contract.snapshot.schema.json", `${JSON.stringify({
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["contractVersion", "operations", "schemas", "wire"],
  additionalProperties: false,
  properties: {
    contractVersion: { type: "string" },
    operations: { type: "object", minProperties: 13, maxProperties: 13 },
    schemas: { type: "object" },
    wire: { type: "object" }
  }
}, null, 2)}\n`);
await writeFile("contracts/runa-sdk-baseline.expectation.json", `${JSON.stringify({
  contractVersion: projection.contractVersion,
  operationCount: 13,
  operationKeys: Object.keys(projection.operations).sort()
}, null, 2)}\n`);
await writeFile("contracts/runa-sdk-contract.provenance.json", `${JSON.stringify({
  schema_version: 1,
  status: "BLOCKED",
  projection_sha256: digest(projectionBytes),
  openapi_sha256: digest(openapiBytes),
  canonical_repository: "Runa-Laboratories/runa-sdk-contract",
  canonical_ref: null,
  approval_sha: null,
  reason: "Canonical repository and approval evidence are unavailable."
}, null, 2)}\n`);
console.log("contract snapshot synchronized; provenance remains BLOCKED");
