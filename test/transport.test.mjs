import assert from "node:assert/strict";
import { test } from "vitest";

import { ApiError, Runa } from "../dist/index.js";
import {
  API_KEY,
  RECORD_ID,
  SESSION_ID,
  agentAuthenticationFixture,
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
    if (path.endsWith("/agent-auth")) {
      return jsonResponse(agentAuthenticationFixture());
    }
    if (path.endsWith("/open")) return jsonResponse({ url: openUrl() });
    return jsonResponse(sessionFixture());
  };
}

test("PRD-021/025/028-037 dispatch exactly 14 canonical operations", async () => {
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
  assert.deepEqual(await session.authenticationStatus(), {
    agent: "codex",
    method: "interactive_login",
    state: "authenticated",
  });
  await session.delete();

  assert.equal(captures.length, 14);
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
      `GET /v1/sessions/${SESSION_ID}/agent-auth`,
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
    background: true,
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

test("interactive creates default to background and preserve explicit control", async () => {
  const bodies = [];
  const runa = new Runa({
    apiKey: API_KEY,
    fetch: async (_url, init) => {
      if (init.method === "GET") {
        return jsonResponse(sessionFixture({ status: "running" }));
      }
      bodies.push(JSON.parse(init.body));
      return jsonResponse(sessionFixture({ status: "creating" }), 201);
    },
  });

  const codex = await runa.sessions.create("codex", { agent: "codex" });
  const claude = await runa.sessions.create("claude", { agent: "claude-code" });
  await runa.sessions.create("legacy", { agent: "codex", background: false });
  await runa.sessions.create("openclaw", { agent: "openclaw" });

  assert.equal(codex.snapshot.status, "creating");
  assert.equal(claude.snapshot.status, "creating");
  assert.deepEqual(bodies, [
    { name: "codex", agent: "codex", background: true },
    { name: "claude", agent: "claude-code", background: true },
    { name: "legacy", agent: "codex", background: false },
    { name: "openclaw", agent: "openclaw" },
  ]);
  assert.equal(await codex.refresh(), codex);
  assert.equal(codex.snapshot.status, "running");
  await runa.close();
});

test("agent authentication status is closed, strict, and secret-free", async () => {
  const invalid = [
    agentAuthenticationFixture({ method: "oauth" }),
    agentAuthenticationFixture({ state: "unknown" }),
    agentAuthenticationFixture({ method: "api_key", state: "authenticated" }),
    agentAuthenticationFixture({ method: "interactive_login", state: "configured" }),
    agentAuthenticationFixture({ method: "none", state: "installing" }),
    agentAuthenticationFixture({ agent: "other" }),
    agentAuthenticationFixture({ token: "must-not-be-exposed" }),
    { method: "none", state: "not_applicable" },
  ];
  for (const payload of invalid) {
    const runa = new Runa({
      apiKey: API_KEY,
      fetch: async (url) => new URL(url).pathname.endsWith("/agent-auth")
        ? jsonResponse(payload)
        : jsonResponse(sessionFixture()),
    });
    const session = await runa.sessions.get(SESSION_ID);
    await assert.rejects(
      session.authenticationStatus(),
      (error) => error instanceof ApiError && error.code === "malformed_response",
    );
    await runa.close();
  }

  const runa = new Runa({
    apiKey: API_KEY,
    fetch: async (url) => new URL(url).pathname.endsWith("/agent-auth")
      ? jsonResponse({ agent: null, method: "none", state: "not_applicable" })
      : jsonResponse(sessionFixture()),
  });
  const session = await runa.sessions.get(SESSION_ID);
  assert.deepEqual(await session.authenticationStatus(), {
    agent: null,
    method: "none",
    state: "not_applicable",
  });
  await runa.close();
});

test("PRD-024/025 map exact status, media, redirect and errors", async () => {
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

test("TC-025-02 selects the exact global fetch when no callable is injected", async () => {
  const originalFetch = globalThis.fetch;
  let injectedCalls = 0;
  const injected = async () => {
    injectedCalls += 1;
    return jsonResponse(meFixture());
  };
  const injectedClient = new Runa({ apiKey: API_KEY, fetch: injected });
  await injectedClient.me();
  assert.equal(injectedCalls, 1);
  await injectedClient.close();
  let calls = 0;
  const selected = async (url, init) => {
    calls += 1;
    assert.equal(new URL(url).origin, "https://api.runacode.io");
    assert.equal(init.method, "GET");
    return jsonResponse(meFixture());
  };
  globalThis.fetch = selected;
  try {
    const runa = new Runa({ apiKey: API_KEY });
    assert.equal((await runa.me()).email, "sdk@example.invalid");
    assert.equal(calls, 1);
    await runa.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("TC-040-02 rejects hostile redirects with one request and no exposure", async () => {
  const hostile = "https://steal.example.invalid/private?token=hostile";
  for (const responseInit of [
    { status: 500, headers: { "content-type": "application/json" } },
    { status: 302, headers: { location: hostile } },
    { status: 200, headers: { "content-type": "text/plain" } },
  ]) {
    let cancellations = 0;
    let requests = 0;
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(hostile));
      },
      cancel() {
        cancellations += 1;
        return new Promise(() => {});
      },
    });
    const runa = new Runa({
      apiKey: API_KEY,
      baseUrl: "https://api.runacode.io",
      fetch: async () => {
        requests += 1;
        return new Response(body, responseInit);
      },
    });
    await assert.rejects(runa.me(), (error) => {
      assert(error instanceof ApiError);
      assert.equal(JSON.stringify(error).includes(hostile), false);
      return true;
    });
    assert.equal(requests, 1);
    assert.equal(cancellations, 1);
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

test("PRD-025/026 overflow remains terminal when stream cancellation never settles", async () => {
  let cancellations = 0;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8_388_609));
    },
    cancel() {
      cancellations += 1;
      return new Promise(() => {});
    },
  });
  const runa = new Runa({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io",
    fetch: async () => new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  let outcome;
  void runa.me().then(
    () => { outcome = "resolved"; },
    (error) => { outcome = error; },
  );
  for (let turn = 0; turn < 10 && outcome === undefined; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert(outcome instanceof ApiError);
  assert.equal(outcome.code, "malformed_response");
  assert.equal(cancellations, 1);
  await runa.close();
});

test("TC-025-07 rejects local invalid values before I/O", async () => {
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
    ["ok", { allowedHosts: ["example.invalid"], outboundPolicy: { mode: "allowlist", hosts: [] } }],
    ["ok", { outboundPolicy: { mode: "permit", hosts: [] } }],
    ["ok", { outboundPolicy: { mode: "denylist", hosts: ["EXAMPLE.COM"] } }],
    ["ok", { outboundPolicy: { mode: "denylist", hosts: ["example.com", "example.com"] } }],
    ["ok", { outboundPolicy: { mode: "denylist", hosts: Array(129).fill("example.invalid") } }],
    ["ok", { runtimePort: 65_536 }],
    ["ok", { background: "true" }],
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

test("serializes explicit outbound allow and deny policies without provider fields", async () => {
  const bodies = [];
  const runa = new Runa({ apiKey: API_KEY, fetch: async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return jsonResponse(sessionFixture(), 201);
  } });
  const hosts = ["tracking.example.com", "*.phishing.test"];
  await runa.sessions.create("deny", { outboundPolicy: { mode: "denylist", hosts } });
  hosts[0] = "changed.example.com";
  await runa.sessions.create("allow-empty", { outboundPolicy: { mode: "allowlist", hosts: [] } });
  assert.deepEqual(bodies, [
    { name: "deny", outbound_policy: { mode: "denylist", hosts: ["tracking.example.com", "*.phishing.test"] } },
    { name: "allow-empty", outbound_policy: { mode: "allowlist", hosts: [] } },
  ]);
  await runa.close();
});

test("TC-033-05 accepts only integer timeoutSecs from 1 through 600", async () => {
  let dispatches = 0;
  const runa = new Runa({
    apiKey: API_KEY,
    fetch: async (url) => {
      dispatches += 1;
      if (new URL(url).pathname.endsWith("/exec")) {
        return jsonResponse({
          exit_code: 0, stdout: "", stderr: "", duration_ms: 0,
          stdout_truncated: false, stderr_truncated: false,
        });
      }
      return jsonResponse(sessionFixture());
    },
  });
  const session = await runa.sessions.get(SESSION_ID);
  for (const timeoutSecs of [1, 600]) await session.exec("true", { timeoutSecs });
  const afterValid = dispatches;
  for (const timeoutSecs of [0, 601, 1.5, Infinity, null, "1"]) {
    await assert.rejects(session.exec("true", { timeoutSecs }), TypeError);
  }
  assert.equal(dispatches, afterValid);
  await runa.close();
});
