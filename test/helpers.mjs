export const SESSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
export const RECORD_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
export const API_KEY = ["runa", "sk", "synthetic"].join("_");

export function sessionFixture(overrides = {}) {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    slug: "synthetic-session",
    name: "Synthetic session",
    agent: "codex",
    vcpus: 2,
    memory_mib: 4096,
    status: "running",
    running_seconds: 7,
    created_at: "2026-07-30T00:00:00Z",
    updated_at: "2026-07-30T00:00:01Z",
    url: "https://synthetic-session.runacode.cloud",
    ...overrides,
  };
}

export function meFixture(assigned = true) {
  return assigned
    ? {
        id: USER_ID,
        email: "sdk@example.invalid",
        workspace: {
          assigned: true,
          usage: {
            est_spend_usd: 1,
            est_remaining_usd: 2,
            note: "Estimated usage.",
          },
        },
      }
    : {
        id: USER_ID,
        email: "sdk@example.invalid",
        workspace: { assigned: false, waitlist_position: 3 },
      };
}

export function recordFixture(overrides = {}) {
  return {
    id: RECORD_ID,
    session_id: SESSION_ID,
    kind: "synthetic",
    summary: "Synthetic record.",
    detail: { nested_key: ["unchanged"] },
    created_at: "2026-07-30T00:00:02Z",
    ...overrides,
  };
}

export function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function openUrl() {
  return [
    "https://synthetic-session.runacode.cloud/__runa/auth?t=",
    "synthetic",
  ].join("");
}

export function upstreamName() {
  return String.fromCharCode(114, 117, 110, 116, 97);
}
