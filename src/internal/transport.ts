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

export interface CancelableTimer {
  cancel(): void;
}

export interface TransportRuntime {
  now(): number;
  timer(callback: () => void, delayMs: number): CancelableTimer;
  sleep(delayMs: number, signal?: AbortSignal): Promise<void>;
  randomUint32(): number;
  requestId(): string;
}

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
  if (template.includes(":id")) {
    if (id === undefined) throw new TypeError("Invalid session ID.");
    return template.replace(":id", id);
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

async function readLimited(
  response: Response,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let rejectAbort: ((reason: DOMException) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort?.(cancellationFailure());
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) throw cancellationFailure();
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      if (value !== undefined) {
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          cancelReader(reader);
          throw new ApiError(response.status, "malformed_response");
        }
        chunks.push(value);
      }
    }
  } catch (error) {
    if (signal.aborted) {
      cancelReader(reader);
      throw cancellationFailure();
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(response.status, "malformed_response");
  } finally {
    signal.removeEventListener("abort", onAbort);
    rejectAbort = undefined;
    try {
      reader.releaseLock();
    } catch {
      // A pending hostile reader operation must not delay the caller deadline.
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try {
    void reader.cancel().catch(() => undefined);
  } catch {
    // Body cancellation is best-effort and never outranks the public outcome.
  }
}

function cancelResponseBody(response: Response): void {
  if (response.body === null) return;
  try {
    void response.body.cancel().catch(() => undefined);
  } catch {
    // An uncooperative body must not keep a failed request pending.
  }
}

function cancellationFailure(): DOMException {
  return new DOMException("The Runa request was cancelled.", "AbortError");
}

function signalAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

async function disposition(
  response: Response,
  operationKey: OperationKey,
  signal: AbortSignal,
) {
  const descriptor = operationDescriptor(operationKey);
  if (response.status >= 300 && response.status < 400) {
    cancelResponseBody(response);
    throw new ApiError(response.status, "malformed_response");
  }
  if (response.status !== descriptor.successStatus) {
    cancelResponseBody(response);
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
    cancelResponseBody(response);
    throw new ApiError(response.status, "malformed_response");
  }
  const bytes = await readLimited(response, signal);
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

function uniformDelay(cap: number, randomUint32: () => number): number {
  const limit = cap + 1;
  const largest = Math.floor(0x1_0000_0000 / limit) * limit;
  for (;;) {
    const raw = randomUint32();
    if (raw < largest) return raw % limit;
  }
}

function productionSleep(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
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

const PRODUCTION_RUNTIME: TransportRuntime = Object.freeze({
  now: () => performance.now(),
  timer: (callback: () => void, delayMs: number): CancelableTimer => {
    const handle = setTimeout(callback, delayMs);
    return Object.freeze({ cancel: () => clearTimeout(handle) });
  },
  sleep: productionSleep,
  randomUint32: () => randomBytes(4).readUInt32BE(0),
  requestId: () => `runa_req_${randomBytes(16).toString("hex")}`,
});

export class FetchTransport {
  readonly #config: EffectiveConfig;
  readonly #runtime: TransportRuntime;
  readonly #fetch: typeof globalThis.fetch;

  constructor(
    config: EffectiveConfig,
    runtime: TransportRuntime = PRODUCTION_RUNTIME,
  ) {
    this.#config = config;
    this.#runtime = runtime;
    const selectedFetch = config.fetch ?? globalThis.fetch;
    if (typeof selectedFetch !== "function") throw new ConfigError();
    this.#fetch = selectedFetch;
  }

  async execute(
    operationKey: OperationKey,
    input: DispatchInput = {},
  ): Promise<DispatchResult> {
    const descriptor = operationDescriptor(operationKey);
    const prepared = prepare(this.#config, operationKey, input);
    const fetchImplementation = this.#fetch;
    const observer = new OperationObserver(
      descriptor,
      this.#config.diagnostics,
      this.#config.tracing,
      {
        now: () => this.#runtime.now(),
        requestId: () => this.#runtime.requestId(),
      },
    );
    observer.start();
    const startedAt = this.#runtime.now();
    const totalDeadline = READS.has(operationKey) ? 30_000 : deadlineFor(operationKey, input.timeoutSecs);
    const maximumAttempts = READS.has(operationKey) ? 3 : 1;
    const callerSignal = input.signal;
    let attempt = 0;
    try {
      while (attempt < maximumAttempts) {
        if (signalAborted(callerSignal)) throw cancellationFailure();
        attempt += 1;
        const elapsed = this.#runtime.now() - startedAt;
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
        const timer = this.#runtime.timer(
          () => controller.abort(),
          attemptDeadline,
        );
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
          timer.cancel();
          callerSignal?.removeEventListener("abort", onCallerAbort);
          if (signalAborted(callerSignal)) throw cancellationFailure();
          const canRetry =
            READS.has(operationKey) &&
            attempt < maximumAttempts &&
            this.#runtime.now() - startedAt < totalDeadline;
          if (!canRetry) {
            if (controller.signal.aborted) throw timeoutFailure();
            throw safeTransportFailure();
          }
          const delay = uniformDelay(
            Math.min(100 * 2 ** (attempt - 1), 1_000),
            () => this.#runtime.randomUint32(),
          );
          if (this.#runtime.now() - startedAt + delay >= totalDeadline) {
            throw timeoutFailure();
          }
          observer.retry(attempt + 1, delay);
          await this.#runtime.sleep(delay, callerSignal);
          continue;
        }
        try {
          if (signalAborted(callerSignal)) throw cancellationFailure();
          const result = await disposition(
            response,
            operationKey,
            controller.signal,
          );
          timer.cancel();
          callerSignal?.removeEventListener("abort", onCallerAbort);
          if (signalAborted(callerSignal)) throw cancellationFailure();
          observer.end(attempt);
          return result;
        } catch (error) {
          timer.cancel();
          callerSignal?.removeEventListener("abort", onCallerAbort);
          if (signalAborted(callerSignal)) throw cancellationFailure();
          if (controller.signal.aborted) throw timeoutFailure();
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
    // Fetch callables are runtime- or caller-owned; the SDK never closes them.
  }
}
