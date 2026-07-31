import { readFileSync, statSync } from "node:fs";
import { TextDecoder } from "node:util";

import { ConfigError } from "./errors.js";
import type {
  DiagnosticSink,
  RunaConfig,
  TraceSink,
} from "./types.js";
import { containsProhibitedMarker } from "./internal/boundary-policy.js";

export const DEFAULT_BASE_URL = "https://api.runacode.io";

interface ConfigFileShape {
  readonly api_key?: string;
  readonly base_url?: string;
}

export interface EffectiveConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly diagnostics?: DiagnosticSink;
  readonly tracing?: TraceSink;
  readonly apiKeySource: "constructor" | "environment" | "file";
  readonly baseUrlSource:
    | "constructor"
    | "environment"
    | "file"
    | "default";
}

function fail(): never {
  throw new ConfigError();
}

function readConfigFile(path: string): ConfigFileShape {
  if (path.length === 0) fail();
  try {
    if (!statSync(path).isFile()) fail();
    const bytes = readFileSync(path);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(text);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      fail();
    }
    const record = parsed as globalThis.Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.some((key) => key !== "api_key" && key !== "base_url")) {
      fail();
    }
    if ("api_key" in record && typeof record.api_key !== "string") fail();
    if ("base_url" in record && typeof record.base_url !== "string") fail();
    const result: ConfigFileShape = {};
    if (typeof record.api_key === "string") {
      Object.defineProperty(result, "api_key", {
        value: record.api_key,
        enumerable: true,
      });
    }
    if (typeof record.base_url === "string") {
      Object.defineProperty(result, "base_url", {
        value: record.base_url,
        enumerable: true,
      });
    }
    return Object.freeze(result);
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    fail();
  }
}

function validApiKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.startsWith("runa_sk_")
  );
}

function isProhibitedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return containsProhibitedMarker(host);
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string") fail();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail();
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.length === 0 ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    isProhibitedHost(parsed.hostname)
  ) {
    fail();
  }
  return parsed.origin;
}

function validateDiagnostics(value: unknown): DiagnosticSink | undefined {
  if (value === undefined) return undefined;
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as { emit?: unknown }).emit !== "function"
  ) {
    fail();
  }
  return value as DiagnosticSink;
}

function validateTracing(value: unknown): TraceSink | undefined {
  if (value === undefined) return undefined;
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as { startSpan?: unknown }).startSpan !== "function"
  ) {
    fail();
  }
  return value as TraceSink;
}

export function resolveConfig(config: RunaConfig = {}): EffectiveConfig {
  const unsafe = config as RunaConfig &
    globalThis.Record<string, unknown>;
  let file: ConfigFileShape = Object.freeze({});
  if (unsafe.configFile !== undefined && unsafe.configFile !== null) {
    if (
      typeof unsafe.configFile !== "string" ||
      unsafe.configFile.length === 0
    ) {
      fail();
    }
    file = readConfigFile(unsafe.configFile);
  }

  let apiKey: unknown;
  let apiKeySource: EffectiveConfig["apiKeySource"];
  if (unsafe.apiKey !== undefined) {
    apiKey = unsafe.apiKey;
    apiKeySource = "constructor";
  } else if (process.env.RUNA_API_KEY !== undefined) {
    apiKey = process.env.RUNA_API_KEY;
    apiKeySource = "environment";
  } else if (Object.hasOwn(file, "api_key")) {
    apiKey = file.api_key;
    apiKeySource = "file";
  } else {
    fail();
  }
  if (!validApiKey(apiKey)) fail();

  let rawBaseUrl: unknown;
  let baseUrlSource: EffectiveConfig["baseUrlSource"];
  if (unsafe.baseUrl !== undefined) {
    rawBaseUrl = unsafe.baseUrl;
    baseUrlSource = "constructor";
  } else if (process.env.RUNA_BASE_URL !== undefined) {
    rawBaseUrl = process.env.RUNA_BASE_URL;
    baseUrlSource = "environment";
  } else if (Object.hasOwn(file, "base_url")) {
    rawBaseUrl = file.base_url;
    baseUrlSource = "file";
  } else {
    rawBaseUrl = DEFAULT_BASE_URL;
    baseUrlSource = "default";
  }

  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  let selectedFetch: typeof globalThis.fetch | undefined;
  if (unsafe.fetch !== undefined) {
    if (typeof unsafe.fetch !== "function") fail();
    selectedFetch = unsafe.fetch;
  }
  const diagnostics = validateDiagnostics(unsafe.diagnostics);
  const tracing = validateTracing(unsafe.tracing);

  return Object.freeze({
    apiKey,
    baseUrl,
    ...(selectedFetch === undefined ? {} : { fetch: selectedFetch }),
    ...(diagnostics === undefined ? {} : { diagnostics }),
    ...(tracing === undefined ? {} : { tracing }),
    apiKeySource,
    baseUrlSource,
  });
}
