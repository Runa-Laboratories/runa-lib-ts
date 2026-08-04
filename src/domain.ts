import type {
  Acknowledgement, AgentAuthenticationMethod, AgentAuthenticationState,
  AgentAuthenticationStatus, ExecResult, Me, OpenSessionResult, Record,
  SessionAgent, SessionSnapshot, SessionStatus
} from "./types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RUNTIME_URL = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.runacode\.cloud$/;
const OPEN_URL = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.runacode\.cloud\/__runa\/auth\?t=[^&#]+$/;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const STATUSES = new Set<SessionStatus>(["creating", "running", "paused", "suspended", "stopped", "deleted", "error"]);
const AGENTS = new Set<SessionAgent>(["claude-code", "codex", "openclaw"]);
const AUTHENTICATION_METHODS = new Set<AgentAuthenticationMethod>([
  "none", "interactive_login", "api_key",
]);
const AUTHENTICATION_STATES = new Set<AgentAuthenticationState>([
  "not_applicable", "installing", "login_required", "authenticated",
  "configured", "unavailable",
]);

export class DecodeFailure {
  readonly kind = "decode_failure";
}
function malformed(): never { throw new DecodeFailure(); }
function object(value: unknown): globalThis.Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) malformed();
  return value as globalThis.Record<string, unknown>;
}
function exact(source: globalThis.Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(source, key)) || Object.keys(source).some((key) => !allowed.has(key))) malformed();
}
function string(value: unknown): string {
  if (typeof value !== "string") malformed();
  return value;
}
function integer(value: unknown, minimum = Number.MIN_SAFE_INTEGER): number {
  if (!Number.isInteger(value) || (value as number) < minimum) malformed();
  return value as number;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) malformed();
  return value;
}
function uuid(value: unknown): string {
  const result = string(value);
  if (!UUID.test(result)) malformed();
  return result;
}
function dateTime(value: unknown): string {
  const result = string(value);
  const match = RFC3339.exec(result);
  if (match === null) malformed();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const days = month === 2
    ? ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28)
    : ([4, 6, 9, 11].includes(month) ? 30 : 31);
  if (month < 1 || month > 12 || day < 1 || day > days || hour > 23 ||
      minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59 ||
      Number.isNaN(Date.parse(result))) malformed();
  return result;
}
export function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError("Invalid session ID.");
}

