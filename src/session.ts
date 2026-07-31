import { ApiError } from "./errors.js";
import { assertUuid } from "./domain.js";
import type { ClientPort } from "./internal/client-port.js";
import type {
  Acknowledgement,
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
    body.command = command;
  } else if (Array.isArray(command)) {
    if (
      command.length === 0 ||
      command.some((value) => typeof value !== "string")
    ) {
      throw new TypeError("Invalid session command.");
    }
    body.command = command[0];
    if (command.length > 1) body.args = command.slice(1);
  } else {
    throw new TypeError("Invalid session command.");
  }
  if (options !== undefined) {
    if (options === null || typeof options !== "object") {
      throw new TypeError("Invalid session exec options.");
    }
    const unsafe = options as ExecOptions &
      globalThis.Record<string, unknown>;
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

  private static construct(
    owner: ClientPort,
    initialSnapshot: SessionSnapshot,
  ): Session {
    return new Session(owner, initialSnapshot, SESSION_CAPABILITY);
  }

  get id(): SessionSnapshot["id"] {
    return this.#snapshot.id;
  }

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

  refresh(): Promise<this> {
    return this.#replace("sessions.get");
  }

  start(): Promise<this> {
    return this.#replace("sessions.start");
  }

  pause(): Promise<this> {
    return this.#replace("sessions.pause");
  }

  resume(): Promise<this> {
    return this.#replace("sessions.resume");
  }

  stop(): Promise<this> {
    return this.#replace("sessions.stop");
  }

  async delete(): Promise<Acknowledgement> {
    const id = this.#snapshot.id;
    assertUuid(id);
    return (await this.#owner.invoke("sessions.delete", {
      id,
    })) as Acknowledgement;
  }

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

  async checkpoint(name: string): Promise<Acknowledgement> {
    const id = this.#snapshot.id;
    assertUuid(id);
    return (await this.#owner.invoke("sessions.checkpoint", {
      id,
      body: Object.freeze({ name }),
    })) as Acknowledgement;
  }

  async open(): Promise<OpenSessionResult> {
    const id = this.#snapshot.id;
    assertUuid(id);
    return (await this.#owner.invoke("sessions.open", {
      id,
    })) as OpenSessionResult;
  }
}

export const constructSession: (
  owner: ClientPort,
  initialSnapshot: SessionSnapshot,
) => Session = (
  owner: ClientPort,
  initialSnapshot: SessionSnapshot,
): Session => {
  const factory = Session as unknown as {
    construct(owner: ClientPort, snapshot: SessionSnapshot): Session;
  };
  return factory.construct(owner, initialSnapshot);
};
