import assert from "node:assert/strict";
import { test } from "vitest";

import { FetchTransport } from "../dist/internal/transport.js";
import { API_KEY, jsonResponse, meFixture } from "./helpers.mjs";

function config(fetch, hooks = {}) {
  return Object.freeze({
    apiKey: API_KEY,
    baseUrl: "https://sdk.example.invalid",
    fetch,
    apiKeySource: "constructor",
    baseUrlSource: "constructor",
    ...hooks,
  });
}

function deterministicRuntime(randomValues = []) {
  let now = 0;
  const delays = [];
  let index = 0;
  return {
    delays,
    runtime: {
      now: () => now,
      timer: () => ({ cancel() {} }),
      sleep: async (delay) => {
        delays.push(delay);
        now += delay;
      },
      randomUint32: () => randomValues[index++] ?? 0,
      requestId: () => `runa_req_${"0".repeat(32)}`,
    },
  };
}

test("PRD-009/026 retries only pre-response reads with unbiased mapping", async () => {
  let calls = 0;
  const rejected = Math.floor(0x1_0000_0000 / 101) * 101;
  const { runtime, delays } = deterministicRuntime([rejected, 37, 151]);
  const transport = new FetchTransport(
    config(async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("synthetic");
      return jsonResponse(meFixture());
    }),
    runtime,
  );
  const me = await transport.execute("me.get");
  assert.equal(me.email, "sdk@example.invalid");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [37, 151]);
});

test("PRD-009/026 never retries a response or write", async () => {
  for (const operation of ["me.get", "sessions.create"]) {
    let calls = 0;
    const { runtime } = deterministicRuntime();
    const transport = new FetchTransport(
      config(async () => {
        calls += 1;
        if (operation === "me.get") return new Response("", { status: 503 });
        throw new TypeError("synthetic");
      }),
      runtime,
    );
    await assert.rejects(transport.execute(operation, operation === "sessions.create" ? { body: { name: "x" } } : {}));
    assert.equal(calls, 1);
  }
});

test("PRD-008/009 pre-cancellation performs zero dispatch", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const { runtime } = deterministicRuntime();
  const transport = new FetchTransport(
    config(async () => {
      calls += 1;
      return jsonResponse(meFixture());
    }),
    runtime,
  );
  await assert.rejects(
    transport.execute("me.get", { signal: controller.signal }),
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(calls, 0);
});

test("PRD-008/009 in-flight caller cancellation wins", async () => {
  let calls = 0;
  const controller = new AbortController();
  const transport = new FetchTransport(
    config(
      async (_url, init) =>
        await new Promise((_resolve, reject) => {
          calls += 1;
          init.signal.addEventListener(
            "abort",
            () => reject(new DOMException("synthetic", "AbortError")),
            { once: true },
          );
        }),
    ),
  );
  const pending = transport.execute("me.get", { signal: controller.signal });
  controller.abort();
  await assert.rejects(
    pending,
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(calls, 1);
});

test("PRD-039 emits exact safe order and isolates failing hooks", async () => {
  const events = [];
  const trace = [];
  let calls = 0;
  const { runtime } = deterministicRuntime([0]);
  const diagnostics = {
    emit(event) {
      events.push(event);
      if (event.name === "attempt.start") {
        return Promise.reject(new Error("ignored"));
      }
    },
  };
  const tracing = {
    startSpan(name, attributes) {
      trace.push(["startSpan", name, attributes]);
      return {
        addEvent(eventName, eventAttributes) {
          trace.push(["addEvent", eventName, eventAttributes]);
        },
        end(attributes) {
          trace.push(["end", attributes]);
        },
      };
    },
  };
  const transport = new FetchTransport(
    config(
      async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("synthetic");
        return jsonResponse(meFixture());
      },
      { diagnostics, tracing },
    ),
    runtime,
  );
  await transport.execute("me.get");
  assert.deepEqual(events.map((event) => event.name), [
    "operation.start",
    "attempt.start",
    "retry.scheduled",
    "attempt.start",
    "operation.end",
  ]);
  assert.equal(events.every(Object.isFrozen), true);
  assert.equal(events.every((event) => event.request_id === `runa_req_${"0".repeat(32)}`), true);
  assert.equal(events.some((event) => "url" in event || "headers" in event || "body" in event), false);
  assert.deepEqual(trace.map((entry) => entry[0]), [
    "startSpan",
    "addEvent",
    "addEvent",
    "addEvent",
    "addEvent",
    "addEvent",
    "end",
  ]);
});

test("PRD-008 deadline remains authoritative while streaming a response", async () => {
  let fireDeadline;
  let dispatches = 0;
  const runtime = {
    now: () => 0,
    timer(callback) {
      fireDeadline = callback;
      return { cancel() {} };
    },
    sleep: async () => {},
    randomUint32: () => 0,
    requestId: () => `runa_req_${"0".repeat(32)}`,
  };
  const transport = new FetchTransport(
    config(async (_url, init) => {
      dispatches += 1;
      const body = new ReadableStream({
        start(controller) {
          init.signal.addEventListener(
            "abort",
            () => controller.error(new DOMException("synthetic", "AbortError")),
            { once: true },
          );
        },
        pull() {
          fireDeadline();
        },
      });
      return new Response(body, {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }),
    runtime,
  );
  await assert.rejects(
    transport.execute("sessions.create", { body: { name: "worker" } }),
    (error) => error instanceof DOMException && error.name === "TimeoutError",
  );
  assert.equal(dispatches, 1);
});

test("PRD-008 timeout cancels a response body that hangs after headers", async () => {
  let fireDeadline;
  let bodyCancelled = 0;
  let reads = 0;
  const runtime = {
    now: () => 0,
    timer(callback) {
      fireDeadline = callback;
      return { cancel() {} };
    },
    sleep: async () => {},
    randomUint32: () => 0,
    requestId: () => `runa_req_${"0".repeat(32)}`,
  };
  const transport = new FetchTransport(
    config(async () => ({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: {
        getReader() {
          return {
            read() {
              reads += 1;
              fireDeadline();
              return new Promise(() => {});
            },
            async cancel() {
              bodyCancelled += 1;
            },
            releaseLock() {},
          };
        },
      },
    })),
    runtime,
  );
  await assert.rejects(
    transport.execute("me.get"),
    (error) => error instanceof DOMException && error.name === "TimeoutError",
  );
  assert.equal(reads, 1);
  assert.equal(bodyCancelled, 1);
});

test("PRD-008 caller abort cancels a hung post-headers body without late decode", async () => {
  const caller = new AbortController();
  let bodyCancelled = 0;
  let decodeReached = 0;
  let resolveLateRead;
  const transport = new FetchTransport(
    config(async () => ({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: {
        getReader() {
          return {
            read() {
              caller.abort();
              return new Promise((resolve) => {
                resolveLateRead = resolve;
              });
            },
            async cancel() {
              bodyCancelled += 1;
            },
            releaseLock() {},
          };
        },
      },
    })),
  );
  await assert.rejects(
    transport.execute("me.get", { signal: caller.signal }),
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
  resolveLateRead({
    done: false,
    value: new TextEncoder().encode(JSON.stringify(meFixture())),
  });
  await Promise.resolve();
  assert.equal(bodyCancelled, 1);
  assert.equal(decodeReached, 0);
});
