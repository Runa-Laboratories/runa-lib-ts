import assert from "node:assert/strict";
import { test } from "vitest";

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