export function decodeSession(value: unknown): SessionSnapshot {
  const source = object(value);
  exact(source, ["id", "user_id", "slug", "name", "vcpus", "memory_mib", "status", "running_seconds", "created_at", "updated_at", "url"], ["agent"]);
  const slug = string(source.slug);
  const status = string(source.status);
  const url = string(source.url);
  if (!SLUG.test(slug) || !STATUSES.has(status as SessionStatus) || !RUNTIME_URL.test(url)) malformed();
  let agent: SessionAgent | undefined;
  if (Object.hasOwn(source, "agent")) {
    if (typeof source.agent !== "string" || !AGENTS.has(source.agent as SessionAgent)) malformed();
    agent = source.agent as SessionAgent;
  }
  return Object.freeze({
    id: uuid(source.id), userId: uuid(source.user_id), slug, name: string(source.name),
    ...(agent === undefined ? {} : { agent }),
    vcpus: integer(source.vcpus, 0), memoryMiB: integer(source.memory_mib, 0),
    status: status as SessionStatus, runningSeconds: integer(source.running_seconds, 0),
    createdAt: dateTime(source.created_at), updatedAt: dateTime(source.updated_at), url
  });
}
export function decodeSessions(value: unknown): readonly SessionSnapshot[] {
  if (!Array.isArray(value)) malformed();
  return Object.freeze(value.map(decodeSession));
}
export function decodeExec(value: unknown): ExecResult {
  const source = object(value);
  exact(source, ["exit_code", "stdout", "stderr", "duration_ms", "stdout_truncated", "stderr_truncated"]);
  if (typeof source.stdout_truncated !== "boolean" || typeof source.stderr_truncated !== "boolean") malformed();
  return Object.freeze({
    exitCode: integer(source.exit_code), stdout: string(source.stdout), stderr: string(source.stderr),
    durationMs: integer(source.duration_ms, 0), stdoutTruncated: source.stdout_truncated,
    stderrTruncated: source.stderr_truncated
  });
}
export function decodeAcknowledgement(value: unknown): Acknowledgement {
  const source = object(value);
  exact(source, ["ok"]);
  if (source.ok !== true) malformed();
  return Object.freeze({ ok: true });
}
export function decodeOpen(value: unknown): OpenSessionResult {
  const source = object(value);
  exact(source, ["url"]);
  const url = string(source.url);
  if (!OPEN_URL.test(url)) malformed();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.port !== "" ||
        parsed.hash !== "" || parsed.pathname !== "/__runa/auth" || [...parsed.searchParams.keys()].length !== 1 ||
        parsed.searchParams.get("t") === null || parsed.searchParams.get("t") === "") malformed();
  } catch (error) {
    if (error instanceof DecodeFailure) throw error;
    malformed();
  }
  return Object.freeze({ url });
}
export function decodeAgentAuthenticationStatus(
  value: unknown,
): AgentAuthenticationStatus {
  const source = object(value);
  exact(source, ["agent", "method", "state"]);
  const method = string(source.method);
  const state = string(source.state);
  if (!AUTHENTICATION_METHODS.has(method as AgentAuthenticationMethod) ||
      !AUTHENTICATION_STATES.has(state as AgentAuthenticationState)) malformed();
  const validPair = method === "none"
    ? state === "not_applicable"
    : method === "interactive_login"
      ? ["installing", "login_required", "authenticated", "unavailable"].includes(state)
      : ["installing", "configured", "unavailable"].includes(state);
  if (!validPair) malformed();
  let agent: SessionAgent | null = null;
  if (source.agent !== null) {
    const candidate = string(source.agent);
    if (!AGENTS.has(candidate as SessionAgent)) malformed();
    agent = candidate as SessionAgent;
  }
  return Object.freeze({
    agent,
    method: method as AgentAuthenticationMethod,
    state: state as AgentAuthenticationState,
  });
}
export function decodeRecords(value: unknown): readonly Record[] {
  if (!Array.isArray(value)) malformed();
  return Object.freeze(value.map((item) => {
    const source = object(item);
    exact(source, ["id", "session_id", "kind", "summary", "detail", "created_at"]);
    return Object.freeze({
      id: uuid(source.id), sessionId: uuid(source.session_id), kind: string(source.kind),
      summary: string(source.summary), detail: source.detail, createdAt: dateTime(source.created_at)
    });
  }));
}
export function decodeMe(value: unknown): Me {
  const source = object(value);
  exact(source, ["id", "email", "workspace"]);
  const id = uuid(source.id);
  const email = string(source.email);
  const workspace = object(source.workspace);
  if (workspace.assigned === true) {
    exact(workspace, ["assigned", "usage"]);
    const usage = object(workspace.usage);
    if (["est_spend_usd", "est_remaining_usd", "note"].some((key) => !Object.hasOwn(usage, key))) malformed();
    return Object.freeze({
      id, email, workspace: Object.freeze({
        assigned: true as const,
        usage: Object.freeze({
          estimatedSpendUsd: number(usage.est_spend_usd),
          estimatedRemainingUsd: number(usage.est_remaining_usd),
          note: string(usage.note)
        })
      })
    });
  }
  if (workspace.assigned === false) {
    exact(workspace, ["assigned", "waitlist_position"]);
    return Object.freeze({
      id, email, workspace: Object.freeze({
        assigned: false as const,
        waitlistPosition: integer(workspace.waitlist_position, 0)
      })
    });
  }
  malformed();
}
