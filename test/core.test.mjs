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

import {
  API_KEY,
  SESSION_ID,
  USER_ID,
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
    process.env.RUNA_BASE_URL = "https://environment.example.invalid/";
    writeFileSync(
      file,
      JSON.stringify({
        api_key: [API_KEY, "file"].join("_"),
        base_url: "https://file.example.invalid/",
      }),
      "utf8",
    );
    const customFetch = async () => {
      throw new Error("not called");
    };
    const resolved = resolveConfig({
      apiKey: [API_KEY, "constructor"].join("_"),
      baseUrl: "https://constructor.example.invalid/",
      configFile: file,
      fetch: customFetch,
    });
    assert.equal(resolved.apiKeySource, "constructor");
    assert.equal(resolved.baseUrlSource, "constructor");
    assert.equal(resolved.baseUrl, "https://constructor.example.invalid");
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

test("PRD-001 and PRD-023 reject prohibited hosts including trailing dot", () => {
  const label = upstreamName();
  assert.equal(containsProhibitedMarker(label), true);
  assert.equal(containsProhibitedMarker(encodeURIComponent(label)), true);
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

test("PRD-022 preserves opaque scalars and detail identity", () => {
  const opaqueName = { preserved: true };
  const opaqueScalar = Symbol("opaque");
  const snapshot = decodeSession(
    sessionFixture({
      id: SESSION_ID,
      user_id: USER_ID,
      name: opaqueName,
      vcpus: opaqueScalar,
      memory_mib: null,
      running_seconds: "opaque",
      created_at: 7,
      updated_at: false,
    }),
  );
  assert.equal(snapshot.name, opaqueName);
  assert.equal(snapshot.vcpus, opaqueScalar);
  assert.equal(snapshot.memoryMiB, null);
  assert.equal(snapshot.createdAt, 7);

  const detail = { nested_key: ["value"] };
  const [record] = decodeRecords([recordFixture({ detail })]);
  assert.equal(record.detail, detail);

  const result = decodeExec({
    exit_code: opaqueScalar,
    stdout: opaqueName,
    stderr: null,
    duration_ms: "opaque",
    stdout_truncated: 1,
    stderr_truncated: 0,
  });
  assert.equal(result.exitCode, opaqueScalar);
  assert.equal(result.stdout, opaqueName);
  assert.equal(stdoutText(result), undefined);
  assert.equal(stderrText(result), undefined);

  const me = decodeMe({
    id: opaqueName,
    email: opaqueScalar,
    workspace: {
      assigned: true,
      usage: {
        est_spend_usd: opaqueName,
        est_remaining_usd: opaqueScalar,
        note: null,
      },
    },
  });
  assert.equal(me.id, opaqueName);
  assert.equal(me.workspace.usage.estimatedRemainingUsd, opaqueScalar);
});
