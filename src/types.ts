export type OpaqueWireValue = unknown;

export type SessionStatus =
  | "creating"
  | "running"
  | "paused"
  | "suspended"
  | "stopped"
  | "deleted"
  | "error";

export type SessionAgent = "claude-code" | "codex" | "openclaw";

export interface SessionSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly slug: string;
  readonly name: string;
  readonly agent?: SessionAgent;
  readonly vcpus: number;
  readonly memoryMiB: number;
  readonly status: SessionStatus;
  readonly runningSeconds: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly url: string;
}

export interface SessionCreateOptions {
  readonly agent?: SessionAgent;
  readonly vcpus?: number;
  readonly memoryMiB?: number;
  readonly allowedHosts?: readonly string[];
  readonly runtimePort?: number;
}

export interface ExecOptions {
  readonly cwd?: string;
  readonly timeoutSecs?: number;
}

export interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}

export interface Acknowledgement {
  readonly ok: true;
}

export interface OpenSessionResult {
  readonly url: string;
}

export interface Record {
  readonly id: string;
  readonly sessionId: string;
  readonly kind: string;
  readonly summary: string;
  readonly detail: OpaqueWireValue;
  readonly createdAt: string;
}

export interface EstimatedUsage {
  readonly estimatedSpendUsd: number;
  readonly estimatedRemainingUsd: number;
  readonly note: string;
}

export interface AssignedWorkspace {
  readonly assigned: boolean;
  readonly usage: EstimatedUsage;
  readonly waitlistPosition?: never;
}

export interface UnassignedWorkspace {
  readonly assigned: false;
  readonly waitlistPosition: number;
  readonly usage?: never;
}

export type Workspace = AssignedWorkspace | UnassignedWorkspace;

export interface Me {
  readonly id: string;
  readonly email: string;
  readonly workspace: Workspace;
}

export type OperationKey =
  | "me.get"
  | "records.list"
  | "sessions.checkpoint"
  | "sessions.create"
  | "sessions.delete"
  | "sessions.exec"
  | "sessions.get"
  | "sessions.list"
  | "sessions.open"
  | "sessions.pause"
  | "sessions.resume"
  | "sessions.start"
  | "sessions.stop";

export type NormalizedErrorCode =
  | "config_error"
  | "api_error"
  | "malformed_response"
  | "command_error";

interface EventBase {
  readonly request_id: string;
  readonly operation_key: OperationKey;
  readonly method: "GET" | "POST" | "DELETE";
  readonly relative_path_template: string;
  readonly sdk_language: "typescript";
  readonly sdk_version: string;
}

export type DiagnosticEvent =
  | (EventBase & { readonly name: "operation.start"; readonly severity: "DEBUG" })
  | (EventBase & {
      readonly name: "attempt.start";
      readonly severity: "DEBUG";
      readonly attempt: number;
    })
  | (EventBase & {
      readonly name: "retry.scheduled";
      readonly severity: "WARN";
      readonly attempt: number;
      readonly delay_ms: number;
    })
  | (EventBase & {
      readonly name: "operation.end";
      readonly severity: "INFO" | "WARN" | "ERROR";
      readonly attempt: number;
      readonly elapsed_ms: number;
      readonly outcome: "success" | "error" | "cancelled";
      readonly error_code?: NormalizedErrorCode;
      readonly http_status?: number;
    });

export type TraceStartAttributes = Omit<
  Extract<DiagnosticEvent, { readonly name: "operation.start" }>,
  "name" | "severity"
>;

export type TraceEndAttributes = Omit<
  Extract<DiagnosticEvent, { readonly name: "operation.end" }>,
  "name" | "severity"
>;

export interface DiagnosticSink {
  emit(event: DiagnosticEvent): void;
}

export interface TraceSpan {
  addEvent(
    name: "operation.start",
    attributes: Omit<
      Extract<DiagnosticEvent, { readonly name: "operation.start" }>,
      "name"
    >,
  ): void;
  addEvent(
    name: "attempt.start",
    attributes: Omit<
      Extract<DiagnosticEvent, { readonly name: "attempt.start" }>,
      "name"
    >,
  ): void;
  addEvent(
    name: "retry.scheduled",
    attributes: Omit<
      Extract<DiagnosticEvent, { readonly name: "retry.scheduled" }>,
      "name"
    >,
  ): void;
  addEvent(
    name: "operation.end",
    attributes: Omit<
      Extract<DiagnosticEvent, { readonly name: "operation.end" }>,
      "name"
    >,
  ): void;
  end(attributes: TraceEndAttributes): void;
}

export interface TraceSink {
  startSpan(
    name: "runa.sdk.operation",
    attributes: TraceStartAttributes,
  ): TraceSpan;
}

export interface RunaConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly configFile?: string | null;
  readonly fetch?: typeof globalThis.fetch;
  readonly diagnostics?: DiagnosticSink;
  readonly tracing?: TraceSink;
}
