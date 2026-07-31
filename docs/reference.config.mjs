const pages = Object.freeze({
  "Core.md": ["Runa", "RunaConfig", "ConfigError", "ApiError", "CommandError", "RunaError"],
  "Sessions.md": ["Session", "SessionsManager", "SessionAgent", "SessionCreateOptions", "SessionSnapshot", "SessionStatus", "ExecOptions", "ExecResult", "Acknowledgement", "OpenSessionResult"],
  "Account-and-records.md": ["Me", "Workspace", "AssignedWorkspace", "UnassignedWorkspace", "EstimatedUsage", "RecordsManager", "Record"],
  "Shared.md": ["OpaqueWireValue", "stdoutText", "stderrText"],
});

const summaries = Object.freeze({
  Runa: "Constructible Runa client that owns managers, transport lifecycle, and cleanup.",
  RunaConfig: "Configuration accepted while constructing a Runa client.",
  ConfigError: "Safe public error raised when selected client configuration is invalid.",
  ApiError: "Safe public error for an API failure or malformed successful response.",
  CommandError: "Reserved non-constructible public command-error type.",
  RunaError: "Base class for normalized public Runa SDK errors.",
  Session: "Client-owned session handle with an immutable current snapshot and bounded operations.",
  SessionsManager: "Client-owned entry point for creating, listing, and retrieving sessions.",
  SessionAgent: "Accepted agent identifier for a session.",
  SessionCreateOptions: "Optional resources and network policy supplied during session creation.",
  SessionSnapshot: "Immutable public observation of a session.",
  SessionStatus: "Documented session status returned by the API.",
  ExecOptions: "Optional working directory and timeout for buffered execution.",
  ExecResult: "Complete buffered command result returned after execution.",
  Acknowledgement: "Successful acknowledgement with literal true status.",
  OpenSessionResult: "Single-use session handoff result returned to the caller without automatic use.",
  Me: "Caller profile and workspace assignment.",
  Workspace: "Assigned or unassigned workspace state.",
  AssignedWorkspace: "Assigned workspace state with estimated usage.",
  UnassignedWorkspace: "Unassigned workspace state with a waitlist position.",
  EstimatedUsage: "Estimated spend, remaining amount, and explanatory note.",
  RecordsManager: "Client-owned entry point for listing records.",
  Record: "Immutable record associated with a session.",
  OpaqueWireValue: "Opaque record detail preserved without an SDK-defined shape.",
  stdoutText: "Returns stdout only when the supplied wire value is a string.",
  stderrText: "Returns stderr only when the supplied wire value is a string.",
});

const entryContracts = Object.freeze({
  Runa: "PRD-023#R-023-01",
  RunaConfig: "PRD-023#R-023-01",
  ConfigError: "PRD-024#R-024-01",
  ApiError: "PRD-024#R-024-01",
  CommandError: "PRD-024#R-024-01",
  RunaError: "PRD-024#R-024-01",
  Session: "PRD-031#R-031-01",
  SessionsManager: "PRD-027#R-027-01",
  SessionAgent: "PRD-022#R-022-02",
  SessionCreateOptions: "PRD-028#R-028-01",
  SessionSnapshot: "PRD-022#R-022-02",
  SessionStatus: "PRD-022#R-022-02",
  ExecOptions: "PRD-033#R-033-04",
  ExecResult: "PRD-033#R-033-09",
  Acknowledgement: "PRD-034#R-034-03",
  OpenSessionResult: "PRD-035#R-035-02",
  Me: "PRD-036#R-036-01",
  Workspace: "PRD-036#R-036-01",
  AssignedWorkspace: "PRD-036#R-036-01",
  UnassignedWorkspace: "PRD-036#R-036-01",
  EstimatedUsage: "PRD-036#R-036-01",
  RecordsManager: "PRD-027#R-027-01",
  Record: "PRD-037#R-037-01",
  OpaqueWireValue: "PRD-022#R-022-02",
  stdoutText: "PRD-022#R-022-02",
  stderrText: "PRD-022#R-022-02",
});

const operationDefinitions = [
  ["Runa#constructor", "PRD-023#R-023-01", "runa-constructor", true],
  ["Runa#me", "PRD-036#R-036-01", "runa-me", true],
  ["Runa#close", "PRD-027#R-027-10", "runa-close", true],
  ["RecordsManager#list", "PRD-037#R-037-01", "records-list", true],
  ["SessionsManager#create", "PRD-028#R-028-01", "sessions-create", true],
  ["SessionsManager#list", "PRD-029#R-029-01", "sessions-list", true],
  ["SessionsManager#get", "PRD-030#R-030-01", "sessions-get", true],
  ["Session#refresh", "PRD-031#R-031-05", "session-refresh", true],
  ["Session#start", "PRD-032#R-032-01", "session-start", true],
  ["Session#pause", "PRD-032#R-032-01", "session-pause", true],
  ["Session#resume", "PRD-032#R-032-01", "session-resume", true],
  ["Session#stop", "PRD-032#R-032-01", "session-stop", true],
  ["Session#delete", "PRD-032#R-032-06", "session-delete", true],
  ["Session#exec", "PRD-033#R-033-01", "session-exec", true],
  ["Session#checkpoint", "PRD-034#R-034-01", "session-checkpoint", true],
  ["Session#open", "PRD-035#R-035-01", "session-open", true],
  ["stdoutText#stdoutText", "PRD-022#R-022-02", null, false],
  ["stderrText#stderrText", "PRD-022#R-022-02", null, false],
  ["ConfigError#constructor", "PRD-024#R-024-01", null, false],
  ["ApiError#constructor", "PRD-024#R-024-01", null, false],
];

