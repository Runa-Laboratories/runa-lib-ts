import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
assert.equal(candidate.source_commit, process.env.GITHUB_SHA);
assert.match(process.env.GITHUB_RUN_ID ?? "", /^\d+$/u);
assert.match(process.env.GITHUB_RUN_ATTEMPT ?? "", /^\d+$/u);
const packageLockSha256 = hash(await readFile("package-lock.json"));
const ciWorkflowSha256 = hash(await readFile(".github/workflows/ci.yml"));
assert.equal(Number.isFinite(Date.parse(candidate.build_started_at)), true);
assert.equal(Number.isFinite(Date.parse(candidate.build_finished_at)), true);
assert(Date.parse(candidate.build_finished_at) >= Date.parse(candidate.build_started_at));
const predicate = {
  buildDefinition: {
    buildType: "https://runacode.io/attestations/typescript-sdk-release/v1",
    externalParameters: {
      source_commit: candidate.source_commit,
      intended_tag: `ts-v${candidate.version}`,
      package_lock_sha256: packageLockSha256,
      ci_workflow_sha256: ciWorkflowSha256,
    },
    internalParameters: {
      github_run_id: Number(process.env.GITHUB_RUN_ID),
      github_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    },
    resolvedDependencies: [
      {
        uri: "git+https://github.com/Runa-Laboratories/runa-lib-ts.git",
        digest: { gitCommit: candidate.source_commit },
      },
      { uri: "file:package-lock.json", digest: { sha256: packageLockSha256 } },
      { uri: "file:.github/workflows/ci.yml", digest: { sha256: ciWorkflowSha256 } },
    ],
  },
  runDetails: {
    builder: {
      id: "https://github.com/Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml@refs/heads/main",
    },
    metadata: {
      invocationId: `https://github.com/Runa-Laboratories/runa-lib-ts/actions/runs/${process.env.GITHUB_RUN_ID}/attempts/${process.env.GITHUB_RUN_ATTEMPT}`,
      startedOn: candidate.build_started_at,
      finishedOn: candidate.build_finished_at,
    },
  },
};
await mkdir("evidence", { recursive: true });
await writeFile("evidence/provenance-predicate.json",
  `${JSON.stringify(predicate, null, 2)}\n`);
console.log(`provenance predicate: PASS (${candidate.source_commit})`);
