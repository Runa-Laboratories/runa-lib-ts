import { resolveConfig, type EffectiveConfig } from "./config.js";
import { assertUuid } from "./domain.js";
import { ApiError } from "./errors.js";
import type { ClientPort } from "./internal/client-port.js";
import type { OperationKey } from "./internal/contract/index.js";
import {
  FetchTransport,
  type DispatchInput,
  type DispatchResult,
} from "./internal/transport.js";
import { Session, constructSession } from "./session.js";
import type {
  Me,
  OpaqueWireValue,
  Record,
  RunaConfig,
  SessionAgent,
  SessionCreateOptions,
  SessionSnapshot,
} from "./types.js";

export interface SessionsManager {
  create(
    name: OpaqueWireValue,
    options?: SessionCreateOptions,
  ): Promise<Session>;
  list(): Promise<readonly Session[]>;
  get(id: string): Promise<Session>;
}

export interface RecordsManager {
  list(): Promise<readonly Record[]>;
}

class ClientContext implements ClientPort {
  readonly #config: EffectiveConfig;
  #transport: FetchTransport | undefined;
  #state: "open" | "closing" | "closed" = "open";
  #active = 0;
  #closePromise: Promise<void> | undefined;
  #closeResolver: (() => void) | undefined;

  constructor(config: EffectiveConfig) {
    this.#config = config;
  }

  async invoke(
    operationKey: OperationKey,
    input: DispatchInput = {},
  ): Promise<DispatchResult> {
    if (this.#state !== "open") {
      throw new TypeError("The Runa client is closed.");
    }
    this.#active += 1;
    try {
      this.#transport ??= new FetchTransport(this.#config);
      return await this.#transport.execute(operationKey, input);
    } finally {
      this.#active -= 1;
      this.#finishClose();
    }
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#state = "closing";
    this.#closePromise = new Promise<void>((resolve) => {
      this.#closeResolver = resolve;
    });
    this.#finishClose();
    return this.#closePromise;
  }

  #finishClose(): void {
    if (
      this.#state !== "closing" ||
      this.#active !== 0 ||
      this.#closeResolver === undefined
    ) {
      return;
    }
    this.#transport?.close();
    this.#transport = undefined;
    this.#state = "closed";
    const resolve = this.#closeResolver;
    this.#closeResolver = undefined;
    resolve();
  }
}

function own(
  source: globalThis.Record<string, unknown>,
  key: string,
): boolean {
  return Object.hasOwn(source, key);
}

function createBody(
  name: OpaqueWireValue,
  options?: SessionCreateOptions,
): Readonly<globalThis.Record<string, unknown>> {
  if (name === undefined) {
    throw new TypeError("Invalid session create options.");
  }
  const body: globalThis.Record<string, unknown> = { name };
  if (options === undefined) return Object.freeze(body);
  if (options === null || typeof options !== "object") {
    throw new TypeError("Invalid session create options.");
  }
  const source = options as SessionCreateOptions &
    globalThis.Record<string, unknown>;
  if (own(source, "agent")) {
    const allowed = new Set<SessionAgent>([
      "claude-code",
      "codex",
      "openclaw",
    ]);
    if (
      typeof source.agent !== "string" ||
      !allowed.has(source.agent as SessionAgent)
    ) {
      throw new TypeError("Invalid session create options.");
    }
    body.agent = source.agent;
  }
  if (own(source, "vcpus") && source.vcpus !== undefined) {
    body.vcpus = source.vcpus;
  }
  if (own(source, "memoryMiB") && source.memoryMiB !== undefined) {
    body.memory_mib = source.memoryMiB;
  }
  if (own(source, "allowedHosts") && source.allowedHosts !== undefined) {
    body.allowed_hosts = source.allowedHosts;
  }
  if (own(source, "runtimePort") && source.runtimePort !== undefined) {
    body.runtime_port = source.runtimePort;
  }
  return Object.freeze(body);
}

class SessionsManagerImplementation implements SessionsManager {
  readonly #owner: ClientPort;

  constructor(owner: ClientPort) {
    this.#owner = owner;
  }

  async create(
    name: OpaqueWireValue,
    options?: SessionCreateOptions,
  ): Promise<Session> {
    const body = createBody(name, options);
    const snapshot = (await this.#owner.invoke("sessions.create", {
      body,
    })) as SessionSnapshot;
    return constructSession(this.#owner, snapshot);
  }

  async list(): Promise<readonly Session[]> {
    const snapshots = (await this.#owner.invoke(
      "sessions.list",
    )) as readonly SessionSnapshot[];
    return Object.freeze(
      snapshots.map((snapshot) => constructSession(this.#owner, snapshot)),
    );
  }

  async get(id: string): Promise<Session> {
    assertUuid(id);
    const snapshot = (await this.#owner.invoke("sessions.get", {
      id,
    })) as SessionSnapshot;
    if (snapshot.id !== id) {
      throw new ApiError(200, "malformed_response");
    }
    return constructSession(this.#owner, snapshot);
  }
}

class RecordsManagerImplementation implements RecordsManager {
  readonly #owner: ClientPort;

  constructor(owner: ClientPort) {
    this.#owner = owner;
  }

  async list(): Promise<readonly Record[]> {
    const records = (await this.#owner.invoke(
      "records.list",
    )) as readonly Record[];
    return Object.freeze([...records]);
  }
}

export class Runa {
  readonly #context: ClientContext;
  #sessions: SessionsManager | undefined;
  #records: RecordsManager | undefined;

  constructor(config?: RunaConfig) {
    this.#context = new ClientContext(resolveConfig(config));
  }

  get sessions(): SessionsManager {
    this.#sessions ??= new SessionsManagerImplementation(this.#context);
    return this.#sessions;
  }

  get records(): RecordsManager {
    this.#records ??= new RecordsManagerImplementation(this.#context);
    return this.#records;
  }

  async me(): Promise<Me> {
    return (await this.#context.invoke("me.get")) as Me;
  }

  close(): Promise<void> {
    return this.#context.close();
  }
}
