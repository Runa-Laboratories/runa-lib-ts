import assert from "node:assert/strict";

const JOURNEYS = [
  "ttfc",
  "first-session",
  "first-exec",
  "session-lifecycle-checkpoint",
  "read-and-open-boundary",
];

export function validateRequirementTestMap(value) {
  assert.equal(value.requirement_status_summary?.NOT_RUN, 0);
  assert.equal(value.acceptance_status_summary?.NOT_RUN, 0);
  assert.equal(value.requirement_status_summary?.PASS, value.requirement_count);
  assert.equal(value.acceptance_status_summary?.PASS, value.acceptance_test_count);
  assert.equal(value.acceptance_results?.length, value.acceptance_test_count);
  assert.equal(value.acceptance_results.every((result) => result.status === "PASS"), true);
  return true;
}

export function validateRequirementTestMapWithReceipts(value, receiptIds) {
  assert.equal(value.acceptance_results?.length, value.acceptance_test_count);
  assert.equal(value.acceptance_test_ids?.length, value.acceptance_test_count);
  const catalog = new Set(value.acceptance_test_ids);
  const passed = new Set(value.acceptance_results
    .filter((result) => result.status === "PASS").map((result) => result.test_id));
  for (const testId of receiptIds) {
    assert(catalog.has(testId), `External receipt names unknown ${testId}.`);
    passed.add(testId);
  }
  assert.equal(passed.size, value.acceptance_test_count);
  assert.equal(value.rows.length, value.requirement_count);
  assert.equal(value.rows.every((row) =>
    row.acceptance_test_ids.every((testId) => passed.has(testId))), true);
  return true;
}

export function validateSmokeEvidence(value, candidateSha256) {
  assert.equal(value.status, "PASS");
  assert.equal(value.candidate_sha256, candidateSha256);
  assert.equal(value.synthetic, true);
  assert.equal(value.clean_room_count, 150);
  assert.equal(value.runs_per_journey, 30);
  assert.equal(value.public_network_dispatches, 0);
  assert.equal(Number.isSafeInteger(value.synthetic_dispatches), true);
  assert.equal(value.synthetic_dispatches > 0, true);
  assert.deepEqual(value.network_guard_mechanisms, [
    "global.fetch", "node:http.request", "node:https.request", "WebSocket",
  ]);
  assert.equal(value.network_guard_result, "PASS");
  assert.deepEqual(Object.keys(value.journeys), JOURNEYS);
  for (const journey of JOURNEYS) {
    assert.equal(value.journeys[journey].passed, 30);
    assert.equal(value.journeys[journey].elapsed_ms.length, 30);
    if (journey !== "ttfc") assert.equal(value.journeys[journey].cleanup, "pass");
  }
  return true;
}
