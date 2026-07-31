import {
  GENERATED_OPERATIONS,
  type GeneratedOperation,
  type GeneratedOperationKey,
} from "./generated/operations.js";

export type OperationKey = GeneratedOperationKey;
export type OperationDescriptor = GeneratedOperation;

export function operationDescriptor(
  operationKey: OperationKey,
): OperationDescriptor {
  return GENERATED_OPERATIONS[operationKey];
}

export function operationKeys(): readonly OperationKey[] {
  return Object.freeze(Object.keys(GENERATED_OPERATIONS) as OperationKey[]);
}
