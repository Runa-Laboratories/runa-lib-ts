export {
  installPrivateResourceObserver,
  installPrivateTransportFactory,
  type ClientTransport,
  type DefaultResourceObserver,
  type PrivateTransportFactory,
} from "./test-seams.js";

export interface ResourceSnapshot {
  readonly connectionEstablishments: number;
  readonly openConnections: number;
  readonly poolEntries: number;
  readonly timers: number;
  readonly callbackRegistrations: number;
  readonly lifecycleRegistrations: number;
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
