import type { EffectiveConfig } from "../config.js";
import type { OperationKey } from "./contract/index.js";
import type { DispatchInput, DispatchResult } from "./transport.js";

export interface ClientTransport {
  execute(
    operationKey: OperationKey,
    input?: DispatchInput,
  ): Promise<DispatchResult>;
  close(): void;
}

export interface ResourceSnapshot {
  readonly connectionEstablishments: number;
  readonly openConnections: number;
  readonly poolEntries: number;
  readonly timers: number;
  readonly callbackRegistrations: number;
  readonly lifecycleRegistrations: number;
}

export type PrivateTransportFactory = (
  config: EffectiveConfig,
) => ClientTransport;

let privateFactory: PrivateTransportFactory | undefined;

export function installPrivateTransportFactory(
  factory: PrivateTransportFactory,
): () => void {
  if (privateFactory !== undefined) {
    throw new TypeError("A private transport factory is already installed.");
  }
  privateFactory = factory;
  return () => {
    if (privateFactory === factory) privateFactory = undefined;
  };
}

export function takePrivateTransportFactory(): PrivateTransportFactory | undefined {
  return privateFactory;
}

export function zeroResourceSnapshot(): ResourceSnapshot {
  return Object.freeze({
    connectionEstablishments: 0,
    openConnections: 0,
    poolEntries: 0,
    timers: 0,
    callbackRegistrations: 0,
    lifecycleRegistrations: 0,
  });
}
