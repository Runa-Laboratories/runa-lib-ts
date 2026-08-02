import assert from "node:assert/strict";

export function validateReleaseMapping(mapping) {
  assert.deepEqual(Object.keys(mapping).sort(), [
    "channels", "package_name", "policy_id", "postpublish_states",
    "registry", "schema_version", "tag_prefix", "withdrawal_policy",
  ].sort());
  assert.equal(mapping.schema_version, 1);
  assert.equal(mapping.policy_id, "TS-053-RELEASE-MAPPING-V1");
  assert.equal(mapping.package_name, "@runa_laboratories/sdk");
  assert.equal(mapping.registry, "https://registry.npmjs.org");
  assert.equal(mapping.tag_prefix, "ts-v");
  assert.deepEqual(mapping.postpublish_states, [
    "published-unverified", "registry-verified", "handoff",
  ]);
  assert.equal(mapping.withdrawal_policy.id, "TS-053-WITHDRAWAL-V1");
  assert.equal(mapping.withdrawal_policy.automatic_unpublish, false);
  assert.equal(mapping.withdrawal_policy.automatic_dist_tag_removal, false);
  return true;
}

export function resolveReleaseChannel(mapping, version) {
  validateReleaseMapping(mapping);
  const matches = Object.entries(mapping.channels).filter(([, row]) =>
    new RegExp(row.version_pattern).test(version));
  assert.equal(matches.length, 1, "R-053-03: version maps to exactly one channel");
  return Object.freeze({
    channel: matches[0][0],
    dist_tag: matches[0][1].dist_tag,
    expected_git_tag: `${mapping.tag_prefix}${version}`,
  });
}

export function validatePostpublishReceipt(receipt, candidate, mapping) {
  validateReleaseMapping(mapping);
  const release = resolveReleaseChannel(mapping, candidate.version);
  assert.equal(receipt.schema_version, 1);
  assert.equal(receipt.state, "handoff");
  assert.equal(receipt.package_name, mapping.package_name);
  assert.equal(receipt.version, candidate.version);
  assert.equal(receipt.dist_tag, release.dist_tag);
  assert.equal(receipt.candidate_sha256, candidate.sha256);
  assert.equal(receipt.registry_tarball_sha256, candidate.sha256);
  assert.equal(receipt.registry_metadata_verified, true);
  assert.equal(receipt.provenance_verified, true);
  assert.equal(receipt.github_attestations_api_verified, true);
  assert.match(receipt.attestation_bundle, /\.intoto\.jsonl$/);
  assert.deepEqual(receipt.transitions, [
    "published-unverified", "registry-verified", "handoff",
  ]);
  return true;
}

export function recoveryPlan(mapping, reason, authorityApproved = false) {
  validateReleaseMapping(mapping);
  assert.match(reason, /^[a-z0-9-]+$/);
  return Object.freeze({
    policy_id: mapping.withdrawal_policy.id,
    status: authorityApproved ? "AUTHORIZED" : "BLOCKED",
    plan: authorityApproved ? "owner-approved-withdrawal" : "no-yank-advisory",
    mutate_registry: authorityApproved,
    advisory_required: true,
    reason,
  });
}
