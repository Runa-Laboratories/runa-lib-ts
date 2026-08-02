import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
assert.equal(candidate.source_commit, process.env.GITHUB_SHA);
const lockfileSha256 = createHash("sha256").update(
  await readFile("package-lock.json"),
).digest("hex");
const workflowSha256 = createHash("sha256").update(
  await readFile(".github/workflows/ci.yml"),
).digest("hex");
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
  builder_identity: "https://github.com/Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml@refs/heads/main",
  source_commit: candidate.source_commit,
  intended_tag: `ts-v${candidate.version}`,
  lockfile_sha256: lockfileSha256,
  build_definition_sha256: workflowSha256,
  verified_at: new Date().toISOString(),
  verifier_version_sha256: createHash("sha256")
    .update(`${version.stdout}${version.stderr}`).digest("hex"),
  result_sha256: createHash("sha256")
    .update(`${result.stdout}${result.stderr}`).digest("hex"),
}, null, 2)}\n`);
console.log(`controlled provenance verifier: PASS (${candidate.sha256})`);
