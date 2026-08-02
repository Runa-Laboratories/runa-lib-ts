import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
const command = [
  "attestation", "verify", `release-artifacts/${candidate.filename}`,
  "--repo", "Runa-Laboratories/runa-lib-ts",
  "--signer-workflow", "Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml",
];
const result = spawnSync("gh", command, { encoding: "utf8" });
assert.equal(result.status, 0,
  `Controlled-build provenance verification failed: ${result.stderr}`);
const version = spawnSync("gh", ["--version"], { encoding: "utf8" });
assert.equal(version.status, 0);
await mkdir("evidence", { recursive: true });
await writeFile("evidence/provenance-verifier.json", `${JSON.stringify({
  schema_version: 1,
  status: "PASS",
  candidate_sha256: candidate.sha256,
  command: ["gh", ...command],
  signer_workflow: "Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml",
  verifier_version_sha256: createHash("sha256")
    .update(`${version.stdout}${version.stderr}`).digest("hex"),
  result_sha256: createHash("sha256")
    .update(`${result.stdout}${result.stderr}`).digest("hex"),
}, null, 2)}\n`);
console.log(`controlled provenance verifier: PASS (${candidate.sha256})`);
