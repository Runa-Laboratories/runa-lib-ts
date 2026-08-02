import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { test } from "vitest";

import { takeDeniedNetworkAttempts } from "./harness/network-sentinel.js";

test("PRD-041 denies every unmocked public network mechanism", () => {
  assert.throws(() => globalThis.fetch("https://api.runacode.io"), TypeError);
  assert.throws(() => httpRequest("http://127.0.0.1"), TypeError);
  assert.throws(() => httpsRequest("https://api.runacode.io"), TypeError);
  if (globalThis.WebSocket !== undefined) {
    assert.throws(() => new WebSocket("wss://api.runacode.io"), TypeError);
  }
  const mechanisms = takeDeniedNetworkAttempts();
  assert.deepEqual(mechanisms, globalThis.WebSocket === undefined
    ? ["global.fetch", "node:http.request", "node:https.request"]
    : ["global.fetch", "node:http.request", "node:https.request", "WebSocket"]);
});
