import { afterAll, afterEach, beforeEach, vi } from "vitest";

import { installPrivateResourceObserver } from "../../dist/internal/test-seams.js";
import {
  deniedNetworkAttemptCount,
  installNetworkSentinel,
  restoreNetworkPrimitives,
  takeDeniedNetworkAttempts,
} from "./network-sentinel.js";

let defaultResources = 0;
const releaseObserver = installPrivateResourceObserver((_kind, delta) => {
  defaultResources += delta;
});

beforeEach(() => {
  takeDeniedNetworkAttempts();
  installNetworkSentinel();
});

afterEach(() => {
  restoreNetworkPrimitives();
  if (vi.isFakeTimers()) {
    const timers = vi.getTimerCount();
    vi.useRealTimers();
    if (timers !== 0) throw new Error(`R-041-09: ${timers} fake timers remain.`);
  }
  if (defaultResources !== 0) {
    throw new Error(`R-041-09: ${defaultResources} default resources remain.`);
  }
  const attempts = deniedNetworkAttemptCount();
  if (attempts !== 0) {
    takeDeniedNetworkAttempts();
    throw new Error(`R-041-03: ${attempts} denied network attempts were not asserted.`);
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(() => {
  restoreNetworkPrimitives();
  releaseObserver();
});
