import assert from "node:assert/strict";
import { test } from "vitest";
import { validateSignedProvenancePredicate } from "../scripts/provenance-policy.mjs";

test("signed provenance predicate rejects every identity and build-input mutation", () => {
  const commit = "b".repeat(40);
  const expected = {
    sourceCommit: commit,
    workflowRef: "refs/heads/main",
    repository: "https://github.com/Runa-Laboratories/runa-lib-ts",
    workflowPath: ".github/workflows/ci.yml",
    eventName: "push", repositoryId: "123", repositoryOwnerId: "456",
    runnerEnvironment: "github-hosted",
    sourceUri: "git+https://github.com/Runa-Laboratories/runa-lib-ts@refs/heads/main",
    builderIdentity: "https://github.com/Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml@refs/heads/main",
    invocationId: "https://github.com/Runa-Laboratories/runa-lib-ts/actions/runs/7/attempts/2",
  };
  const valid = {
    buildDefinition: {
      buildType: "https://actions.github.io/buildtypes/workflow/v1",
      externalParameters: { workflow: {
        ref: expected.workflowRef, repository: expected.repository,
        path: expected.workflowPath,
      }},
      internalParameters: { github: {
        event_name: expected.eventName, repository_id: expected.repositoryId,
        repository_owner_id: expected.repositoryOwnerId,
        runner_environment: expected.runnerEnvironment,
      }},
      resolvedDependencies: [{
        uri: expected.sourceUri, digest: { gitCommit: commit },
      }],
    },
    runDetails: {
      builder: { id: expected.builderIdentity },
      metadata: { invocationId: expected.invocationId },
    },
  };
  assert.equal(validateSignedProvenancePredicate(valid, expected), true);
  for (const mutate of [
    (value) => { value.buildDefinition.externalParameters.workflow.ref = "refs/heads/other"; },
    (value) => { value.buildDefinition.resolvedDependencies[0].digest.gitCommit = "c".repeat(40); },
    (value) => { value.runDetails.builder.id += "/alien"; },
    (value) => { value.buildDefinition.internalParameters.github.event_name = "pull_request"; },
    (value) => { value.runDetails.metadata.hostile_extra = "signed-but-forbidden"; },
    (value) => { value.buildDefinition.resolvedDependencies[0].digest.sha256 = "d".repeat(64); },
  ]) {
    const changed = structuredClone(valid);
    mutate(changed);
    assert.throws(() => validateSignedProvenancePredicate(changed, expected));
  }
});
