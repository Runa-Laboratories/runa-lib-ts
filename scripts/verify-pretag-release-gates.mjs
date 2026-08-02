import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateReleaseManifestCore } from "./release-manifest-core.mjs";
import { validateSmokeEvidence } from "./evidence-policy.mjs";
import { validateApprovedLicense } from "./license-policy.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
assert.equal(candidate.source_tree_clean, true);
assert.match(candidate.source_commit, /^[0-9a-f]{40}$/u);
assert.equal(hash(await readFile(`release-artifacts/${candidate.filename}`)), candidate.sha256);
assert.equal(validateApprovedLicense(
  await readFile("LICENSE", "utf8"),
  JSON.parse(await readFile("package.json", "utf8")),
), true);
const core = JSON.parse(await readFile(
  "release-artifacts/release-manifest-core.json", "utf8",
));
assert.equal(await validateReleaseManifestCore(core), true);
const quality = JSON.parse(await readFile("evidence/quality-gate.json", "utf8"));
assert.equal(quality.status, "PASS");
assert.equal(quality.commit_sha, candidate.source_commit);
for (const file of [
  "ci-candidate-manifest.json", "dependency-audit.json", "docs-readiness.json",
  "performance-local.json", "runtime-closure.json", "sbom-local-validation.json",
]) {
  const evidence = JSON.parse(await readFile(`evidence/${file}`, "utf8"));
  assert.equal(evidence.status, "PASS", `${file} is not PASS.`);
}
const smoke = JSON.parse(await readFile("evidence/release-smoke.json", "utf8"));
assert.equal(validateSmokeEvidence(smoke, candidate.sha256), true);
const map = JSON.parse(await readFile("evidence/requirement-test-map.json", "utf8"));
assert.equal(map.requirement_count > 0, true);
assert.equal(map.acceptance_test_count > 0, true);
assert.equal(map.acceptance_results.length, map.acceptance_test_count);
console.log(`pre-tag non-approval readiness: PASS (${candidate.sha256})`);
