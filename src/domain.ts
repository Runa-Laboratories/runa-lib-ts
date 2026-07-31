import { ApiError } from "./errors.js";
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
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RUNTIME_URL =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.runacode\.cloud$/;
const OPEN_URL =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.runacode\.cloud\/__runa\/auth\?t=[^&#]+$/;
const ISO_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
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
const MARKERS = ["runta", "runta.com", "runta.dev", "runtime_id", "runtimeid"];

function malformed(status = 0): never {
  throw new ApiError(status, "malformed_response");
}

function record(value: unknown, status: number): globalThis.Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    malformed(status);
  }
  return value as globalThis.Record<string, unknown>;
}

function hasMarker(value: unknown): boolean {
  if (typeof value === "string") {
    let normalized = value;
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // Invalid percent encoding remains comparable as received.
    }
    const lower = normalized.toLowerCase();
    return MARKERS.some((marker) => lower.includes(marker));
  }
  if (Array.isArray(value)) return value.some(hasMarker);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(
      ([key, nested]) => hasMarker(key) || hasMarker(nested),
    );
  }
  return false;
}

function known(
  source: globalThis.Record<string, unknown>,
  key: string,
  status: number,
): unknown {
  if (!Object.hasOwn(source, key) || hasMarker(key) || hasMarker(source[key])) {
    malformed(status);
  }
  return source[key];
}

function optionalKnown(
  source: globalThis.Record<string, unknown>,
  key: string,
  status: number,
): unknown | undefined {
  if (!Object.hasOwn(source, key)) return undefined;
  if (hasMarker(key) || hasMarker(source[key])) malformed(status);
  return source[key];
}

export function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new TypeError("Invalid session ID.");
  }
}

export function decodeSession(value: unknown, status = 0): SessionSnapshot {
  const source = record(value, status);
  const id = known(source, "id", status);
  const userId = known(source, "user_id", status);
  const slug = known(source, "slug", status);
  const name = known(source, "name", status);
  const vcpus = known(source, "vcpus", status);
  const memoryMiB = known(source, "memory_mib", status);
  const sessionStatus = known(source, "status", status);
  const runningSeconds = known(source, "running_seconds", status);
  const createdAt = known(source, "created_at", status);
  const updatedAt = known(source, "updated_at", status);
  const url = known(source, "url", status);
  const agent = optionalKnown(source, "agent", status);
  if (
    typeof id !== "string" ||
    !UUID.test(id) ||
    typeof userId !== "string" ||
    !UUID.test(userId) ||
    typeof slug !== "string" ||
    !SLUG.test(slug) ||
    typeof name !== "string" ||
    !Number.isInteger(vcpus) ||
    (vcpus as number) < 0 ||
    !Number.isInteger(memoryMiB) ||
    (memoryMiB as number) < 0 ||
    typeof sessionStatus !== "string" ||
    !STATUSES.has(sessionStatus as SessionStatus) ||
    !Number.isInteger(runningSeconds) ||
    (runningSeconds as number) < 0 ||
    typeof createdAt !== "string" ||
    !ISO_UTC.test(createdAt) ||
    typeof updatedAt !== "string" ||
    !ISO_UTC.test(updatedAt) ||
    typeof url !== "string" ||
    !RUNTIME_URL.test(url) ||
    (agent !== undefined &&
      (typeof agent !== "string" || !AGENTS.has(agent as SessionAgent)))
  ) {
    malformed(status);
  }
  return Object.freeze({
    id,
    userId,
    slug,
    name,
    ...(agent === undefined ? {} : { agent: agent as SessionAgent }),
    vcpus,
    memoryMiB,
    status: sessionStatus as SessionStatus,
    runningSeconds,
    createdAt,
    updatedAt,
    url,
  });
}

export function decodeSessions(value: unknown, status = 0): readonly SessionSnapshot[] {
  if (!Array.isArray(value)) malformed(status);
  return Object.freeze(value.map((item) => decodeSession(item, status)));
}

