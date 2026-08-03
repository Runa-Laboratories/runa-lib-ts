/**
 * Opaque record detail preserved without an SDK-defined shape.
 * @runa-contract opaquewirevalue-summary PRD-022#R-022-02
 */
export type OpaqueWireValue = unknown;

/**
 * Documented session status returned by the API.
 * @runa-contract sessionstatus-summary PRD-022#R-022-02
 */
export type SessionStatus =
  | "creating"
  | "running"
  | "paused"
  | "suspended"
  | "stopped"
  | "deleted"
  | "error";

/**
 * Accepted agent identifier for a session.
 * @runa-contract sessionagent-summary PRD-022#R-022-02
 */
export type SessionAgent = "claude-code" | "codex" | "openclaw";

/**
 * Public outbound network policy mode.
 * @runa-contract outboundpolicymode-summary PRD-028#R-028-01
 */
export type OutboundPolicyMode = "allowlist" | "denylist";

/**
 * Outbound network policy applied when the session is created.
 * Empty host arrays are explicit and retain the selected mode's semantics.
 * @runa-contract outboundpolicy-summary PRD-028#R-028-01
 */
export interface OutboundPolicy {
  /** Selected allow-list or deny-list policy mode. */
  readonly mode: OutboundPolicyMode;
  /** Ordered exact-domain or leading-wildcard rules for the selected mode. */
  readonly hosts: readonly string[];
}

/**
 * Immutable public observation of a session.
 * @runa-contract sessionsnapshot-summary PRD-022#R-022-02
 */
export interface SessionSnapshot {
  /** Canonical lowercase UUID returned for this session. */
  readonly id: string;
  /** Canonical identifier of the user that owns the session. */
  readonly userId: string;
  /** Validated runtime slug returned for the session. */
  readonly slug: string;
  /** Public session name returned by the API. */
  readonly name: string;
  /** Selected session agent when present. */
  readonly agent?: SessionAgent;
  /** Virtual CPU quantity returned by the API. */
  readonly vcpus: number;
  /** Memory quantity in mebibytes. */
  readonly memoryMiB: number;
  /** Documented session status returned by the API. */
  readonly status: SessionStatus;
  /** Non-negative running duration returned by the API. */
  readonly runningSeconds: number;
  /** RFC 3339 creation timestamp returned by the API. */
  readonly createdAt: string;
  /** RFC 3339 last-update timestamp returned by the API. */
  readonly updatedAt: string;
  /** Validated runtime URL returned for the session. */
  readonly url: string;
}

/**
 * Optional resources and network policy supplied during session creation.
 * @runa-contract sessioncreateoptions-summary PRD-028#R-028-01
 */
export interface SessionCreateOptions {
  /** Optional selected session agent. */
  readonly agent?: SessionAgent;
  /** Optional virtual CPU quantity. */
  readonly vcpus?: number;
  /** Optional memory quantity in mebibytes. */
  readonly memoryMiB?: number;
  /** Legacy ordered host allow list copied into the create request.
   * @deprecated Use `outboundPolicy` with mode `allowlist`.
   */
  readonly allowedHosts?: readonly string[];
  /** Optional allow-list or deny-list policy copied into the create request. */
  readonly outboundPolicy?: OutboundPolicy;
  /** Optional runtime port included in session creation. */
  readonly runtimePort?: number;
}

/**
 * Optional working directory and timeout for buffered execution.
 * @runa-contract execoptions-summary PRD-033#R-033-04
 */
export interface ExecOptions {
  /** Optional working directory passed to buffered execution. */
  readonly cwd?: string;
  /** Optional integer execution timeout in seconds. */
  readonly timeoutSecs?: number;
}

/**
 * Complete buffered command result returned after execution.
 * @runa-contract execresult-summary PRD-033#R-033-09
 */
export interface ExecResult {
  /** Integer process exit code returned after execution. */
  readonly exitCode: number;
  /** Complete buffered standard-output text. */
  readonly stdout: string;
  /** Complete buffered standard-error text. */
  readonly stderr: string;
  /** Non-negative command duration in milliseconds. */
  readonly durationMs: number;
  /** Whether the returned standard-output text was truncated. */
  readonly stdoutTruncated: boolean;
  /** Whether the returned standard-error text was truncated. */
  readonly stderrTruncated: boolean;
}

