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
});

export function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) =>
      [key, canonicalJson(value[key])]));
  }
  return value;
}

export function exactSnapshotSchema(projection) {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.runacode.io/sdk/runa-sdk-contract.snapshot.schema.json",
    title: "Exact Runa SDK contract snapshot",
    const: projection,
  };
}

export function generateOperations(projection, canonicalDigest) {
  const keys = Object.keys(projection.operations).sort();
  if (keys.length !== 13 || keys.some((key) => RESPONSE_KINDS[key] === undefined)) {
    throw new Error("Unsupported SDK contract operation set.");
  }
  const keyUnion = keys.map((key) => `  | ${JSON.stringify(key)}`).join("\n");
  const entries = keys.map((key) => {
    const operation = projection.operations[key];
    const pathParameters = [...operation.path.matchAll(/\{([^}]+)\}/g)]
      .map((match) => match[1]);
    return `  ${JSON.stringify(key)}: Object.freeze({
    operationKey: ${JSON.stringify(key)},
    method: ${JSON.stringify(operation.method)},
    pathTemplate: ${JSON.stringify(operation.path)},
    pathParameters: Object.freeze(${JSON.stringify(pathParameters)}),
    hasRequestBody: ${operation.requestBody !== null},
    successStatus: ${operation.successStatus},
    responseKind: ${JSON.stringify(RESPONSE_KINDS[key])},
  }),`;
  }).join("\n");
  return `// @generated ${JSON.stringify({
    contractDigest: canonicalDigest,
    generator: "runa-sdk-ts-contract-v1",
    projectionVersion: projection.contractVersion,
  })}
export type GeneratedOperationKey =
${keyUnion};

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
${entries}
});
`;
}

export function validateContractProvenance(provenance, expected) {
  if (provenance?.schema_version !== 1 ||
      provenance.canonical_repository !== "Runa-Laboratories/runa-sdk-contract" ||
      provenance.canonical_contract_sha256 !== expected.canonical ||
      provenance.projection_sha256 !== expected.projection ||
      provenance.openapi_sha256 !== expected.openapi) return false;
  if (provenance.status === "BLOCKED") {
    return provenance.canonical_ref === null &&
      provenance.approval_sha === null &&
      typeof provenance.reason === "string" &&
      provenance.reason.length > 0;
  }
  if (provenance.status === "APPROVED") {
    return /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(provenance.canonical_ref) &&
      /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(provenance.approval_sha) &&
      typeof provenance.approver_identity === "string" &&
      /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+$/.test(provenance.approver_identity) &&
      typeof provenance.approved_at === "string" &&
      Number.isFinite(Date.parse(provenance.approved_at));
  }
  return false;
}
