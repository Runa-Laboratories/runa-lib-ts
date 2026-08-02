import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const exactKeys = (value, keys) =>
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function validateVitestAcceptanceReceipt(receipt, oracleBytes, catalog, binding) {
  exactKeys(receipt, [
    "acceptance_tests", "oracle_sha256", "package_lock_sha256",
    "passed_assertion_count", "prd_source_sha256", "runner", "schema_version",
    "source_commit", "status", "test_input_sha256", "toolchain",
  ]);
  assert.equal(receipt.schema_version, 1);
  assert.equal(receipt.status, "PASS");
  assert.equal(receipt.runner, "vitest");
  assert.equal(receipt.oracle_sha256, sha256(oracleBytes));
  assert.deepEqual({
    source_commit: receipt.source_commit,
    test_input_sha256: receipt.test_input_sha256,
    prd_source_sha256: receipt.prd_source_sha256,
    package_lock_sha256: receipt.package_lock_sha256,
    toolchain: receipt.toolchain,
  }, binding);
  const oracle = JSON.parse(oracleBytes.toString("utf8"));
  exactKeys(oracle, ["assertions", "schema_version", "status"]);
  assert.equal(oracle.schema_version, 1);
  assert.equal(oracle.status, "PASS");
  const observed = [];
  for (const result of oracle.assertions) {
    exactKeys(result, ["status", "test_file", "test_id"]);
    assert.equal(result.status, "PASS");
    assert.match(result.test_file, /^test\/[A-Za-z0-9._/-]+\.test\.mjs$/u);
    observed.push(result.test_id);
  }
  assert.equal(new Set(observed).size, observed.length,
    "An exact TC identifier may be owned by only one passing assertion.");
  const expected = [...observed].sort();
  assert.deepEqual(receipt.acceptance_tests, expected);
  assert(Number.isSafeInteger(receipt.passed_assertion_count));
  assert(receipt.passed_assertion_count >= expected.length);
  for (const testId of expected) assert(catalog.has(testId), `Unknown TC: ${testId}`);
  return expected;
}

export function validateExternalAcceptancePayload(payload, {
  catalog, prdSourceDigest, candidateSha256, releaseManifestCoreSha256,
  expectedOracle,
}) {
  exactKeys(payload, [
    "candidate_sha256", "oracle", "prd_source_digest", "release_manifest_core_sha256",
    "results", "schema_version", "status",
  ]);
  assert.equal(payload.schema_version, 1);
  assert.equal(payload.status, "PASS");
  assert.equal(payload.prd_source_digest, prdSourceDigest);
  assert.equal(payload.candidate_sha256, candidateSha256);
  assert.equal(payload.release_manifest_core_sha256, releaseManifestCoreSha256);
  exactKeys(payload.oracle, [
    "head_sha", "provider", "repository", "run_attempt", "run_id", "workflow",
  ]);
  assert.deepEqual({
    provider: payload.oracle.provider,
    repository: payload.oracle.repository,
    workflow: payload.oracle.workflow,
  }, expectedOracle);
  assert.equal(payload.oracle.provider, "github-actions");
  assert.match(payload.oracle.head_sha, /^[0-9a-f]{40}$/u);
  assert(Number.isSafeInteger(payload.oracle.run_id) && payload.oracle.run_id > 0);
  assert(Number.isSafeInteger(payload.oracle.run_attempt) && payload.oracle.run_attempt > 0);
  assert(Array.isArray(payload.results) && payload.results.length > 0);
  const seen = new Set();
  for (const result of payload.results) {
    exactKeys(result, ["oracle_case", "status", "test_id"]);
    assert.match(result.test_id, /^TC-\d{3}-\d{2}$/u);
    assert(catalog.has(result.test_id), `Unknown TC: ${result.test_id}`);
    assert.equal(seen.has(result.test_id), false, `Duplicate TC: ${result.test_id}`);
    seen.add(result.test_id);
    assert.equal(result.status, "PASS");
    assert.match(result.oracle_case, /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u);
  }
  return [...seen].sort();
}
