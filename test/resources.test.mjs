import assert from "node:assert/strict";
import { test } from "vitest";

import { ApiError, Runa } from "../dist/index.js";
import {
  API_KEY,
  RECORD_ID,
  SESSION_ID,
  jsonResponse,
  meFixture,
  openUrl,
  recordFixture,
  sessionFixture,
  upstreamName,
} from "./helpers.mjs";

test("TC-027-02 managers are lazy, stable and client-owned", async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return jsonResponse([]);
  };
  const first = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch,
  });
  const second = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch,
  });
  assert.equal(first.sessions, first.sessions);
  assert.equal(first.records, first.records);
  assert.notEqual(first.sessions, second.sessions);
  assert.notEqual(first.records, second.records);
  assert.equal(calls, 0);
  await first.close();
  await second.close();
});

test("PRD-029/031/032 preserve collection order and snapshot identity rules", async () => {
  let lookupCount = 0;
  const states = [
    sessionFixture({ name: "first" }),
    sessionFixture({ name: "second" }),
  ];
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/v1/sessions") return jsonResponse([states[0], states[0], states[1]]);
    if (init.method === "GET") {
      lookupCount += 1;
      return jsonResponse(sessionFixture({ name: `refresh-${lookupCount}` }));
    }
    return jsonResponse(sessionFixture({ status: "paused" }));
  };
  const runa = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch,
  });
  const listed = await runa.sessions.list();
  assert.equal(Object.isFrozen(listed), true);
  assert.deepEqual(listed.map((item) => item.snapshot.name), [
    "first",
    "first",
    "second",
  ]);
  assert.notEqual(listed[0], listed[1]);

  const session = await runa.sessions.get(SESSION_ID);
  const before = session.snapshot;
  assert.equal(await session.refresh(), session);
  assert.notEqual(session.snapshot, before);
  const refreshed = session.snapshot;
  assert.equal(await session.pause(), session);
  assert.equal(session.snapshot.status, "paused");
  assert.notEqual(session.snapshot, refreshed);
  await runa.close();
});

test("TC-031-04 preserves snapshot on refresh failure", async () => {
  let call = 0;
  const runa = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch: async () => {
      call += 1;
      return call === 1
        ? jsonResponse(sessionFixture())
        : jsonResponse({ invalid: true });
    },
  });
  const session = await runa.sessions.get(SESSION_ID);
  const before = session.snapshot;
  await assert.rejects(
    session.refresh(),
    (error) => error instanceof ApiError && error.code === "malformed_response",
  );
  assert.equal(session.snapshot, before);
  await runa.close();
});

test("TC-033-05 keeps exec/checkpoint/open cache-neutral", async () => {
  const fetch = async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/exec")) {
      return jsonResponse({
        exit_code: 19,
        stdout: "buffered",
        stderr: "",
        duration_ms: 3,
        stdout_truncated: false,
        stderr_truncated: false,
      });
    }
    if (path.endsWith("/checkpoint")) return jsonResponse({ ok: true });
    if (path.endsWith("/open")) return jsonResponse({ url: openUrl() });
    return jsonResponse(sessionFixture());
  };
  const runa = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch,
  });
  const session = await runa.sessions.get(SESSION_ID);
  const before = session.snapshot;
  assert.equal((await session.exec("exit 19")).exitCode, 19);
  assert.deepEqual(await session.checkpoint("  unchanged  "), { ok: true });
  assert.equal((await session.open()).url, openUrl());
  assert.equal(session.snapshot, before);
  await runa.close();
});

test("TC-035-04 rejects hostile open capability without retaining it", async () => {
  const invalid = `https://${upstreamName()}.example.invalid/__runa/auth?t=value`;
  const runa = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch: async (url) =>
      new URL(url).pathname.endsWith("/open")
        ? jsonResponse({ url: invalid })
        : jsonResponse(sessionFixture()),
  });
  const session = await runa.sessions.get(SESSION_ID);
  await assert.rejects(
    session.open(),
    (error) => {
      assert(error instanceof ApiError);
      assert.equal(JSON.stringify(error).includes(invalid), false);
      return true;
    },
  );
  await runa.close();
});

test("TC-036-06 returns plain fresh values and both workspace variants", async () => {
  let assigned = true;
  const runa = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch: async (url) => {
      const path = new URL(url).pathname;
      if (path === "/v1/records") return jsonResponse([recordFixture(), recordFixture()]);
      const value = meFixture(assigned);
      assigned = false;
      return jsonResponse(value);
    },
  });
  const first = await runa.records.list();
  const second = await runa.records.list();
  assert.notEqual(first, second);
  assert.equal(first.length, 2);
  assert.equal(first[0].id, RECORD_ID);
  assert.deepEqual(first[0].detail, { nested_key: ["unchanged"] });

  const assignedMe = await runa.me();
  assert.equal("usage" in assignedMe.workspace, true);
  assert.equal("waitlistPosition" in assignedMe.workspace, false);
  const unassignedMe = await runa.me();
  assert.equal("usage" in unassignedMe.workspace, false);
  assert.equal("waitlistPosition" in unassignedMe.workspace, true);
  await runa.close();
});

test("TC-013-08 fails closed on protected wire content without truncation", async () => {
  const protectedValue = upstreamName();
  const responses = [
    [recordFixture({ detail: { nested_key: [protectedValue] } })],
    [sessionFixture(), sessionFixture({ name: protectedValue })],
    { ...sessionFixture(), [["runtime", "id"].join("_")]: protectedValue },
  ];
  let index = 0;
  const runa = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch: async () => jsonResponse(responses[index++]),
  });
  for (const operation of [
    () => runa.records.list(),
    () => runa.sessions.list(),
    () => runa.sessions.get(SESSION_ID),
  ]) {
    await assert.rejects(operation(), (error) => {
      assert(error instanceof ApiError);
      assert.equal(error.code, "malformed_response");
      assert.equal(JSON.stringify(error).includes(protectedValue), false);
      return true;
    });
  }
  assert.equal(index, 3);
  await runa.close();
});

test("TC-027-10 close waits for admitted work and blocks later work", async () => {
  let resolveFetch;
  let calls = 0;
  const runa = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch: async () => {
      calls += 1;
      return await new Promise((resolve) => {
        resolveFetch = resolve;
      });
    },
  });
  const pending = runa.sessions.list();
  await new Promise((resolve) => setImmediate(resolve));
  const close = runa.close();
  assert.equal(close, runa.close());
  let closed = false;
  void close.then(() => {
    closed = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed, false);
  resolveFetch(jsonResponse([]));
  assert.deepEqual(await pending, []);
  await close;
  assert.equal(closed, true);
  await assert.rejects(runa.me(), {
    name: "TypeError",
    message: "The Runa client is closed.",
  });
  assert.equal(calls, 1);
});