export function decodeExec(value: unknown, status = 0): ExecResult {
  const source = record(value, status);
  const exitCode = known(source, "exit_code", status);
  const stdout = known(source, "stdout", status);
  const stderr = known(source, "stderr", status);
  const durationMs = known(source, "duration_ms", status);
  const stdoutTruncated = known(source, "stdout_truncated", status);
  const stderrTruncated = known(source, "stderr_truncated", status);
  if (
    !Number.isInteger(exitCode) ||
    typeof stdout !== "string" ||
    typeof stderr !== "string" ||
    !Number.isInteger(durationMs) ||
    (durationMs as number) < 0 ||
    typeof stdoutTruncated !== "boolean" ||
    typeof stderrTruncated !== "boolean"
  ) {
    malformed(status);
  }
  return Object.freeze({
    exitCode,
    stdout,
    stderr,
    durationMs,
    stdoutTruncated,
    stderrTruncated,
  });
}

export function decodeAcknowledgement(
  value: unknown,
  status = 0,
): Acknowledgement {
  const source = record(value, status);
  if (known(source, "ok", status) !== true) malformed(status);
  return Object.freeze({ ok: true });
}

export function decodeOpen(value: unknown, status = 0): OpenSessionResult {
  const source = record(value, status);
  const url = known(source, "url", status);
  if (typeof url !== "string" || !OPEN_URL.test(url)) malformed(status);
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
      malformed(status);
    }
  } catch {
    malformed(status);
  }
  return Object.freeze({ url });
}

export function decodeRecords(value: unknown, status = 0): readonly Record[] {
  if (!Array.isArray(value)) malformed(status);
  return Object.freeze(
    value.map((item) => {
      const source = record(item, status);
      const id = known(source, "id", status);
      const sessionId = known(source, "session_id", status);
      const kind = known(source, "kind", status);
      const summary = known(source, "summary", status);
      const detail = known(source, "detail", status);
      const createdAt = known(source, "created_at", status);
      if (
        typeof id !== "string" ||
        !UUID.test(id) ||
        typeof sessionId !== "string" ||
        !UUID.test(sessionId) ||
        typeof kind !== "string" ||
        typeof summary !== "string" ||
        typeof createdAt !== "string" ||
        !ISO_UTC.test(createdAt)
      ) {
        malformed(status);
      }
      return Object.freeze({
        id,
        sessionId,
        kind,
        summary,
        detail,
        createdAt,
      });
    }),
  );
}

export function decodeMe(value: unknown, status = 0): Me {
  const source = record(value, status);
  const id = known(source, "id", status);
  const email = known(source, "email", status);
  const workspaceValue = known(source, "workspace", status);
  if (
    typeof id !== "string" ||
    !UUID.test(id) ||
    typeof email !== "string"
  ) {
    malformed(status);
  }
  const workspaceSource = record(workspaceValue, status);
  const assigned = known(workspaceSource, "assigned", status);
  if (typeof assigned !== "boolean") malformed(status);
  if (Object.hasOwn(workspaceSource, "usage")) {
    const usageSource = record(known(workspaceSource, "usage", status), status);
    const estimatedSpendUsd = known(usageSource, "est_spend_usd", status);
    const estimatedRemainingUsd = known(
      usageSource,
      "est_remaining_usd",
      status,
    );
    const note = known(usageSource, "note", status);
    if (
      typeof estimatedSpendUsd !== "number" ||
      !Number.isFinite(estimatedSpendUsd) ||
      typeof estimatedRemainingUsd !== "number" ||
      !Number.isFinite(estimatedRemainingUsd) ||
      typeof note !== "string"
    ) {
      malformed(status);
    }
    return Object.freeze({
      id,
      email,
      workspace: Object.freeze({
        assigned,
        usage: Object.freeze({
          estimatedSpendUsd,
          estimatedRemainingUsd,
          note,
        }),
      }),
    });
  }
  const waitlistPosition = known(
    workspaceSource,
    "waitlist_position",
    status,
  );
  if (
    assigned !== false ||
    !Number.isInteger(waitlistPosition) ||
    (waitlistPosition as number) < 0
  ) {
    malformed(status);
  }
  return Object.freeze({
    id,
    email,
    workspace: Object.freeze({
      assigned: false,
      waitlistPosition,
    }),
  });
}
