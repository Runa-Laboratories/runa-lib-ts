import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";

export type DeniedNetworkMechanism =
  | "global.fetch"
  | "node:http.request"
  | "node:https.request"
  | "WebSocket";

const nativeFetch = globalThis.fetch;
const nativeHttpRequest = http.request;
const nativeHttpsRequest = https.request;
const nativeWebSocket = globalThis.WebSocket;
let denied: DeniedNetworkMechanism[] = [];

const reject = (mechanism: DeniedNetworkMechanism): never => {
  denied.push(mechanism);
  throw new TypeError("Real network access is disabled by the Runa test harness.");
};

export function installNetworkSentinel(): void {
  globalThis.fetch = (() => reject("global.fetch")) as typeof globalThis.fetch;
  http.request = (() => reject("node:http.request")) as typeof http.request;
  https.request = (() => reject("node:https.request")) as typeof https.request;
  syncBuiltinESMExports();
  if (nativeWebSocket !== undefined) {
    globalThis.WebSocket = class DeniedWebSocket {
      constructor() {
        reject("WebSocket");
      }
    } as unknown as typeof WebSocket;
  }
}

export function restoreNetworkPrimitives(): void {
  globalThis.fetch = nativeFetch;
  http.request = nativeHttpRequest;
  https.request = nativeHttpsRequest;
  syncBuiltinESMExports();
  if (nativeWebSocket === undefined) delete globalThis.WebSocket;
  else globalThis.WebSocket = nativeWebSocket;
}

export function takeDeniedNetworkAttempts(): readonly DeniedNetworkMechanism[] {
  const result = Object.freeze([...denied]);
  denied = [];
  return result;
}

export function deniedNetworkAttemptCount(): number {
  return denied.length;
}
