import { randomBytes } from "node:crypto";
import { TextDecoder } from "node:util";

import type { EffectiveConfig } from "../config.js";
import {
  decodeAcknowledgement,
  decodeExec,
  decodeMe,
  decodeOpen,
  decodeRecords,
  decodeSession,
  decodeSessions,
  DecodeFailure,
} from "../domain.js";
import { ApiError, ConfigError } from "../errors.js";
import type {
  Acknowledgement,
  ExecResult,
  Me,
  OpenSessionResult,
  Record,
  SessionSnapshot,
} from "../types.js";
import {
  operationDescriptor,
  type OperationKey,
} from "./contract/index.js";
import { OperationObserver } from "./observer.js";
import { sanitizeWire } from "./sanitize.js";
import { SDK_VERSION } from "../version.js";

const MAX_RESPONSE_BYTES = 8_388_608;
const READS = new Set<OperationKey>([
  "me.get",
  "sessions.list",
  "sessions.get",
  "records.list",
]);

export interface DispatchInput {
  readonly id?: string;
  readonly body?: unknown;
  readonly timeoutSecs?: number;
  readonly signal?: AbortSignal;
}

export type DispatchResult =
  | Acknowledgement
  | ExecResult
  | Me
  | OpenSessionResult
  | readonly Record[]
  | SessionSnapshot
  | readonly SessionSnapshot[];

interface PreparedRequest {
  readonly url: string;
  readonly method: "GET" | "POST" | "DELETE";
  readonly headers: Readonly<globalThis.Record<string, string>>;
  readonly body?: string;
}

function safeTransportFailure(): TypeError {
  return new TypeError("The Runa request failed.");
}

function timeoutFailure(): DOMException {
  return new DOMException("The Runa request timed out.", "TimeoutError");
}

function renderPath(template: string, id?: string): string {
  if (template.includes("{id}")) {
    if (id === undefined) throw new TypeError("Invalid session ID.");
    return template.replace("{id}", id);
  }
  if (id !== undefined) throw new TypeError("Invalid session ID.");
  return template;
}

function prepare(
  config: EffectiveConfig,
  operationKey: OperationKey,
  input: DispatchInput,
): PreparedRequest {
  const descriptor = operationDescriptor(operationKey);
  const path = renderPath(descriptor.pathTemplate, input.id);
  const target = new URL(path, `${config.baseUrl}/`);
  if (target.origin !== config.baseUrl || target.href !== `${config.baseUrl}${path}`) {
    throw new ConfigError();
  }
  let body: string | undefined;
  if (descriptor.hasRequestBody) {
    try {
      body = JSON.stringify(input.body);
    } catch {
      throw new TypeError("The Runa request body is invalid.");
    }
    if (body === undefined) {
      throw new TypeError("The Runa request body is invalid.");
    }
  } else if (input.body !== undefined) {
    throw new TypeError("The Runa request body is invalid.");
  }
  return Object.freeze({
    url: target.href,
    method: descriptor.method,
    headers: Object.freeze({
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "User-Agent": `runa-sdk-typescript/${SDK_VERSION}`,
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json; charset=utf-8" }),
    }),
    ...(body === undefined ? {} : { body }),
  });
}

async function readLimited(response: Response): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) {
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new ApiError(response.status, "malformed_response");
        }
        chunks.push(value);
      }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(response.status, "malformed_response");
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function cancellationFailure(): DOMException {
  return new DOMException("The Runa request was cancelled.", "AbortError");
}

async function disposition(
  response: Response,
  operationKey: OperationKey,
  signal: AbortSignal,
) {
  const descriptor = operationDescriptor(operationKey);
  if (response.status >= 300 && response.status < 400) {
    throw new ApiError(response.status, "malformed_response");
  }
  if (response.status !== descriptor.successStatus) {
    if (response.status >= 200 && response.status < 300) {
      throw new ApiError(response.status, "malformed_response");
    }
    throw new ApiError(response.status, "api_error");
  }
  if (signal.aborted) throw cancellationFailure();
  const contentType = response.headers.get("content-type");
  if (
    contentType === null ||
    contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
  ) {
    throw new ApiError(response.status, "malformed_response");
  }
  const bytes = await readLimited(response);
  if (signal.aborted) throw cancellationFailure();
  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = sanitizeWire(JSON.parse(text));
  } catch {
    throw new ApiError(response.status, "malformed_response");
  }
  if (signal.aborted) throw cancellationFailure();
  try {
    switch (descriptor.responseKind) {
      case "acknowledgement":
        return decodeAcknowledgement(value);
      case "exec":
        return decodeExec(value);
      case "me":
        return decodeMe(value);
      case "open":
        return decodeOpen(value);
      case "records":
        return decodeRecords(value);
      case "session":
        return decodeSession(value);
      case "sessions":
        return decodeSessions(value);
    }
  } catch (error) {
    if (error instanceof DecodeFailure) {
      throw new ApiError(response.status, "malformed_response");
    }
    throw error;
  }
}

