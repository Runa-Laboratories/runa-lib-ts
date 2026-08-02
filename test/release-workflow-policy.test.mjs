import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

test("release workflow is one protected dispatch with pinned signing and at-most-once gates", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");
  const recovery = await readFile(".github/workflows/release-recovery.yml", "utf8");
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
  assert.doesNotMatch(workflow, /recovery_mode|RUNA_VERIFY_ONLY|--clobber/u);
  assert.doesNotMatch(workflow, /RUNA_AUTHORITY_READ_TOKEN|personal.access.token|github.app/iu);
  assert.match(workflow, /gh release create/u);
  assert.match(workflow, /gh release upload/u);
  assert.match(workflow, /release:assets:verify/u);
  assert.match(workflow, /gh release edit/u);
  assert.match(workflow, /release-manifest-envelope\.authority-admitted\.json/u);
  assert.match(recovery, /name: release-recovery-read-only/u);
  assert.match(recovery, /ref: refs\/tags\/ts-v\$\{\{ inputs\.version \}\}/u);
  assert.match(recovery, /RUNA_SOURCE_COMMIT: \$\{\{ env\.RUNA_SOURCE_COMMIT \}\}/u);
  assert.match(recovery, /release:recovery:verify/u);
  assert.equal((recovery.match(/contents: read/gu) ?? []).length >= 2, true);
  assert.equal((recovery.match(/actions: read/gu) ?? []).length >= 2, true);
  assert.doesNotMatch(recovery,
    /contents: write|id-token: write|attest-build-provenance|npm publish|npm dist-tag|git push|git tag -s|gh release (?:create|upload|edit|delete)|upload-artifact|--clobber|appendReleaseManifestState/u);
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
