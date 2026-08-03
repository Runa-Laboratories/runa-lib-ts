import { GENERATED_OPERATIONS } from "./generated/operation-metadata.js";

export type OperationKey = keyof typeof GENERATED_OPERATIONS;
type CanonicalOperationDescriptor =
  (typeof GENERATED_OPERATIONS)[OperationKey];
type ResponseKind =
  | "acknowledgement"
  | "exec"
  | "me"
  | "open"
  | "records"
  | "session"
  | "sessions";

export type OperationDescriptor = CanonicalOperationDescriptor & {
  readonly responseKind: ResponseKind;
};

// The canonical contract owns transport metadata. This private bridge only
// selects the existing handwritten decoder for each canonical operation.
const RESPONSE_KINDS = Object.freeze({
  "me.get": "me",
  "records.list": "records",
  "sessions.checkpoint": "acknowledgement",
  "sessions.create": "session",
  "sessions.delete": "acknowledgement",
  "sessions.exec": "exec",
  "sessions.get": "session",
  "sessions.list": "sessions",
  "sessions.open": "open",
  "sessions.pause": "session",
  "sessions.resume": "session",
  "sessions.start": "session",
  "sessions.stop": "session",
} as const satisfies Readonly<Record<OperationKey, ResponseKind>>);

const OPERATIONS = Object.freeze(Object.fromEntries(
  Object.entries(GENERATED_OPERATIONS).map(([operationKey, descriptor]) => [
    operationKey,
    Object.freeze({
      ...descriptor,
      responseKind: RESPONSE_KINDS[operationKey as OperationKey],
    }),
  ]),
)) as Readonly<Record<OperationKey, OperationDescriptor>>;

export function operationDescriptor(
  operationKey: OperationKey,
): OperationDescriptor {
  return OPERATIONS[operationKey];
}

export function operationKeys(): readonly OperationKey[] {
  return Object.freeze(Object.keys(OPERATIONS) as OperationKey[]);
}
