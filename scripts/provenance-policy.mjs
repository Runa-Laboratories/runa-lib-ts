import assert from "node:assert/strict";

export function validateSignedProvenancePredicate(predicate, expected) {
  assert.deepEqual(Object.keys(predicate).sort(), ["buildDefinition", "runDetails"]);
  assert.deepEqual(Object.keys(predicate.buildDefinition).sort(), [
    "buildType", "externalParameters", "internalParameters", "resolvedDependencies",
  ].sort());
  assert.deepEqual(Object.keys(predicate.runDetails).sort(), ["builder", "metadata"]);
  assert.deepEqual(Object.keys(predicate.runDetails.builder), ["id"]);
  assert.deepEqual(Object.keys(predicate.runDetails.metadata).sort(), [
    "finishedOn", "invocationId", "startedOn",
  ]);
  assert.equal(predicate.buildDefinition.buildType,
    "https://actions.github.io/buildtypes/workflow/v1");
  assert.deepEqual(predicate.buildDefinition.externalParameters, {
    source_commit: expected.sourceCommit,
    intended_tag: expected.intendedTag,
    package_lock_sha256: expected.lockfileSha256,
    ci_workflow_sha256: expected.workflowSha256,
  });
  assert.deepEqual(predicate.buildDefinition.internalParameters, {
    github_run_id: expected.runId,
    github_run_attempt: expected.runAttempt,
  });
  assert.deepEqual(predicate.buildDefinition.resolvedDependencies, [
    {
      uri: "git+https://github.com/Runa-Laboratories/runa-lib-ts.git",
      digest: { gitCommit: expected.sourceCommit },
    },
    { uri: "file:package-lock.json", digest: { sha256: expected.lockfileSha256 } },
    { uri: "file:.github/workflows/ci.yml", digest: { sha256: expected.workflowSha256 } },
  ]);
  for (const dependency of predicate.buildDefinition.resolvedDependencies) {
    assert.deepEqual(Object.keys(dependency).sort(), ["digest", "uri"]);
    const digestKey = dependency.uri.startsWith("git+") ? "gitCommit" : "sha256";
    assert.deepEqual(Object.keys(dependency.digest), [digestKey]);
  }
  assert.equal(predicate.runDetails.builder.id, expected.builderIdentity);
  assert.equal(predicate.runDetails.metadata.invocationId, expected.invocationId);
  assert.equal(predicate.runDetails.metadata.startedOn, expected.buildStartedAt);
  assert.equal(predicate.runDetails.metadata.finishedOn, expected.buildFinishedAt);
  assert.equal(Number.isFinite(Date.parse(expected.buildStartedAt)), true);
  assert.equal(Number.isFinite(Date.parse(expected.buildFinishedAt)), true);
  assert(Date.parse(expected.buildFinishedAt) >= Date.parse(expected.buildStartedAt));
  return true;
}
