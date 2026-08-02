import assert from "node:assert/strict";

export function validateCiRunIdentity(run, {
  repository,
  runId,
  sourceCommit,
}) {
  assert.equal(String(run.id), String(runId), "R-053-04: CI run ID mismatch");
  assert.equal(run.name, "CI", "R-053-04: candidate did not come from CI");
  assert.equal(run.path, ".github/workflows/ci.yml",
    "R-053-04: candidate workflow path mismatch");
  assert.equal(run.event, "push", "R-053-04: candidate run was not a push");
  assert.equal(run.head_branch, "main", "R-053-04: candidate was not built from main");
  assert.equal(run.head_sha, sourceCommit, "R-053-04: candidate source commit mismatch");
  assert.equal(run.status, "completed", "R-053-04: candidate CI run is incomplete");
  assert.equal(run.conclusion, "success", "R-053-04: candidate CI run did not pass");
  assert.equal(run.repository?.full_name, repository,
    "R-053-04: candidate repository mismatch");
  return true;
}