export const curation = Object.freeze(Object.fromEntries(
  Object.entries(pages).flatMap(([page, names]) => names.map((name) => [
    name,
    Object.freeze({
      page,
      anchor: name.toLowerCase(),
      title: name,
      summary: summaries[name],
      contractRef: entryContracts[name],
    }),
  ])),
));

export const examples = Object.freeze(Object.fromEntries(
  operationDefinitions.filter((row) => row[2] !== null).map(([operationKey, contractRef, marker]) => [
    operationKey,
    Object.freeze({
      sourcePath: "docs/reference/examples/workflows.ts",
      marker,
      testId: `TC-048-EXAMPLE-${marker.toUpperCase().replaceAll("-", "_")}`,
      contractRefs: [contractRef],
    }),
  ]),
));

export const errorMatrix = Object.freeze(operationDefinitions.map(
  ([operationKey, contractRef]) => {
    if (operationKey === "Runa#constructor") {
      return Object.freeze({
        operationKey,
        disposition: "accepted",
        cases: [Object.freeze({
          errorType: "ConfigError",
          conditionClaimId: "runa-constructor-throws-config",
          contractRefs: ["PRD-023#R-023-06"],
        })],
      });
    }
    if (operationKey.includes("#constructor") ||
        operationKey.startsWith("stdoutText#") ||
        operationKey.startsWith("stderrText#") ||
        operationKey === "Runa#close") {
      return Object.freeze({
        operationKey,
        disposition: "none",
        cases: [],
        contractRefs: [contractRef],
      });
    }
    return Object.freeze({
      operationKey,
      disposition: "accepted",
      cases: [Object.freeze({
        errorType: "ApiError",
        conditionClaimId: `${operationKey.toLowerCase().replaceAll("#", "-")}-throws-api`,
        contractRefs: ["PRD-024#R-024-03"],
      })],
    });
  },
));

export const claimRegistry = Object.freeze([
  ...Object.entries(curation).map(([subjectKey, row]) => Object.freeze({
    claimId: `${subjectKey.toLowerCase()}-summary`,
    subjectKey,
    fragment: "summary",
    contractRefs: [row.contractRef],
  })),
  ...operationDefinitions.flatMap(([operationKey, contractRef]) => {
    const slug = operationKey.toLowerCase().replaceAll("#", "-");
    const claims = [
      Object.freeze({
        claimId: `${slug}-description`,
        subjectKey: operationKey,
        fragment: "description",
        contractRefs: [contractRef],
      }),
      Object.freeze({
        claimId: `${slug}-returns`,
        subjectKey: operationKey,
        fragment: "returns",
        contractRefs: [contractRef],
      }),
    ];
    const example = examples[operationKey];
    if (example !== undefined) claims.push(Object.freeze({
      claimId: `${slug}-example`,
      subjectKey: operationKey,
      fragment: "example",
      contractRefs: example.contractRefs,
    }));
    return claims;
  }),
  ...[
    ["Runa#constructor", "config", "PRD-023#R-023-01"],
    ["SessionsManager#create", "name", "PRD-028#R-028-01"],
    ["SessionsManager#create", "options", "PRD-028#R-028-01"],
    ["SessionsManager#get", "id", "PRD-030#R-030-01"],
    ["Session#exec", "command", "PRD-033#R-033-01"],
    ["Session#exec", "options", "PRD-033#R-033-04"],
    ["Session#checkpoint", "name", "PRD-034#R-034-01"],
    ["stdoutText#stdoutText", "result", "PRD-022#R-022-02"],
    ["stderrText#stderrText", "result", "PRD-022#R-022-02"],
    ["ApiError#constructor", "status", "PRD-024#R-024-03"],
    ["ApiError#constructor", "code", "PRD-024#R-024-03"],
  ].map(([subjectKey, parameter, contractRef]) => Object.freeze({
    claimId: `${subjectKey.toLowerCase().replaceAll("#", "-")}-param-${parameter}`,
    subjectKey,
    fragment: `param.${parameter}`,
    contractRefs: [contractRef],
  })),
  ...errorMatrix.flatMap((row) => row.cases.map((item) => Object.freeze({
    claimId: item.conditionClaimId,
    subjectKey: row.operationKey,
    fragment: `throws.${item.errorType}`,
    contractRefs: item.contractRefs,
  }))),
]);

export const conceptualPages = pages;
export const sourceTags = Object.freeze(claimRegistry.flatMap((row) =>
  row.contractRefs.map((contractRef) =>
    `@runa-contract ${row.claimId} ${contractRef}`)));
