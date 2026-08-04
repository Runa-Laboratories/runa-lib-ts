import { ApiError } from "./errors.js";
import { assertUuid } from "./domain.js";
import type { ClientPort } from "./internal/client-port.js";
import type {
  Acknowledgement,
  AgentAuthenticationStatus,
  ExecOptions,
  ExecResult,
  OpenSessionResult,
  SessionSnapshot,
} from "./types.js";

const SESSION_CAPABILITY = Symbol("runa.session.capability");

function malformed(): never {
  throw new ApiError(200, "malformed_response");
}

function own(
  source: globalThis.Record<string, unknown>,
  key: string,
): boolean {
  return Object.hasOwn(source, key);
}

function prepareExec(
  command: string | readonly string[],
  options?: ExecOptions,
): { readonly body: globalThis.Record<string, unknown>; readonly timeoutSecs?: number } {
  const body: globalThis.Record<string, unknown> = {};
  if (typeof command === "string") {
    if (command.length === 0) throw new TypeError("Invalid session command.");
    body.command = command;
  } else if (Array.isArray(command)) {
    if (
      command.length === 0 ||
      command.some((value) => typeof value !== "string")
    ) {
      throw new TypeError("Invalid session command.");
    }
    body.command = command[0];
    body.args = command.slice(1);
  } else {
    throw new TypeError("Invalid session command.");
  }
  if (options !== undefined) {
    if (options === null || typeof options !== "object") {
      throw new TypeError("Invalid session exec options.");
    }
    const unsafe = options as ExecOptions &
      globalThis.Record<string, unknown>;
    if (Object.keys(unsafe).some((key) => !["cwd", "timeoutSecs"].includes(key))) {
      throw new TypeError("Invalid session exec options.");
    }
    if (own(unsafe, "cwd") && unsafe.cwd !== undefined) {
      if (typeof unsafe.cwd !== "string") {
        throw new TypeError("Invalid session exec options.");
      }
      body.cwd = unsafe.cwd;
    }
    if (own(unsafe, "timeoutSecs") && unsafe.timeoutSecs !== undefined) {
      if (
        !Number.isInteger(unsafe.timeoutSecs) ||
        (unsafe.timeoutSecs as number) < 1 ||
        (unsafe.timeoutSecs as number) > 600
      ) {
        throw new TypeError("Invalid session exec options.");
      }
      body.timeout_secs = unsafe.timeoutSecs;
      return Object.freeze({
        body: Object.freeze(body),
        timeoutSecs: unsafe.timeoutSecs as number,
      });
    }
  }
  return Object.freeze({ body: Object.freeze(body) });
}

/**
 * Client-owned session handle with an immutable current snapshot and bounded operations.
 * @runa-contract session-summary PRD-031#R-031-01
 */
export class Session {
  readonly #owner: ClientPort;
  #snapshot: SessionSnapshot;

  private constructor(
    owner: ClientPort,
    initialSnapshot: SessionSnapshot,
    capability: symbol,
  ) {
    if (capability !== SESSION_CAPABILITY) {
      throw new TypeError("Session cannot be constructed directly.");
    }
    this.#owner = owner;
    this.#snapshot = initialSnapshot;
  }

  /** Canonical lowercase UUID of this session. */
  get id(): SessionSnapshot["id"] {
    return this.#snapshot.id;
  }

  /** Current immutable snapshot owned by this session handle. */
  get snapshot(): SessionSnapshot {
    return this.#snapshot;
  }

