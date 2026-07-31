import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const projection = await readFile("contracts/runa-sdk.projection.json");
const provenance = JSON.parse(await readFile("contracts/runa-sdk-contract.provenance.json", "utf8"));
const blockers = [
  { id: "TS-REL-001", gate: "canonical-contract-provenance", reason: provenance.reason },
  { id: "TS-REL-002", gate: "license-approval", reason: "LICENSE is an explicit non-GA placeholder." },
  { id: "TS-REL-003", gate: "compatibility-matrix", reason: "All six exact Node/npm/OS cells have not run." },
  { id: "TS-REL-004", gate: "tool-catalog", reason: "Security remediation requires Vitest 3.2.7 while the V1 profile still names 3.2.4." },
  { id: "TS-REL-005", gate: "repository-controls", reason: "Required branch protection, rulesets, and vulnerability controls are not externally evidenced." },
  { id: "TS-REL-006", gate: "publication", reason: "Trusted publishing, registry identity, attestation, and release smoke evidence are unavailable." },
  { id: "TS-REL-007", gate: "cross-language", reason: "Cross-language conformance evidence is not finalized." }
];
await mkdir("evidence", { recursive: true });
await writeFile("evidence/release-readiness.json", `${JSON.stringify({
  schema_version: 1,
  decision: "BLOCKED",
  projection_sha256: createHash("sha256").update(projection).digest("hex"),
  local_gates: "run npm run quality for current evidence",
  blockers
}, null, 2)}\n`);
console.log(`release readiness: BLOCKED (${blockers.length} unresolved gates)`);
process.exitCode = 2;