function deadlineFor(operationKey: OperationKey, timeoutSecs?: number): number {
  if (READS.has(operationKey)) return 10_000;
  if (operationKey === "sessions.create") return 90_000;
  if (operationKey === "sessions.exec") {
    return (timeoutSecs ?? 120) * 1_000 + 15_000;
  }
  return 60_000;
}

function uniformDelay(cap: number): number {
  const limit = cap + 1;
  const largest = Math.floor(0x1_0000_0000 / limit) * limit;
  for (;;) {
    const raw = randomBytes(4).readUInt32BE(0);
    if (raw < largest) return raw % limit;
  }
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(cancellationFailure());
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(cancellationFailure());
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class FetchTransport {
  readonly #config: EffectiveConfig;

  constructor(config: EffectiveConfig) {
    this.#config = config;
  }

  async execute(
    operationKey: OperationKey,
    input: DispatchInput = {},
  ): Promise<DispatchResult> {
    const descriptor = operationDescriptor(operationKey);
    const prepared = prepare(this.#config, operationKey, input);
    const fetchImplementation = this.#config.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function") throw new ConfigError();
    const observer = new OperationObserver(
      descriptor,
      this.#config.diagnostics,
      this.#config.tracing,
    );
    observer.start();
    const startedAt = performance.now();
    const totalDeadline = READS.has(operationKey) ? 30_000 : deadlineFor(operationKey, input.timeoutSecs);
    const maximumAttempts = READS.has(operationKey) ? 3 : 1;
    const callerSignal = input.signal;
    let attempt = 0;
    try {
      while (attempt < maximumAttempts) {
        if (callerSignal?.aborted === true) throw cancellationFailure();
        attempt += 1;
        const elapsed = performance.now() - startedAt;
        if (elapsed >= totalDeadline) throw timeoutFailure();
        const attemptDeadline = Math.min(
          deadlineFor(operationKey, input.timeoutSecs),
          totalDeadline - elapsed,
        );
        const controller = new AbortController();
        const onCallerAbort = () => controller.abort();
        callerSignal?.addEventListener("abort", onCallerAbort, {
          once: true,
        });
        const timer = setTimeout(() => controller.abort(), attemptDeadline);
        observer.attempt(attempt);
        let response: Response;
        try {
          response = await fetchImplementation(prepared.url, {
            method: prepared.method,
            headers: prepared.headers,
            ...(prepared.body === undefined ? {} : { body: prepared.body }),
            redirect: "manual",
            signal: controller.signal,
          });
        } catch {
          clearTimeout(timer);
          callerSignal?.removeEventListener("abort", onCallerAbort);
          if (callerSignal?.aborted === true) throw cancellationFailure();
          const canRetry =
            READS.has(operationKey) &&
            attempt < maximumAttempts &&
            performance.now() - startedAt < totalDeadline;
          if (!canRetry) {
            if (controller.signal.aborted) throw timeoutFailure();
            throw safeTransportFailure();
          }
          const delay = uniformDelay(Math.min(100 * 2 ** (attempt - 1), 1_000));
          if (performance.now() - startedAt + delay >= totalDeadline) {
            throw timeoutFailure();
          }
          observer.retry(attempt + 1, delay);
          await wait(delay, callerSignal);
          continue;
        }
        try {
          if (callerSignal?.aborted === true) throw cancellationFailure();
          const result = await disposition(
            response,
            operationKey,
            controller.signal,
          );
          clearTimeout(timer);
          callerSignal?.removeEventListener("abort", onCallerAbort);
          if (callerSignal?.aborted === true) throw cancellationFailure();
          observer.end(attempt);
          return result;
        } catch (error) {
          clearTimeout(timer);
          callerSignal?.removeEventListener("abort", onCallerAbort);
          if (callerSignal?.aborted === true) throw cancellationFailure();
          if (controller.signal.aborted && !(error instanceof ApiError)) {
            throw timeoutFailure();
          }
          throw error;
        }
      }
      throw timeoutFailure();
    } catch (error) {
      observer.end(attempt, error);
      throw error;
    }
  }

  close(): void {
    // Fetch and injected fetch resources are not owned by this SDK.
  }
}
