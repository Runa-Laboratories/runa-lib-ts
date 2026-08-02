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
} from "./helpers.mjs";

function operationFetch(captures) {
  return async (url, init) => {
    const target = new URL(url);
    captures.push({ target, init });
    const path = target.pathname;
    if (path === "/v1/me") return jsonResponse(meFixture());
    if (path === "/v1/records") return jsonResponse([recordFixture()]);
    if (path === "/v1/sessions" && init.method === "GET") {
      return jsonResponse([sessionFixture()]);
    }
    if (path === "/v1/sessions" && init.method === "POST") {
      return jsonResponse(sessionFixture(), 201);
    }
    if (path.endsWith("/exec")) {
      return jsonResponse({
        exit_code: 7,
        stdout: "out",
        stderr: "err",
        duration_ms: 1,
        stdout_truncated: false,
        stderr_truncated: true,
      });
    }
    if (path.endsWith("/checkpoint") || init.method === "DELETE") {
      return jsonResponse({ ok: true });
    }
    if (path.endsWith("/open")) return jsonResponse({ url: openUrl() });
    return jsonResponse(sessionFixture());
  };
}

test("PRD-021/025/028-037 dispatch exactly 13 canonical operations", async () => {
  const captures = [];
  const runa = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch: operationFetch(captures),
  });
  await runa.me();
  await runa.records.list();
  await runa.sessions.list();
  await runa.sessions.get(SESSION_ID);
  const session = await runa.sessions.create("worker", {
    agent: "codex",
    vcpus: 2,
    memoryMiB: 4096,
    allowedHosts: ["example.invalid"],
    runtimePort: 4444,
  });
  await session.pause();
  await session.resume();
  await session.stop();
  await session.start();
  const exec = await session.exec(["printf", "%s", "value"], {
    cwd: "/workspace",
    timeoutSecs: 1,
  });
  assert.equal(exec.exitCode, 7);
  await session.checkpoint("checkpoint name");
  await session.open();
  await session.delete();

  assert.equal(captures.length, 13);
  assert.deepEqual(
    captures.map(({ target, init }) => `${init.method} ${target.pathname}`),
    [
      "GET /v1/me",
      "GET /v1/records",
      "GET /v1/sessions",
      `GET /v1/sessions/${SESSION_ID}`,
      "POST /v1/sessions",
      `POST /v1/sessions/${SESSION_ID}/pause`,
      `POST /v1/sessions/${SESSION_ID}/resume`,
      `POST /v1/sessions/${SESSION_ID}/stop`,
      `POST /v1/sessions/${SESSION_ID}/start`,
      `POST /v1/sessions/${SESSION_ID}/exec`,
      `POST /v1/sessions/${SESSION_ID}/checkpoint`,
      `POST /v1/sessions/${SESSION_ID}/open`,
      `DELETE /v1/sessions/${SESSION_ID}`,
    ],
  );
  for (const { target, init } of captures) {
    assert.equal(target.origin, "https://api.runacode.io");
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers.Accept, "application/json");
    assert.equal(init.headers.Authorization, `Bearer ${API_KEY}`);
    assert.match(init.headers["User-Agent"], /^runa-sdk-typescript\//);
    assert.equal("X-Runa-Request-Id" in init.headers, false);
    assert.equal(
      init.body === undefined,
      init.headers["Content-Type"] === undefined,
    );
  }
  const createBody = JSON.parse(captures[4].init.body);
  assert.deepEqual(createBody, {
    name: "worker",
    agent: "codex",
    vcpus: 2,
    memory_mib: 4096,
    allowed_hosts: ["example.invalid"],
    runtime_port: 4444,
  });
  const execBody = JSON.parse(captures[9].init.body);
  assert.deepEqual(execBody, {
    command: "printf",
    args: ["%s", "value"],
    cwd: "/workspace",
    timeout_secs: 1,
  });
  await session.exec(["single"]);
  const singleBody = JSON.parse(captures.at(-1).init.body);
  assert.deepEqual(singleBody, { command: "single", args: [] });
  assert.equal(RECORD_ID, (await runa.records.list())[0].id);
  await runa.close();
});

