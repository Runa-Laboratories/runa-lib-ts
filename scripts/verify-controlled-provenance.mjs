import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extractAttestationStatement } from "./attestation-bundle.mjs";
import { validateSignedProvenancePredicate } from "./provenance-policy.mjs";

const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
assert.equal(candidate.source_commit, process.env.GITHUB_SHA);
const lockfileSha256 = createHash("sha256").update(
  await readFile("package-lock.json"),
).digest("hex");
const workflowSha256 = createHash("sha256").update(
  await readFile(".github/workflows/ci.yml"),
).digest("hex");
const bundleBytes = await readFile(process.env.RUNA_ATTESTATION_BUNDLE);
const statement = extractAttestationStatement(bundleBytes.toString("utf8"), candidate);
const predicate = statement.predicate;
const predicateBytes = Buffer.from(`${JSON.stringify(predicate, null, 2)}\n`);
const builderIdentity =
  "https://github.com/Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml@refs/heads/main";
assert.match(process.env.GITHUB_REPOSITORY_ID ?? "", /^\d+$/u);
assert.match(process.env.GITHUB_REPOSITORY_OWNER_ID ?? "", /^\d+$/u);
validateSignedProvenancePredicate(predicate, {
  sourceCommit: candidate.source_commit,
  workflowRef: "refs/heads/main",
  repository: "https://github.com/Runa-Laboratories/runa-lib-ts",
  workflowPath: ".github/workflows/ci.yml",
  eventName: "push",
  repositoryId: process.env.GITHUB_REPOSITORY_ID,
  repositoryOwnerId: process.env.GITHUB_REPOSITORY_OWNER_ID,
  runnerEnvironment: "github-hosted",
  sourceUri: "git+https://github.com/Runa-Laboratories/runa-lib-ts@refs/heads/main",
  builderIdentity,
  invocationId: `https://github.com/Runa-Laboratories/runa-lib-ts/actions/runs/${process.env.GITHUB_RUN_ID}/attempts/${process.env.GITHUB_RUN_ATTEMPT}`,
});
const command = [
  "attestation", "verify", `release-artifacts/${candidate.filename}`,
  "--repo", "Runa-Laboratories/runa-lib-ts",
  "--signer-workflow", "Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml",
];
const result = spawnSync("gh", command, { encoding: "utf8" });
assert.equal(result.status, 0,
  `Controlled-build provenance verification failed: ${result.stderr}`);
const verifiedAt = new Date().toISOString();
const version = spawnSync("gh", ["--version"], { encoding: "utf8" });
assert.equal(version.status, 0);
await mkdir("evidence", { recursive: true });
await writeFile("evidence/provenance-predicate.json", predicateBytes);
await writeFile("evidence/provenance-verifier.json", `${JSON.stringify({
  schema_version: 1,
  status: "PASS",
  candidate_sha256: candidate.sha256,
  command: ["gh", ...command],
  signer_workflow: "Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml",
  builder_identity: builderIdentity,
  source_commit: candidate.source_commit,
  intended_tag: `ts-v${candidate.version}`,
  lockfile_sha256: lockfileSha256,
  build_definition_sha256: workflowSha256,
  build_started_at: candidate.build_started_at,
  build_finished_at: candidate.build_finished_at,
  verified_at: verifiedAt,
  predicate_sha256: createHash("sha256").update(predicateBytes).digest("hex"),
  verifier_version_sha256: createHash("sha256")
    .update(`${version.stdout}${version.stderr}`).digest("hex"),
  result_sha256: createHash("sha256")
    .update(`${result.stdout}${result.stderr}`).digest("hex"),
}, null, 2)}\n`);
console.log(`controlled provenance verifier: PASS (${candidate.sha256})`);
