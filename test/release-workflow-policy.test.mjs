import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

test("release workflow is one protected dispatch with pinned signing and at-most-once gates", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");
  const ci = await readFile(".github/workflows/ci.yml", "utf8");
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /push:\s*\n\s+tags:/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.equal((workflow.match(
    /actions\/setup-go@4a3601121dd01d1626a1e23e37211e3254c1c06c/gu,
  ) ?? []).length, 3);
  assert.equal((workflow.match(/go-version: '1\.25\.9'/gu) ?? []).length, 3);
  assert.equal((workflow.match(
    /go install github\.com\/sigstore\/gitsign@v0\.16\.0/gu,
  ) ?? []).length, 3);
  assert.match(workflow, /actions: read/u);
  assert.match(workflow, /node scripts\/verify-ci-run\.mjs/u);
  assert.doesNotMatch(workflow, /RUNA_RELEASE_AUTHORITY_BUNDLE_BASE64/u);
  const phaseA = workflow.indexOf("  phase-a:");
  const signTag = workflow.indexOf("  sign-tag:");
  const admission = workflow.indexOf("  admission:");
  const publishJob = workflow.indexOf("  publish:");
  assert.equal(phaseA >= 0 && phaseA < signTag && signTag < admission &&
    admission < publishJob, true);
  assert.match(workflow, /sign-tag:\s*\n\s+needs: phase-a/u);
  assert.match(workflow, /admission:\s*\n\s+name: release-admission\s*\n\s+needs: \[phase-a, sign-tag\]/u);
  assert.match(workflow, /publish:\s*\n\s+needs: admission/u);
  const preflight = workflow.indexOf("npm run release:registry:preflight");
  const attest = workflow.indexOf("id: attest");
  const publish = workflow.indexOf("npm publish");
  assert.equal(preflight >= 0 && preflight < attest && attest < publish, true);
  assert.match(ci, /release-admission:\s*\n\s+name: release-admission/u);
  assert.match(ci, /name: release-admission\s*\n\s+needs: \[candidate, compatibility\]/u);
  assert.match(ci, /npm run release:ci:admission/u);
});