test("PRD-024/025 exact status, media, redirect and error mapping", async () => {
  const scenarios = [
    {
      response: new Response("", { status: 404 }),
      code: "api_error",
      status: 404,
    },
    {
      response: jsonResponse({}, 202),
      code: "malformed_response",
      status: 202,
    },
    {
      response: new Response("", {
        status: 302,
        headers: { location: "https://redirect.example.invalid" },
      }),
      code: "malformed_response",
      status: 302,
    },
    {
      response: new Response("{}", { status: 200 }),
      code: "malformed_response",
      status: 200,
    },
  ];
  for (const scenario of scenarios) {
    const runa = new Runa({
      apiKey: API_KEY,
      baseUrl: "https://api.runacode.io",
      fetch: async () => scenario.response,
    });
    await assert.rejects(runa.me(), (error) => {
      assert(error instanceof ApiError);
      assert.equal(error.code, scenario.code);
      assert.equal(error.status, scenario.status);
      assert.equal("cause" in error, false);
      return true;
    });
    await runa.close();
  }
});

test("PRD-025/040 enforce the response cap and invalid UTF-8", async () => {
  const over = new Uint8Array(8_388_609);
  over.fill(0x20);
  for (const response of [
    new Response(over, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    new Response(new Uint8Array([0xc3, 0x28]), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ]) {
    const runa = new Runa({
      apiKey: API_KEY,
      baseUrl: "https://api.runacode.io",
      fetch: async () => response,
    });
    await assert.rejects(
      runa.me(),
      (error) => error instanceof ApiError && error.code === "malformed_response",
    );
    await runa.close();
  }
});

test("PRD-030/033 reject local invalid values before I/O", async () => {
  let dispatches = 0;
  const runa = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch: async () => {
      dispatches += 1;
      return jsonResponse(sessionFixture());
    },
  });
  await assert.rejects(runa.sessions.get(SESSION_ID.toUpperCase()), TypeError);
  assert.equal(dispatches, 0);
  const session = await runa.sessions.get(SESSION_ID);
  assert.equal(dispatches, 1);
  await assert.rejects(session.exec([]), TypeError);
  await assert.rejects(session.exec(["ok", 7]), TypeError);
  await assert.rejects(session.exec("ok", { timeoutSecs: 0 }), TypeError);
  await assert.rejects(session.exec("ok", { timeoutSecs: 601 }), TypeError);
  await assert.rejects(session.exec("ok", { timeoutSecs: 1.5 }), TypeError);
  await assert.rejects(session.exec("ok", { unknown: true }), TypeError);
  await assert.rejects(session.exec(""), TypeError);
  await assert.rejects(session.checkpoint(""), TypeError);
  await assert.rejects(session.checkpoint("x".repeat(81)), TypeError);
  for (const [name, options] of [
    ["", undefined],
    ["x".repeat(81), undefined],
    ["ok", { vcpus: 0 }],
    ["ok", { memoryMiB: 511 }],
    ["ok", { allowedHosts: [""] }],
    ["ok", { allowedHosts: Array(129).fill("example.invalid") }],
    ["ok", { runtimePort: 65_536 }],
    ["ok", { unknown: true }],
  ]) {
    await assert.rejects(runa.sessions.create(name, options), TypeError);
  }
  assert.equal(dispatches, 1);
  await runa.close();
});

test("PRD-028 snapshots caller-owned create arrays before dispatch", async () => {
  let capturedBody;
  let release;
  const fetch = async (_url, init) => {
    capturedBody = init.body;
    await new Promise((resolve) => {
      release = resolve;
    });
    return jsonResponse(sessionFixture(), 201);
  };
  const runa = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch,
  });
  const allowedHosts = ["first.example.invalid"];
  const pending = runa.sessions.create("snapshot", { allowedHosts });
  allowedHosts[0] = "changed.example.invalid";
  allowedHosts.push("second.example.invalid");
  release();
  await pending;
  assert.deepEqual(JSON.parse(capturedBody), {
    name: "snapshot",
    allowed_hosts: ["first.example.invalid"],
  });
  await runa.close();
});
