// @generated {"contractDigest":"be686d0e1246365d7fde6aa2a9b7ff027ea18e74801ed00340d634ef8921f433","generator":"runa-sdk-ts-contract-v1","projectionVersion":"1.0.0"}
export type GeneratedOperationKey =
  | "me.get"
  | "records.list"
  | "sessions.checkpoint"
  | "sessions.create"
  | "sessions.delete"
  | "sessions.exec"
  | "sessions.get"
  | "sessions.list"
  | "sessions.open"
  | "sessions.pause"
  | "sessions.resume"
  | "sessions.start"
  | "sessions.stop";

export interface GeneratedOperation {
  readonly operationKey: GeneratedOperationKey;
  readonly method: "GET" | "POST" | "DELETE";
  readonly pathTemplate: string;
  readonly pathParameters: readonly string[];
  readonly hasRequestBody: boolean;
  readonly successStatus: 200 | 201;
  readonly responseKind:
    | "acknowledgement"
    | "exec"
    | "me"
    | "open"
    | "records"
    | "session"
    | "sessions";
}

export const GENERATED_OPERATIONS: Readonly<
  globalThis.Record<GeneratedOperationKey, GeneratedOperation>
> = Object.freeze({
  "me.get": Object.freeze({
    operationKey: "me.get",
    method: "GET",
    pathTemplate: "/v1/me",
    pathParameters: Object.freeze([]),
    hasRequestBody: false,
    successStatus: 200,
    responseKind: "me",
  }),
  "records.list": Object.freeze({
    operationKey: "records.list",
    method: "GET",
    pathTemplate: "/v1/records",
    pathParameters: Object.freeze([]),
    hasRequestBody: false,
    successStatus: 200,
    responseKind: "records",
  }),
  "sessions.checkpoint": Object.freeze({
    operationKey: "sessions.checkpoint",
    method: "POST",
    pathTemplate: "/v1/sessions/{id}/checkpoint",
    pathParameters: Object.freeze(["id"]),
    hasRequestBody: true,
    successStatus: 200,
    responseKind: "acknowledgement",
  }),
  "sessions.create": Object.freeze({
    operationKey: "sessions.create",
    method: "POST",
    pathTemplate: "/v1/sessions",
    pathParameters: Object.freeze([]),
    hasRequestBody: true,
    successStatus: 201,
    responseKind: "session",
  }),
  "sessions.delete": Object.freeze({
    operationKey: "sessions.delete",
    method: "DELETE",
    pathTemplate: "/v1/sessions/{id}",
    pathParameters: Object.freeze(["id"]),
    hasRequestBody: false,
    successStatus: 200,
    responseKind: "acknowledgement",
  }),
  "sessions.exec": Object.freeze({
    operationKey: "sessions.exec",
    method: "POST",
    pathTemplate: "/v1/sessions/{id}/exec",
    pathParameters: Object.freeze(["id"]),
    hasRequestBody: true,
    successStatus: 200,
    responseKind: "exec",
  }),
  "sessions.get": Object.freeze({
    operationKey: "sessions.get",
    method: "GET",
    pathTemplate: "/v1/sessions/{id}",
    pathParameters: Object.freeze(["id"]),
    hasRequestBody: false,
    successStatus: 200,
    responseKind: "session",
  }),
  "sessions.list": Object.freeze({
    operationKey: "sessions.list",
    method: "GET",
    pathTemplate: "/v1/sessions",
    pathParameters: Object.freeze([]),
    hasRequestBody: false,
    successStatus: 200,
    responseKind: "sessions",
  }),
  "sessions.open": Object.freeze({
    operationKey: "sessions.open",
    method: "POST",
    pathTemplate: "/v1/sessions/{id}/open",
    pathParameters: Object.freeze(["id"]),
    hasRequestBody: false,
    successStatus: 200,
    responseKind: "open",
  }),
  "sessions.pause": Object.freeze({
    operationKey: "sessions.pause",
    method: "POST",
    pathTemplate: "/v1/sessions/{id}/pause",
    pathParameters: Object.freeze(["id"]),
    hasRequestBody: false,
    successStatus: 200,
    responseKind: "session",
  }),
  "sessions.resume": Object.freeze({
    operationKey: "sessions.resume",
    method: "POST",
    pathTemplate: "/v1/sessions/{id}/resume",
    pathParameters: Object.freeze(["id"]),
    hasRequestBody: false,
    successStatus: 200,
    responseKind: "session",
  }),
  "sessions.start": Object.freeze({
    operationKey: "sessions.start",
    method: "POST",
    pathTemplate: "/v1/sessions/{id}/start",
    pathParameters: Object.freeze(["id"]),
    hasRequestBody: false,
    successStatus: 200,
    responseKind: "session",
  }),
  "sessions.stop": Object.freeze({
    operationKey: "sessions.stop",
    method: "POST",
    pathTemplate: "/v1/sessions/{id}/stop",
    pathParameters: Object.freeze(["id"]),
    hasRequestBody: false,
    successStatus: 200,
    responseKind: "session",
  }),
});
