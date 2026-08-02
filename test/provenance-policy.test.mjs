import assert from "node:assert/strict";
import { test } from "vitest";
import { validateSignedProvenancePredicate } from "../scripts/provenance-policy.mjs";

test("signed provenance predicate rejects every identity and build-input mutation", () => {
  const digest = "a".repeat(64);
  const commit = "b".repeat(40);
  const expected = {
    sourceCommit: commit, intendedTag: "ts-v0.1.0",
    lockfileSha256: digest, workflowSha256: digest,
    runId: 7, runAttempt: 2,
    builderIdentity: "https://github.com/Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml@refs/heads/main",
    invocationId: "https://github.com/Runa-Laboratories/runa-lib-ts/actions/runs/7/attempts/2",
    buildStartedAt: "2026-08-02T00:00:00.000Z",
    buildFinishedAt: "2026-08-02T00:00:01.000Z",
  };
  const valid = {
    buildDefinition: {
      buildType: "https://runacode.io/attestations/typescript-sdk-release/v1",
      externalParameters: {
        source_commit: commit, intended_tag: "ts-v0.1.0",
        package_lock_sha256: digest, ci_workflow_sha256: digest,
      },
      internalParameters: { github_run_id: 7, github_run_attempt: 2 },
      resolvedDependencies: [
        { uri: "git+https://github.com/Runa-Laboratories/runa-lib-ts.git", digest: { gitCommit: commit } },
        { uri: "file:package-lock.json", digest: { sha256: digest } },
        { uri: "file:.github/workflows/ci.yml", digest: { sha256: digest } },
      ],
    },
    runDetails: {
      builder: { id: expected.builderIdentity },
      metadata: {
        invocationId: expected.invocationId,
        startedOn: expected.buildStartedAt,
        finishedOn: expected.buildFinishedAt,
      },
    },
  };
  assert.equal(validateSignedProvenancePredicate(valid, expected), true);
  for (const mutate of [
    (value) => { value.buildDefinition.externalParameters.intended_tag = "ts-v9.9.9"; },
    (value) => { value.buildDefinition.resolvedDependencies[1].digest.sha256 = "c".repeat(64); },
    (value) => { value.runDetails.builder.id += "/alien"; },
    (value) => { value.runDetails.metadata.finishedOn = "2025-01-01T00:00:00Z"; },
    (value) => { value.runDetails.metadata.hostile_extra = "signed-but-forbidden"; },
    (value) => { value.buildDefinition.resolvedDependencies[0].digest.sha256 = digest; },
  ]) {
    const changed = structuredClone(valid);
    mutate(changed);
    assert.throws(() => validateSignedProvenancePredicate(changed, expected));
  }
});
