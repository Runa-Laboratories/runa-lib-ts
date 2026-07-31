export interface OwnedNodeAgent {
  destroy(): void;
}

export interface PrivateNodeTransportHarness {
  createAgent(): OwnedNodeAgent;
  dispatch(
    input: string,
    init: RequestInit,
    agent: OwnedNodeAgent,
  ): Promise<Response>;
}

let privateHarness: PrivateNodeTransportHarness | undefined;

export function installPrivateNodeTransportHarness(
  harness: PrivateNodeTransportHarness,
): () => void {
  if (privateHarness !== undefined) {
    throw new TypeError("A private node transport harness is already installed.");
  }
  privateHarness = harness;
  return () => {
    if (privateHarness === harness) privateHarness = undefined;
  };
}

export function takePrivateNodeTransportHarness(): PrivateNodeTransportHarness | undefined {
  return privateHarness;
}