/**
 * Successful acknowledgement with literal true status.
 * @runa-contract acknowledgement-summary PRD-034#R-034-03
 */
export interface Acknowledgement {
  /** Literal true acknowledgement of successful completion. */
  readonly ok: true;
}

/**
 * Single-use session handoff result returned without automatic use.
 * @runa-contract opensessionresult-summary PRD-035#R-035-02
 */
export interface OpenSessionResult {
  /** Validated handoff URL returned only to the caller. */
  readonly url: string;
}

/**
 * Immutable record associated with a session.
 * @runa-contract record-summary PRD-037#R-037-01
 */
export interface Record {
  /** Canonical lowercase UUID returned for this record. */
  readonly id: string;
  /** Canonical identifier of the associated session. */
  readonly sessionId: string;
  /** Record kind returned by the API. */
  readonly kind: string;
  /** Safe record summary returned by the API. */
  readonly summary: string;
  /** Opaque record detail preserved without an SDK-defined shape. */
  readonly detail: OpaqueWireValue;
  /** RFC 3339 creation timestamp returned by the API. */
  readonly createdAt: string;
}

/**
 * Estimated spend, remaining amount, and explanatory note.
 * @runa-contract estimatedusage-summary PRD-036#R-036-01
 */
export interface EstimatedUsage {
  /** Estimated spend amount in US dollars. */
  readonly estimatedSpendUsd: number;
  /** Estimated remaining amount in US dollars. */
  readonly estimatedRemainingUsd: number;
  /** Explanatory estimated-usage note returned by the API. */
  readonly note: string;
}

/**
 * Assigned workspace state with estimated usage.
 * @runa-contract assignedworkspace-summary PRD-036#R-036-01
 */
export interface AssignedWorkspace {
  /** Literal discriminator for the assigned workspace variant. */
  readonly assigned: true;
  /** Estimated usage for this assigned workspace. */
  readonly usage: EstimatedUsage;
  /** Absent waitlist position in the assigned variant. */
  readonly waitlistPosition?: never;
}

/**
 * Unassigned workspace state with a waitlist position.
 * @runa-contract unassignedworkspace-summary PRD-036#R-036-01
 */
export interface UnassignedWorkspace {
  /** Literal discriminator for the unassigned workspace variant. */
  readonly assigned: false;
  /** Non-negative waitlist position for this workspace. */
  readonly waitlistPosition: number;
  /** Absent estimated usage in the unassigned variant. */
  readonly usage?: never;
}

/**
 * Assigned or unassigned workspace state.
 * @runa-contract workspace-summary PRD-036#R-036-01
 */
export type Workspace = AssignedWorkspace | UnassignedWorkspace;

/**
 * Caller profile and workspace assignment.
 * @runa-contract me-summary PRD-036#R-036-01
 */
export interface Me {
  /** Canonical identifier returned for the caller. */
  readonly id: string;
  /** Email address returned for the caller profile. */
  readonly email: string;
  /** Assigned or unassigned workspace state for the caller. */
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

/**
 * Configuration accepted while constructing a Runa client.
 * @runa-contract runaconfig-summary PRD-023#R-023-01
 */
export interface RunaConfig {
  /** Optional constructor API key selected before environment or explicit-file sources. */
  readonly apiKey?: string;
  /** Optional explicit Runa API origin; only https://api.runacode.io is accepted. */
  readonly baseUrl?: string;
  /** Optional explicit JSON configuration file, or null to disable file loading. */
  readonly configFile?: string | null;
  /** Optional caller-owned fetch-compatible transport function. */
  readonly fetch?: typeof globalThis.fetch;
  /** Optional caller-owned diagnostic sink. */
  readonly diagnostics?: DiagnosticSink;
  /** Optional caller-owned tracing sink. */
  readonly tracing?: TraceSink;
}
