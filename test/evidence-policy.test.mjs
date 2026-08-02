import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import { validateVitestAcceptanceReceipt } from "../scripts/acceptance-receipts.mjs";

import {
  validateRequirementTestMap,
  validateSmokeEvidence,
} from "../scripts/evidence-policy.mjs";

test("quality rejects every mandatory NOT_RUN acceptance path", () => {
  const clean = {
    requirement_count: 1,
    acceptance_test_count: 1,
    requirement_status_summary: { PASS: 1, NOT_RUN: 0 },
    acceptance_status_summary: { PASS: 1, NOT_RUN: 0 },
    acceptance_results: [{ test_id: "TC-001-01", status: "PASS" }],
  };
  assert.equal(validateRequirementTestMap(clean), true);
  for (const mutate of [
    (value) => { value.requirement_status_summary.NOT_RUN = 1; },
    (value) => { value.acceptance_status_summary.NOT_RUN = 1; },
    (value) => { value.acceptance_results[0].status = "NOT_RUN"; },
  ]) {
    const candidate = structuredClone(clean);
    mutate(candidate);
    assert.throws(() => validateRequirementTestMap(candidate));
  }
});

test("Vitest exact-ID receipts reject tamper, unknown IDs, and failed assertions", () => {
  const report = (status = "PASS", testId = "TC-025-02") => Buffer.from(JSON.stringify({
    schema_version: 1, status: "PASS",
    assertions: [{ status, test_file: "test/transport.test.mjs", test_id: testId }],
  }));
  const binding = {
    source_commit: "a".repeat(40), test_input_sha256: "b".repeat(64),
    prd_source_sha256: "c".repeat(64), package_lock_sha256: "d".repeat(64),
    toolchain: { node: "v22.17.1", vitest: "3.2.7" },
  };
  const receipt = (bytes, ids = ["TC-025-02"]) => ({
    schema_version: 1, status: "PASS", runner: "vitest",
    oracle_sha256: createHash("sha256").update(bytes).digest("hex"),
    passed_assertion_count: 1, acceptance_tests: ids, ...binding,
  });
  const valid = report();
  assert.deepEqual(validateVitestAcceptanceReceipt(
    receipt(valid), valid, new Set(["TC-025-02"]), binding,
  ), ["TC-025-02"]);
  assert.throws(() => validateVitestAcceptanceReceipt(
    receipt(valid), Buffer.concat([valid, Buffer.from(" ")]), new Set(["TC-025-02"]), binding,
  ));
  const unknown = report("PASS", "TC-999-99");
  assert.throws(() => validateVitestAcceptanceReceipt(
    receipt(unknown, ["TC-999-99"]), unknown, new Set(["TC-025-02"]), binding,
  ));
  const failed = report("FAIL");
  assert.throws(() => validateVitestAcceptanceReceipt(
    receipt(failed), failed, new Set(["TC-025-02"]), binding,
  ));
});

test("readiness rejects fabricated smoke counters and missing guards", () => {
  const digest = "a".repeat(64);
  const journey = (cleanup = "pass") => ({
    passed: 30,
    public_calls: ["Runa"],
    cleanup,
    elapsed_ms: Array(30).fill(1),
  });
  const clean = {
    status: "PASS",
    candidate_sha256: digest,
    synthetic: true,
    clean_room_count: 150,
    runs_per_journey: 30,
    synthetic_dispatches: 240,
    public_network_dispatches: 0,
    network_guard_mechanisms: [
      "global.fetch", "node:http.request", "node:https.request", "WebSocket",
    ],
    network_guard_result: "PASS",
    journeys: {
      ttfc: journey("not-required"),
      "first-session": journey(),
      "first-exec": journey(),
      "session-lifecycle-checkpoint": journey(),
      "read-and-open-boundary": journey(),
    },
  };
  assert.equal(validateSmokeEvidence(clean, digest), true);
  for (const mutate of [
    (value) => { value.public_network_dispatches = 1; },
    (value) => { value.synthetic_dispatches = 0; },
    (value) => { value.network_guard_result = "BLOCKED"; },
    (value) => { value.journeys["first-session"].cleanup = "not-required"; },
    (value) => { value.journeys.ttfc.passed = 29; },
  ]) {
    const candidate = structuredClone(clean);
    mutate(candidate);
    assert.throws(() => validateSmokeEvidence(candidate, digest));
  }
});
