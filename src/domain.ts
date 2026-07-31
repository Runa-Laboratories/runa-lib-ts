import type {
  Acknowledgement,
  ExecResult,
  Me,
  OpenSessionResult,
  Record,
  SessionAgent,
  SessionSnapshot,
  SessionStatus,
} from "./types.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OPEN_URL =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.runacode\.cloud\/__runa\/auth\?t=[^&#]+$/;
const STATUSES = new Set<SessionStatus>([
  "creating",
  "running",
  "paused",
  "suspended",
  "stopped",
  "deleted",
  "error",
]);
const AGENTS = new Set<SessionAgent>([
  "claude-code",
  "codex",
  "openclaw",
]);

export class DecodeFailure {
  readonly kind = "decode_failure";
}

function malformed(): never {
  throw new DecodeFailure();
}

function object(value: unknown): globalThis.Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    malformed();
  }
  return value as globalThis.Record<string, unknown>;
}

function required(
  source: globalThis.Record<string, unknown>,
  key: string,
): unknown {
  if (!Object.hasOwn(source, key)) malformed();
  return source[key];
}

function optional(
  source: globalThis.Record<string, unknown>,
  key: string,
): unknown | undefined {
  return Object.hasOwn(source, key) ? source[key] : undefined;
}

export function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new TypeError("Invalid session ID.");
  }
}

export function decodeSession(value: unknown): SessionSnapshot {
  const source = object(value);
  const id = required(source, "id");
  const userId = required(source, "user_id");
  const slug = required(source, "slug");
  const name = required(source, "name");
  const vcpus = required(source, "vcpus");
  const memoryMiB = required(source, "memory_mib");
  const status = required(source, "status");
  const runningSeconds = required(source, "running_seconds");
  const createdAt = required(source, "created_at");
  const updatedAt = required(source, "updated_at");
  const url = required(source, "url");
  const agent = optional(source, "agent");
  if (
    typeof status !== "string" ||
    !STATUSES.has(status as SessionStatus) ||
    typeof url !== "string" ||
    (agent !== undefined &&
      (typeof agent !== "string" || !AGENTS.has(agent as SessionAgent)))
  ) {
    malformed();
  }
  return Object.freeze({
    id,
    userId,
    slug,
    name,
    ...(agent === undefined ? {} : { agent: agent as SessionAgent }),
    vcpus,
    memoryMiB,
    status: status as SessionStatus,
    runningSeconds,
    createdAt,
    updatedAt,
    url,
  });
}

export function decodeSessions(value: unknown): readonly SessionSnapshot[] {
  if (!Array.isArray(value)) malformed();
  return Object.freeze(value.map((item) => decodeSession(item)));
}

export function decodeExec(value: unknown): ExecResult {
  const source = object(value);
  return Object.freeze({
    exitCode: required(source, "exit_code"),
    stdout: required(source, "stdout"),
    stderr: required(source, "stderr"),
    durationMs: required(source, "duration_ms"),
    stdoutTruncated: required(source, "stdout_truncated"),
    stderrTruncated: required(source, "stderr_truncated"),
  });
}

export function decodeAcknowledgement(value: unknown): Acknowledgement {
  const source = object(value);
  if (required(source, "ok") !== true) malformed();
  return Object.freeze({ ok: true });
}

export function decodeOpen(value: unknown): OpenSessionResult {
  const source = object(value);
  const url = required(source, "url");
  if (typeof url !== "string" || !OPEN_URL.test(url)) malformed();
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== "" ||
      parsed.hash !== "" ||
      parsed.pathname !== "/__runa/auth" ||
      [...parsed.searchParams.keys()].length !== 1 ||
      parsed.searchParams.get("t") === null ||
      parsed.searchParams.get("t") === ""
    ) {
      malformed();
    }
  } catch (error) {
    if (error instanceof DecodeFailure) throw error;
    malformed();
  }
  return Object.freeze({ url });
}

export function decodeRecords(value: unknown): readonly Record[] {
  if (!Array.isArray(value)) malformed();
  return Object.freeze(
    value.map((item) => {
      const source = object(item);
      return Object.freeze({
        id: required(source, "id"),
        sessionId: required(source, "session_id"),
        kind: required(source, "kind"),
        summary: required(source, "summary"),
        detail: required(source, "detail"),
        createdAt: required(source, "created_at"),
      });
    }),
  );
}

export function decodeMe(value: unknown): Me {
  const source = object(value);
  const id = required(source, "id");
  const email = required(source, "email");
  const workspaceSource = object(required(source, "workspace"));
  const assigned = required(workspaceSource, "assigned");
  if (typeof assigned !== "boolean") malformed();
  if (Object.hasOwn(workspaceSource, "usage")) {
    const usageSource = object(required(workspaceSource, "usage"));
    return Object.freeze({
      id,
      email,
      workspace: Object.freeze({
        assigned,
        usage: Object.freeze({
          estimatedSpendUsd: required(usageSource, "est_spend_usd"),
          estimatedRemainingUsd: required(usageSource, "est_remaining_usd"),
          note: required(usageSource, "note"),
        }),
      }),
    });
  }
  if (assigned !== false) malformed();
  return Object.freeze({
      id,
      email,
      workspace: Object.freeze({
      assigned: false as const,
      waitlistPosition: required(workspaceSource, "waitlist_position"),
    }),
  });
}
