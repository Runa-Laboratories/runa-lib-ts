import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  canonicalJson,
  exactSnapshotSchema,
  generateOperations,
} from "./contract-generation.mjs";

const infra = path.resolve("../../infra/contracts");
const projectionBytes = await readFile(path.join(infra, "runa-sdk.projection.json"));
const openapiBytes = await readFile(path.join(infra, "runa-api.openapi.json"));
const digestFile = await readFile(path.join(infra, "runa-api.openapi.sha256"), "utf8");
const canonicalDigest = digestFile.trim().split(/\s+/, 1)[0];
if (!/^[0-9a-f]{64}$/.test(canonicalDigest)) throw new Error("Invalid canonical digest artifact.");
const projection = JSON.parse(projectionBytes);
const openapi = JSON.parse(openapiBytes);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (digest(Buffer.from(JSON.stringify(canonicalJson(openapi)))) !== canonicalDigest) {
  throw new Error("Canonical OpenAPI digest does not match the accepted digest artifact.");
}
await mkdir("contracts", { recursive: true });
await writeFile("contracts/runa-sdk.projection.json", projectionBytes);
await writeFile("contracts/runa-api.openapi.json", openapiBytes);
await writeFile("contracts/runa-api.openapi.sha256", `${canonicalDigest}  runa-api.openapi.json\n`);
await writeFile("contracts/runa-sdk-contract.snapshot.json", `${JSON.stringify(projection, null, 2)}\n`);
await writeFile("contracts/runa-sdk-contract.snapshot.schema.json",
  `${JSON.stringify(exactSnapshotSchema(projection), null, 2)}\n`);
await writeFile("contracts/runa-sdk-baseline.expectation.json", `${JSON.stringify({
  contractVersion: projection.contractVersion,
  operationCount: 13,
  operationKeys: Object.keys(projection.operations).sort()
}, null, 2)}\n`);
await writeFile("contracts/runa-sdk-contract.provenance.json", `${JSON.stringify({
  schema_version: 1,
  status: "BLOCKED",
  canonical_contract_sha256: canonicalDigest,
  projection_sha256: digest(projectionBytes),
  openapi_sha256: digest(openapiBytes),
  canonical_repository: "Runa-Laboratories/runa-sdk-contract",
  canonical_ref: null,
  approval_sha: null,
  reason: "Canonical repository and approval evidence are unavailable."
}, null, 2)}\n`);
await mkdir("src/internal/contract/generated", { recursive: true });
await writeFile("src/internal/contract/generated/operations.ts",
  generateOperations(projection, canonicalDigest));
console.log("contract snapshot synchronized; provenance remains BLOCKED");
