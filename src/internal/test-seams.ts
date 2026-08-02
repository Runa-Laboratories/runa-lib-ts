import { randomBytes } from "node:crypto";

import type { EffectiveConfig } from "../config.js";
import {
  FetchTransport,
  type DispatchInput,
  type DispatchResult,
} from "./transport.js";
import type { OperationKey } from "./contract/index.js";

export interface ClientTransport {
  execute(
    operationKey: OperationKey,
    input?: DispatchInput,
  ): Promise<DispatchResult>;
  close(): void;
}

export type PrivateTransportFactory = (
  config: EffectiveConfig,
) => ClientTransport;

export type DefaultResourceObserver = (
  kind: "defaultTransport",
  delta: 1 | -1,
) => void;

let privateFactory: PrivateTransportFactory | undefined;
let resourceObserver: DefaultResourceObserver | undefined;

export function nowMs(): number {
  return performance.now();
}

export function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new DOMException("The Runa request was cancelled.", "AbortError"));
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("The Runa request was cancelled.", "AbortError"));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function nextRandomInt(upperBoundInclusive: number): number {
  if (!Number.isSafeInteger(upperBoundInclusive) || upperBoundInclusive < 0) {
    throw new TypeError("The random bound is invalid.");
  }
  const limit = upperBoundInclusive + 1;
  const largest = Math.floor(0x1_0000_0000 / limit) * limit;
  for (;;) {
    const raw = randomBytes(4).readUInt32BE(0);
    if (raw < largest) return raw % limit;
  }
}

export function onDefaultResourceChange(
  kind: "defaultTransport",
  delta: 1 | -1,
): void {
  resourceObserver?.(kind, delta);
}

export function createDefaultTransport(config: EffectiveConfig): ClientTransport {
  const transport = privateFactory?.(config) ?? new FetchTransport(config);
  let closed = false;
  onDefaultResourceChange("defaultTransport", 1);
  return Object.freeze({
    execute: (operationKey: OperationKey, input?: DispatchInput) =>
      transport.execute(operationKey, input),
    close: () => {
      if (closed) return;
      closed = true;
      try {
        transport.close();
      } finally {
        onDefaultResourceChange("defaultTransport", -1);
      }
    },
  });
}

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

export function installPrivateResourceObserver(
  observer: DefaultResourceObserver,
): () => void {
  if (resourceObserver !== undefined) {
    throw new TypeError("A private resource observer is already installed.");
  }
  resourceObserver = observer;
  return () => {
    if (resourceObserver === observer) resourceObserver = undefined;
  };
}
