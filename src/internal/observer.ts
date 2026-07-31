import { ApiError, RunaError } from "../errors.js";
import type {
  DiagnosticEvent,
  DiagnosticSink,
  NormalizedErrorCode,
  TraceSink,
  TraceSpan,
} from "../types.js";
import type { OperationDescriptor } from "./contract/index.js";
import { SDK_VERSION } from "../version.js";

function suppress(value: unknown): void {
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  ) {
    void Promise.resolve(value).catch(() => undefined);
  }
}

function safeCall(call: () => unknown): void {
  try {
    suppress(call());
  } catch {
    // Hooks are isolated from SDK behavior.
  }
}

function freezeEvent<T extends DiagnosticEvent>(event: T): T {
  return Object.freeze(event);
}

export class OperationObserver {
  readonly #descriptor: OperationDescriptor;
  readonly #diagnostics: DiagnosticSink | undefined;
  readonly #tracing: TraceSink | undefined;
  readonly #requestId: string;
  readonly #startedAt: number;
  readonly #now: () => number;
  #span: TraceSpan | undefined;

  constructor(
    descriptor: OperationDescriptor,
    diagnostics: DiagnosticSink | undefined,
    tracing: TraceSink | undefined,
    runtime: {
      readonly now: () => number;
      readonly requestId: () => string;
    },
  ) {
    this.#descriptor = descriptor;
    this.#diagnostics = diagnostics;
    this.#tracing = tracing;
    this.#requestId = runtime.requestId();
    this.#now = runtime.now;
    this.#startedAt = this.#now();
  }

  get requestId(): string {
    return this.#requestId;
  }

  #base() {
    return {
      request_id: this.#requestId,
      operation_key: this.#descriptor.operationKey,
      method: this.#descriptor.method,
      relative_path_template: this.#descriptor.pathTemplate,
      sdk_language: "typescript" as const,
      sdk_version: SDK_VERSION,
    };
  }

  start(): void {
    const event = freezeEvent({
      ...this.#base(),
      name: "operation.start",
      severity: "DEBUG",
    });
    if (this.#diagnostics !== undefined) {
      safeCall(() => this.#diagnostics?.emit(event));
    }
    if (this.#tracing !== undefined) {
      try {
        this.#span = this.#tracing.startSpan(
          "runa.sdk.operation",
          Object.freeze({ ...this.#base() }),
        );
      } catch {
        this.#span = undefined;
      }
      const { name, ...attributes } = event;
      if (this.#span !== undefined) {
        safeCall(() =>
          this.#span?.addEvent(name, Object.freeze({ ...attributes })),
        );
      }
    }
  }

  attempt(attempt: number): void {
    const event = freezeEvent({
      ...this.#base(),
      name: "attempt.start",
      severity: "DEBUG",
      attempt,
    });
    if (this.#diagnostics !== undefined) {
      safeCall(() => this.#diagnostics?.emit(event));
    }
    const { name, ...attributes } = event;
    if (this.#span !== undefined) {
      safeCall(() =>
        this.#span?.addEvent(name, Object.freeze({ ...attributes })),
      );
    }
  }

  retry(attempt: number, delayMs: number): void {
    const event = freezeEvent({
      ...this.#base(),
      name: "retry.scheduled",
      severity: "WARN",
      attempt,
      delay_ms: delayMs,
    });
    if (this.#diagnostics !== undefined) {
      safeCall(() => this.#diagnostics?.emit(event));
    }
    const { name, ...attributes } = event;
    if (this.#span !== undefined) {
      safeCall(() =>
        this.#span?.addEvent(name, Object.freeze({ ...attributes })),
      );
    }
  }

  end(attempt: number, error?: unknown): void {
    const elapsed_ms = Math.max(0, Math.floor(this.#now() - this.#startedAt));
    let outcome: "success" | "error" | "cancelled" = "success";
    let severity: "INFO" | "WARN" | "ERROR" = "INFO";
    let error_code: NormalizedErrorCode | undefined;
    let http_status: number | undefined;
    if (error !== undefined) {
      if (
        error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        outcome = "cancelled";
        severity = "WARN";
      } else {
        outcome = "error";
        severity = "ERROR";
        if (error instanceof RunaError) error_code = error.code;
        if (error instanceof ApiError) http_status = error.status;
      }
    }
    const event = freezeEvent({
      ...this.#base(),
      name: "operation.end",
      severity,
      attempt,
      elapsed_ms,
      outcome,
      ...(error_code === undefined ? {} : { error_code }),
      ...(http_status === undefined ? {} : { http_status }),
    });
    if (this.#diagnostics !== undefined) {
      safeCall(() => this.#diagnostics?.emit(event));
    }
    const { name, ...attributes } = event;
    if (this.#span !== undefined) {
      safeCall(() =>
        this.#span?.addEvent(name, Object.freeze({ ...attributes })),
      );
      const { severity: _severity, ...endAttributes } = attributes;
      safeCall(() => this.#span?.end(Object.freeze({ ...endAttributes })));
    }
  }
}
