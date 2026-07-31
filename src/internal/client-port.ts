import type { DispatchInput, DispatchResult } from "./transport.js";
import type { OperationKey } from "./contract/index.js";

export interface ClientPort {
  invoke(
    operationKey: OperationKey,
    input?: DispatchInput,
  ): Promise<DispatchResult>;
}
