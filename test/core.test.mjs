import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import {
  ApiError,
  CommandError,
  ConfigError,
  Runa,
  RunaError,
  Session,
  stderrText,
  stdoutText,
} from "../dist/index.js";
import { resolveConfig } from "../dist/config.js";
import {
  decodeExec,
  decodeMe,
  decodeRecords,
  decodeSession,
} from "../dist/domain.js";
import { containsProhibitedMarker } from "../dist/internal/boundary-policy.js";
import { sanitizeWire } from "../dist/internal/sanitize.js";

import {
  API_KEY,
  SESSION_ID,
  USER_ID,
  meFixture,
  recordFixture,
  sessionFixture,
  upstreamName,
} from "./helpers.mjs";

test("PRD-023 resolves terminal precedence and strict files", () => {
  const priorKey = process.env.RUNA_API_KEY;
  const priorUrl = process.env.RUNA_BASE_URL;
  const directory = mkdtempSync(join(tmpdir(), "runa-config-"));
  const file = join(directory, "config.json");
  try {
    process.env.RUNA_API_KEY = [API_KEY, "environment"].join("_");
    process.env.RUNA_BASE_URL = "https://api.runacode.io/";
    writeFileSync(
      file,
      JSON.stringify({
        api_key: [API_KEY, "file"].join("_"),
        base_url: "https://api.runacode.io",
      }),
      "utf8",
    );
    const customFetch = async () => {
      throw new Error("not called");
    };
    const resolved = resolveConfig({
      apiKey: [API_KEY, "constructor"].join("_"),
      baseUrl: "https://api.runacode.io/",
      configFile: file,
      fetch: customFetch,
    });
    assert.equal(resolved.apiKeySource, "constructor");
    assert.equal(resolved.baseUrlSource, "constructor");
    assert.equal(resolved.baseUrl, "https://api.runacode.io");
    assert.equal(resolved.fetch, customFetch);

    assert.throws(
      () => resolveConfig({ apiKey: "", configFile: file }),
      ConfigError,
    );
    writeFileSync(file, JSON.stringify({ unknown: true }), "utf8");
    assert.throws(
      () => resolveConfig({ apiKey: API_KEY, configFile: file }),
      ConfigError,
    );
  } finally {
    if (priorKey === undefined) delete process.env.RUNA_API_KEY;
    else process.env.RUNA_API_KEY = priorKey;
    if (priorUrl === undefined) delete process.env.RUNA_BASE_URL;
    else process.env.RUNA_BASE_URL = priorUrl;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("PRD-023 rejects non-object runtime configuration safely", () => {
  for (const value of [null, false, 1, "invalid", []]) {
    assert.throws(
      () => resolveConfig(value),
      (error) =>
        error instanceof ConfigError &&
        error.stack === `${error.name}: ${error.message}`,
    );
  }
});

test("PRD-001/023 reject prohibited hosts including trailing dot", () => {
  const label = upstreamName();
  assert.equal(containsProhibitedMarker(label), true);
  assert.equal(containsProhibitedMarker(encodeURIComponent(label)), true);
  const ordinaryEnglishWord = String.fromCharCode(
    114,
    101,
    103,
    114,
    101,
    115,
    115,
    105,
    111,
    110,
  );
  const publicNetworkTerm = String.fromCharCode(
    69,
    103,
    114,
    101,
    115,
    115,
    80,
    111,
    108,
    105,
    99,
    121,
  );
  assert.equal(containsProhibitedMarker(ordinaryEnglishWord), false);
  assert.equal(containsProhibitedMarker(publicNetworkTerm), false);
  assert.throws(
    () =>
      resolveConfig({
        apiKey: API_KEY,
        baseUrl: `https://${label}.com./`,
      }),
    ConfigError,
  );
  assert.throws(
    () =>
      resolveConfig({
        apiKey: API_KEY,
        baseUrl: `https://sub.${label}.dev./`,
      }),
    ConfigError,
  );
});

test("PRD-023 accepts only the canonical Runa API origin", () => {
  for (const baseUrl of [
    "https://example.invalid",
    "https://api.runacode.io.example.invalid",
    "https://api.runacode.io:443",
    "http://api.runacode.io",
    "https://api.runacode.io/v1",
  ]) {
    assert.throws(() => resolveConfig({ apiKey: API_KEY, baseUrl }), ConfigError);
  }
  assert.equal(resolveConfig({
    apiKey: API_KEY,
    baseUrl: "https://api.runacode.io/",
  }).baseUrl, "https://api.runacode.io");
});

test("PRD-024 exposes the closed error surface", () => {
  const config = new ConfigError();
  assert.equal(config.message, "Runa SDK configuration is invalid.");
  assert(config instanceof Error);
  assert(config instanceof RunaError);

  const api = new ApiError(409);
  assert.equal(api.code, "api_error");
  assert.equal(api.status, 409);
  assert.equal(api.message, "The Runa API request failed.");

  const malformed = new ApiError(200, "malformed_response");
  assert.equal(malformed.message, "The Runa API returned an invalid response.");
  assert.throws(() => new CommandError(), TypeError);
  assert.throws(() => new Session(), TypeError);
  assert.deepEqual(Reflect.ownKeys(Session), [
    "length",
    "name",
    "prototype",
  ]);
  for (const args of [[], [undefined], [{}], [Symbol("invalid")]]) {
    assert.throws(() => Reflect.construct(Session, args), TypeError);
  }
  assert.deepEqual(
    Object.keys({
      ApiError,
      CommandError,
      ConfigError,
      Runa,
      RunaError,
      Session,
      stderrText,
      stdoutText,
    }).sort(),
    [
      "ApiError",
      "CommandError",
      "ConfigError",
      "Runa",
      "RunaError",
      "Session",
      "stderrText",
      "stdoutText",
    ],
  );
});

test("PRD-022 enforces the canonical schema and preserves only detail identity", () => {
  const detail = { nested_key: ["value"] };
  const [record] = decodeRecords([recordFixture({ detail })]);
  assert.equal(record.detail, detail);
  const publicNetworkName = sessionFixture({ name: "e2e-egress-verification" });
  assert.equal(decodeSession(sanitizeWire(publicNetworkName)).name, publicNetworkName.name);
  for (const invalid of [
    sessionFixture({ id: SESSION_ID.toUpperCase() }),
    sessionFixture({ vcpus: -1 }),
    sessionFixture({ created_at: "not-a-date" }),
    sessionFixture({ unknown: true }),
  ]) {
    assert.throws(() => decodeSession(invalid));
  }
  assert.throws(() => decodeExec({
    exit_code: 0, stdout: "out", stderr: "err", duration_ms: -1,
    stdout_truncated: false, stderr_truncated: false,
  }));
  assert.throws(() => decodeMe({
    ...meFixture(),
    unknown: true,
  }));
  const extendedUsage = meFixture();
  extendedUsage.workspace.usage.safe_extension = { accepted: true };
  const decodedMe = decodeMe(extendedUsage);
  assert.equal(decodedMe.workspace.assigned, true);
  assert.equal("safe_extension" in decodedMe.workspace.usage, false);
  assert.throws(() => decodeMe({
    ...meFixture(),
    workspace: { ...meFixture().workspace, safe_extension: true },
  }));
});
