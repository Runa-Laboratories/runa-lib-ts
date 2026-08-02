import assert from "node:assert/strict";
import { test } from "vitest";

import { validateCiRunIdentity } from "../scripts/ci-run-policy.mjs";

test("candidate selection rejects every untrusted CI run mutation", () => {
  const commit = "a".repeat(40);
  const context = {
    repository: "Runa-Laboratories/runa-lib-ts",
    runId: "1234",
    sourceCommit: commit,
  };
  const valid = () => ({
    id: 1234,
    name: "CI",
    path: ".github/workflows/ci.yml",
    event: "push",
    head_branch: "main",
    head_sha: commit,
    status: "completed",
    conclusion: "success",
    repository: { full_name: context.repository },
  });
  assert.equal(validateCiRunIdentity(valid(), context), true);
  for (const mutate of [
    (value) => { value.id = 9999; },
    (value) => { value.name = "Other"; },
    (value) => { value.path = ".github/workflows/other.yml"; },
    (value) => { value.event = "pull_request"; },
    (value) => { value.head_branch = "feature"; },
    (value) => { value.head_sha = "b".repeat(40); },
    (value) => { value.status = "in_progress"; },
    (value) => { value.conclusion = "failure"; },
    (value) => { value.repository.full_name = "attacker/fork"; },
  ]) {
    const candidate = valid();
    mutate(candidate);
    assert.throws(() => validateCiRunIdentity(candidate, context));
  }
});
