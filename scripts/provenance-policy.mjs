import assert from "node:assert/strict";

export function validateSignedProvenancePredicate(predicate, expected) {
  assert.deepEqual(Object.keys(predicate).sort(), ["buildDefinition", "runDetails"]);
  assert.deepEqual(Object.keys(predicate.buildDefinition).sort(), [
    "buildType", "externalParameters", "internalParameters", "resolvedDependencies",
  ].sort());
  assert.deepEqual(Object.keys(predicate.runDetails).sort(), ["builder", "metadata"]);
  assert.deepEqual(Object.keys(predicate.runDetails.builder), ["id"]);
  assert.deepEqual(Object.keys(predicate.runDetails.metadata), ["invocationId"]);
  assert.equal(predicate.buildDefinition.buildType,
    "https://actions.github.io/buildtypes/workflow/v1");
  assert.deepEqual(predicate.buildDefinition.externalParameters, { workflow: {
    ref: expected.workflowRef,
    repository: expected.repository,
    path: expected.workflowPath,
  }});
  assert.deepEqual(predicate.buildDefinition.internalParameters, { github: {
    event_name: expected.eventName,
    repository_id: expected.repositoryId,
    repository_owner_id: expected.repositoryOwnerId,
    runner_environment: expected.runnerEnvironment,
  }});
  assert.deepEqual(predicate.buildDefinition.resolvedDependencies, [{
    uri: expected.sourceUri,
    digest: { gitCommit: expected.sourceCommit },
  }]);
  assert.deepEqual(Object.keys(
    predicate.buildDefinition.resolvedDependencies[0],
  ).sort(), ["digest", "uri"]);
  assert.deepEqual(Object.keys(
    predicate.buildDefinition.resolvedDependencies[0].digest,
  ), ["gitCommit"]);
  assert.equal(predicate.runDetails.builder.id, expected.builderIdentity);
  assert.equal(predicate.runDetails.metadata.invocationId, expected.invocationId);
  return true;
}