  async #replace(
    operation:
      | "sessions.get"
      | "sessions.pause"
      | "sessions.resume"
      | "sessions.start"
      | "sessions.stop",
  ): Promise<this> {
    const id = this.#snapshot.id;
    assertUuid(id);
    const result = await this.#owner.invoke(operation, { id });
    if (
      result === null ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      !Object.hasOwn(result, "id") ||
      (result as SessionSnapshot).id !== id
    ) {
      malformed();
    }
    this.#snapshot = result as SessionSnapshot;
    return this;
  }

  /**
   * Refreshes this handle from the canonical session item read.
   * @returns The same session handle after an atomic successful refresh.
   * @throws ApiError when the API rejects the operation or returns an invalid response.
   * @example docs/reference/examples/workflows.ts#session-refresh
   * @runa-contract session-refresh-description PRD-031#R-031-05
   * @runa-contract session-refresh-returns PRD-031#R-031-05
   * @runa-contract session-refresh-throws-api PRD-024#R-024-03
   * @runa-contract session-refresh-example PRD-031#R-031-05
   */
  refresh(): Promise<this> {
    return this.#replace("sessions.get");
  }

  /**
   * Starts the owning session.
   * @returns The same session handle after a successful start response.
   * @throws ApiError when the API rejects the operation or returns an invalid response.
   * @example docs/reference/examples/workflows.ts#session-start
   * @runa-contract session-start-description PRD-032#R-032-01
   * @runa-contract session-start-returns PRD-032#R-032-01
   * @runa-contract session-start-throws-api PRD-024#R-024-03
   * @runa-contract session-start-example PRD-032#R-032-01
   */
  start(): Promise<this> {
    return this.#replace("sessions.start");
  }

  /**
   * Pauses the owning session.
   * @returns The same session handle after a successful pause response.
   * @throws ApiError when the API rejects the operation or returns an invalid response.
   * @example docs/reference/examples/workflows.ts#session-pause
   * @runa-contract session-pause-description PRD-032#R-032-01
   * @runa-contract session-pause-returns PRD-032#R-032-01
   * @runa-contract session-pause-throws-api PRD-024#R-024-03
   * @runa-contract session-pause-example PRD-032#R-032-01
   */
  pause(): Promise<this> {
    return this.#replace("sessions.pause");
  }

  /**
   * Resumes the owning session.
   * @returns The same session handle after a successful resume response.
   * @throws ApiError when the API rejects the operation or returns an invalid response.
   * @example docs/reference/examples/workflows.ts#session-resume
   * @runa-contract session-resume-description PRD-032#R-032-01
   * @runa-contract session-resume-returns PRD-032#R-032-01
   * @runa-contract session-resume-throws-api PRD-024#R-024-03
   * @runa-contract session-resume-example PRD-032#R-032-01
   */
  resume(): Promise<this> {
    return this.#replace("sessions.resume");
  }

  /**
   * Stops the owning session.
   * @returns The same session handle after a successful stop response.
   * @throws ApiError when the API rejects the operation or returns an invalid response.
   * @example docs/reference/examples/workflows.ts#session-stop
   * @runa-contract session-stop-description PRD-032#R-032-01
   * @runa-contract session-stop-returns PRD-032#R-032-01
   * @runa-contract session-stop-throws-api PRD-024#R-024-03
   * @runa-contract session-stop-example PRD-032#R-032-01
   */
  stop(): Promise<this> {
    return this.#replace("sessions.stop");
  }

  /**
   * Deletes the owning session.
   * @returns An acknowledgement whose ok member is literal true.
   * @throws ApiError when the API rejects the operation or returns an invalid response.
   * @example docs/reference/examples/workflows.ts#session-delete
   * @runa-contract session-delete-description PRD-032#R-032-06
   * @runa-contract session-delete-returns PRD-032#R-032-06
   * @runa-contract session-delete-throws-api PRD-024#R-024-03
   * @runa-contract session-delete-example PRD-032#R-032-06
   */
  async delete(): Promise<Acknowledgement> {
    const id = this.#snapshot.id;
    assertUuid(id);
    return (await this.#owner.invoke("sessions.delete", {
      id,
    })) as Acknowledgement;
  }

  /**
   * Runs one buffered command through the owning session handle.
   * @param command Non-empty command string or non-empty ordered string argument vector.
   * @param options Optional working directory and integer timeout.
   * @returns The complete buffered execution result.
   * @throws ApiError when the API rejects the operation or returns an invalid response.
   * @example docs/reference/examples/workflows.ts#session-exec
   * @runa-contract session-exec-description PRD-033#R-033-01
   * @runa-contract session-exec-param-command PRD-033#R-033-01
   * @runa-contract session-exec-param-options PRD-033#R-033-04
   * @runa-contract session-exec-returns PRD-033#R-033-01
   * @runa-contract session-exec-throws-api PRD-024#R-024-03
   * @runa-contract session-exec-example PRD-033#R-033-01
   */
  async exec(
    command: string | readonly string[],
    options?: ExecOptions,
  ): Promise<ExecResult> {
    const prepared = prepareExec(command, options);
    const id = this.#snapshot.id;
    assertUuid(id);
    return (await this.#owner.invoke("sessions.exec", {
      id,
      body: prepared.body,
      ...(prepared.timeoutSecs === undefined
        ? {}
        : { timeoutSecs: prepared.timeoutSecs }),
    })) as ExecResult;
  }

  /**
   * Creates one named checkpoint through the owning session handle.
   * @param name Checkpoint name containing between one and eighty characters.
   * @returns An acknowledgement whose ok member is literal true.
   * @throws ApiError when the API rejects the operation or returns an invalid response.
   * @example docs/reference/examples/workflows.ts#session-checkpoint
   * @runa-contract session-checkpoint-description PRD-034#R-034-01
   * @runa-contract session-checkpoint-param-name PRD-034#R-034-01
   * @runa-contract session-checkpoint-returns PRD-034#R-034-01
   * @runa-contract session-checkpoint-throws-api PRD-024#R-024-03
   * @runa-contract session-checkpoint-example PRD-034#R-034-01
   */
  async checkpoint(name: string): Promise<Acknowledgement> {
    if (typeof name !== "string" || [...name].length < 1 || [...name].length > 80) {
      throw new TypeError("Invalid checkpoint name.");
    }
    const id = this.#snapshot.id;
    assertUuid(id);
    return (await this.#owner.invoke("sessions.checkpoint", {
      id,
      body: Object.freeze({ name }),
    })) as Acknowledgement;
  }

  /**
   * Acquires and returns a validated session handoff without using it automatically.
   * @returns A validated handoff result returned without automatic use.
   * @throws ApiError when the API rejects the operation or returns an invalid response.
   * @example docs/reference/examples/workflows.ts#session-open
   * @runa-contract session-open-description PRD-035#R-035-01
   * @runa-contract session-open-returns PRD-035#R-035-01
   * @runa-contract session-open-throws-api PRD-024#R-024-03
   * @runa-contract session-open-example PRD-035#R-035-01
   */
  async open(): Promise<OpenSessionResult> {
    const id = this.#snapshot.id;
    assertUuid(id);
    return (await this.#owner.invoke("sessions.open", {
      id,
    })) as OpenSessionResult;
  }

  /**
   * Reads the secret-free authentication status of this session's agent.
   * Use {@link open} to obtain the terminal handoff when interactive login is required.
   * @returns The strict agent authentication method and state.
   * @throws ApiError when the API rejects the operation or returns an invalid response.
   * @example docs/reference/examples/workflows.ts#session-authentication-status
   * @runa-contract session-authenticationstatus-description PRD-031#R-031-01
   * @runa-contract session-authenticationstatus-returns PRD-031#R-031-01
   * @runa-contract session-authenticationstatus-throws-api PRD-024#R-024-03
   * @runa-contract session-authenticationstatus-example PRD-031#R-031-01
   */
  async authenticationStatus(): Promise<AgentAuthenticationStatus> {
    const id = this.#snapshot.id;
    assertUuid(id);
    return (await this.#owner.invoke("sessions.agentAuth", {
      id,
    })) as AgentAuthenticationStatus;
  }
}

export const constructSession: (
  owner: ClientPort,
  initialSnapshot: SessionSnapshot,
) => Session = (
  owner: ClientPort,
  initialSnapshot: SessionSnapshot,
): Session => {
  return Reflect.construct(Session, [
    owner,
    initialSnapshot,
    SESSION_CAPABILITY,
  ]) as Session;
};
