import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
  recoveryPlan,
  resolveReleaseChannel,
  validatePostpublishReceipt,
  validateReleaseMapping,
} from "../scripts/postpublish-policy.mjs";

const mapping = JSON.parse(
  await readFile("governance/release-mapping.json", "utf8"),
);
const digest = "a".repeat(64);
const candidate = { version: "1.2.3", sha256: digest };
const clean = {
  schema_version: 1,
  state: "handoff",
  package_name: "@runa_laboratories/sdk",
  version: "1.2.3",
  dist_tag: "latest",
  candidate_sha256: digest,
  registry_tarball_sha256: digest,
  registry_metadata_verified: true,
  provenance_verified: true,
  github_attestations_api_verified: true,
  attestation_bundle: "evidence/sdk.intoto.jsonl",
  transitions: ["published-unverified", "registry-verified", "handoff"],
};

test("release mapping, postpublish state, and recovery policy fail closed", () => {
  assert.equal(validateReleaseMapping(mapping), true);
  assert.equal(resolveReleaseChannel(mapping, "1.2.3").dist_tag, "latest");
  assert.equal(resolveReleaseChannel(mapping, "1.2.3-rc.1").dist_tag, "next");
  assert.equal(validatePostpublishReceipt(clean, candidate, mapping), true);
  for (const mutate of [
    (value) => { value.state = "published-unverified"; },
    (value) => { value.dist_tag = "next"; },
    (value) => { value.registry_tarball_sha256 = "b".repeat(64); },
    (value) => { value.provenance_verified = false; },
    (value) => { value.github_attestations_api_verified = false; },
    (value) => { value.transitions.splice(1, 1); },
  ]) {
    const hostile = structuredClone(clean);
    mutate(hostile);
    assert.throws(() =>
      validatePostpublishReceipt(hostile, candidate, mapping));
  }
  assert.deepEqual(recoveryPlan(mapping, "verification-failed"), {
    policy_id: "TS-053-WITHDRAWAL-V1",
    status: "BLOCKED",
    plan: "no-yank-advisory",
    mutate_registry: false,
    advisory_required: true,
    reason: "verification-failed",
  });
});
