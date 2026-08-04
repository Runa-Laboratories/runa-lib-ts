import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadPrdCatalog } from "../prd-catalog.mjs";
import {
  claimRegistry,
  conceptualPages,
  curation,
  errorMatrix,
  examples,
} from "../../docs/reference.config.mjs";

const requiredPageOwnership = Object.freeze({
  "Core.md": Object.freeze(["Runa", "RunaConfig"]),
  "Sessions.md": Object.freeze(["Session", "SessionsManager", "SessionAgent", "AgentAuthenticationMethod", "AgentAuthenticationState", "AgentAuthenticationStatus", "OutboundPolicyMode", "OutboundPolicy", "SessionCreateOptions", "SessionSnapshot", "SessionStatus", "ExecOptions", "ExecResult", "Acknowledgement", "OpenSessionResult"]),
  "Account-and-records.md": Object.freeze(["Me", "Workspace", "AssignedWorkspace", "UnassignedWorkspace", "EstimatedUsage", "RecordsManager", "Record"]),
  "Shared.md": Object.freeze(["ConfigError", "ApiError", "CommandError", "RunaError", "OpaqueWireValue", "stdoutText", "stderrText"]),
});

const kindName = (node) => {
  if (node.kind === 128) return "class";
  if (node.kind === 256) return "interface";
  if (node.kind === 64) return "function";
  if (node.kind === 2097152) return "type";
  return "declaration";
};

const renderType = (type) => {
  if (type === undefined) return "unknown";
  switch (type.type) {
    case "intrinsic": return type.name;
    case "literal": return JSON.stringify(type.value);
    case "reference": {
      const args = type.typeArguments?.map(renderType) ?? [];
      return `${type.name}${args.length === 0 ? "" : `<${args.join(", ")}>`}`;
    }
    case "array": return `${renderType(type.elementType)}[]`;
    case "union": return type.types.map(renderType).join(" | ");
    case "intersection": return type.types.map(renderType).join(" & ");
    case "typeOperator": return `${type.operator} ${renderType(type.target)}`;
    case "tuple": return `[${type.elements.map(renderType).join(", ")}]`;
    case "optional": return `${renderType(type.elementType)} | undefined`;
    case "query": return `typeof ${renderType(type.queryType)}`;
    case "reflection": {
      const declaration = type.declaration;
      if (Array.isArray(declaration.signatures)) {
        return declaration.signatures.map((signature) =>
          `(${renderParameters(signature.parameters ?? [])}) => ${renderType(signature.type)}`).join(" | ");
      }
      return `{ ${declaration.children?.map((child) =>
        `${child.flags?.isReadonly ? "readonly " : ""}${child.name}${child.flags?.isOptional ? "?" : ""}: ${renderType(child.type)}`).join("; ") ?? ""} }`;
    }
    case "indexedAccess":
      return `${renderType(type.objectType)}[${renderType(type.indexType)}]`;
    case "typeParameter": return type.name;
    case "unknown": return "unknown";
    default: throw new Error(`R-048-03: unsupported reflected type ${type.type}`);
  }
};

const renderParameters = (parameters) => parameters.map((parameter) =>
  `${parameter.name}${parameter.flags?.isOptional ? "?" : ""}: ${renderType(parameter.type)}`).join(", ");

const signatureOf = (name, signature, constructor = false) =>
  `${constructor ? "constructor" : name}(${renderParameters(signature.parameters ?? [])}): ${renderType(signature.type)}`;

const publicChildren = (entry) => (entry.children ?? []).filter((child) =>
  child.flags?.isPrivate !== true &&
  child.flags?.isProtected !== true &&
  (child.sources ?? child.signatures?.[0]?.sources ?? child.getSignature?.sources ?? [])
    .some((source) => source.fileName.startsWith("dist/")));

const entrySignature = (entry) => {
  if (entry.kind === 128) return `class ${entry.name}`;
  if (entry.kind === 256) return `interface ${entry.name}`;
  if (entry.kind === 2097152) return `type ${entry.name} = ${renderType(entry.type)}`;
  if (entry.kind === 64) return (entry.signatures ?? []).map((signature) =>
    `function ${signatureOf(entry.name, signature)}`).join("\n");
  throw new Error(`R-048-03: unsupported public declaration ${entry.name}`);
};

const operationsFor = (entry) => {
  if (entry.kind === 64) {
    return (entry.signatures ?? []).map((signature) => ({
      operationKey: `${entry.name}#${entry.name}`,
      name: entry.name,
      signature: signatureOf(entry.name, signature),
      parameters: (signature.parameters ?? []).map((item) => item.name),
      returns: renderType(signature.type),
    }));
  }
  return publicChildren(entry).flatMap((child) => {
    const signatures = child.signatures ??
      (child.kind === 512 && child.signatures ? child.signatures : undefined);
    if (!Array.isArray(signatures)) return [];
    return signatures.map((signature) => ({
      operationKey: `${entry.name}#${child.name}`,
      name: child.name,
      signature: signatureOf(child.name, signature, child.name === "constructor"),
      parameters: (signature.parameters ?? []).map((item) => item.name),
      returns: renderType(signature.type),
    }));
  });
};

const membersFor = (entry) => publicChildren(entry).map((child) => {
  if (Array.isArray(child.signatures)) {
    return {
      name: child.name,
      kind: child.name === "constructor" ? "constructor" : "method",
      optional: false,
      readonly: false,
      signatures: child.signatures.map((signature) =>
        signatureOf(child.name, signature, child.name === "constructor")),
    };
  }
  const type = child.getSignature?.type ?? child.type;
  return {
    name: child.name,
    kind: child.getSignature === undefined ? "property" : "accessor",
    optional: child.flags?.isOptional === true,
    readonly: child.flags?.isReadonly === true || child.getSignature !== undefined,
    signatures: [`${child.name}${child.flags?.isOptional ? "?" : ""}: ${renderType(type)}`],
  };
});

const extractExample = (source, marker) => {
  const start = `// example:${marker}`;
  const end = "// end-example";
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error("R-048-09: missing example marker");
  const endIndex = source.indexOf(end, startIndex);
  if (endIndex < 0 || source.indexOf(start, startIndex + 1) >= 0) {
    throw new Error("R-048-09: ambiguous example marker");
  }
  return source.slice(startIndex + start.length, endIndex).trim();
};

const prdRequirementIds = new Set(
  (await loadPrdCatalog()).sources.flatMap((source) => source.requirements),
);

const validateContractReference = async (contractRef) => {
  const match = /^PRD-(\d{3})#(R-\d{3}-\d{2})$/.exec(contractRef);
  if (match === null) throw new Error("R-048-07: malformed contract reference");
  if (!prdRequirementIds.has(match[2])) {
    throw new Error("R-048-07: unknown contract reference");
  }
};

const parseSourceTags = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line !== "");
  for (const line of lines) {
    assert.match(line, /^@runa-contract [a-z0-9-]+ PRD-\d{3}#R-\d{3}-\d{2}$/);
  }
  assert.equal(new Set(lines).size, lines.length);
  return lines;
};

const commentText = (comment) => (comment?.summary ?? [])
  .map((item) => item.text ?? "")
  .join("")
  .trim();

const blockTags = (comment, tag) => (comment?.blockTags ?? [])
  .filter((item) => item.tag === tag);

const blockText = (tag) => (tag.content ?? [])
  .map((item) => item.text ?? "")
  .join("")
  .replace(/^```ts\s*|\s*```$/g, "")
  .trim();

const reflectedOperations = (roots) => roots.flatMap((entry) => {
  if (entry.kind === 64) {
    return (entry.signatures ?? []).map((signature) => ({
      operationKey: `${entry.name}#${entry.name}`,
      entry,
      signature,
    }));
  }
  return publicChildren(entry).flatMap((child) =>
    (child.signatures ?? []).map((signature) => ({
      operationKey: `${entry.name}#${child.name}`,
      entry,
      child,
      signature,
    })));
});

const validateReflectionDocumentation = (roots) => {
  const observedContractTags = [];
  for (const entry of roots) {
    const entryComment = entry.comment ?? entry.signatures?.[0]?.comment;
    assert(commentText(entryComment).length > 0, `R-048-04: missing summary:${entry.name}`);
    if (entry.kind !== 64) {
      for (const tag of blockTags(entryComment, "@runa-contract")) {
        observedContractTags.push(`@runa-contract ${blockText(tag)}`);
      }
    }
    for (const child of publicChildren(entry)) {
      if (Array.isArray(child.signatures)) {
        for (const signature of child.signatures) {
          assert(commentText(signature.comment).length > 0,
            `R-048-04: missing operation summary:${entry.name}#${child.name}`);
        }
      } else {
        const comment = child.getSignature?.comment ?? child.comment;
        assert(commentText(comment).length > 0,
          `R-048-04: missing member summary:${entry.name}.${child.name}`);
      }
    }
  }

  const reflected = reflectedOperations(roots);
  const expectedOperationKeys = errorMatrix.map((row) => row.operationKey).sort();
  assert.deepEqual(reflected
    .filter((item) => expectedOperationKeys.includes(item.operationKey))
    .map((item) => item.operationKey).sort(), expectedOperationKeys);
  for (const operation of reflected.filter((item) =>
    expectedOperationKeys.includes(item.operationKey))) {
    const { signature, operationKey } = operation;
    const matrix = errorMatrix.find((row) => row.operationKey === operationKey);
    const expectedParameters = (signature.parameters ?? []).map((item) => item.name).sort();
    const documentedParameters = (signature.parameters ?? [])
      .filter((item) => commentText(item.comment).length > 0)
      .map((item) => item.name).sort();
    assert.deepEqual(documentedParameters, expectedParameters,
      `R-048-05: parameter documentation mismatch:${operationKey}`);
    assert.equal(blockTags(signature.comment, "@returns").length, 1,
      `R-048-06: returns documentation mismatch:${operationKey}`);
    const throwsTags = blockTags(signature.comment, "@throws");
    assert.equal(throwsTags.length, matrix.disposition === "accepted" ? matrix.cases.length : 0,
      `R-048-06: throws documentation mismatch:${operationKey}`);
    for (const item of matrix.cases) {
      assert(throwsTags.some((tag) => blockText(tag).startsWith(`${item.errorType} `)),
        `R-048-06: wrong public error:${operationKey}`);
    }
    const expectedExample = examples[operationKey];
    const exampleTags = blockTags(signature.comment, "@example");
    assert.equal(exampleTags.length, expectedExample === undefined ? 0 : 1,
      `R-048-08: example documentation mismatch:${operationKey}`);
    if (expectedExample !== undefined) {
      assert.equal(blockText(exampleTags[0]),
        `${expectedExample.sourcePath}#${expectedExample.marker}`,
        `R-048-09: example source mismatch:${operationKey}`);
    }
    for (const tag of blockTags(signature.comment, "@runa-contract")) {
      observedContractTags.push(`@runa-contract ${blockText(tag)}`);
    }
  }
  const expectedTags = claimRegistry.flatMap((row) => row.contractRefs.map((contractRef) =>
    `@runa-contract ${row.claimId} ${contractRef}`)).sort();
  assert.deepEqual(observedContractTags.sort(), expectedTags,
    "R-048-07: reflection contract tags do not match the claim registry");
  return true;
};

const validateRegistries = async (operations, sourceTags) => {
  const claimIds = new Set();
  for (const row of claimRegistry) {
    assert.match(row.claimId, /^[a-z0-9-]+$/);
    assert.equal(claimIds.has(row.claimId), false);
    claimIds.add(row.claimId);
    assert.equal(typeof row.subjectKey, "string");
    assert.match(row.fragment, /^(summary|description|param\.[A-Za-z][A-Za-z0-9]*|returns|throws\.[A-Za-z][A-Za-z0-9]*|example|configuration|state|composition)$/);
    assert(row.contractRefs.length > 0);
    for (const contractRef of row.contractRefs) await validateContractReference(contractRef);
    for (const contractRef of row.contractRefs) {
      assert(sourceTags.includes(`@runa-contract ${row.claimId} ${contractRef}`));
    }
  }
  assert.equal(new Set(sourceTags).size, sourceTags.length);
  const expectedTags = claimRegistry.flatMap((row) => row.contractRefs.map((contractRef) =>
    `@runa-contract ${row.claimId} ${contractRef}`)).sort();
  assert.deepEqual([...sourceTags].sort(), expectedTags);
  const operationKeys = operations.map((item) => item.operationKey).sort();
  assert.deepEqual(errorMatrix.map((item) => item.operationKey).sort(), operationKeys);
  for (const operation of operations) {
    const rows = errorMatrix.filter((item) => item.operationKey === operation.operationKey);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert(["accepted", "none"].includes(row.disposition));
    if (row.disposition === "accepted") {
      assert(row.cases.length > 0);
      for (const item of row.cases) {
        assert(claimRegistry.some((claim) =>
          claim.claimId === item.conditionClaimId &&
          claim.subjectKey === operation.operationKey &&
          claim.fragment === `throws.${item.errorType}`));
      }
    } else {
      assert.equal(row.cases.length, 0);
      assert(row.contractRefs.length > 0);
    }
    assert(claimRegistry.some((claim) =>
      claim.subjectKey === operation.operationKey && claim.fragment === "description"));
    assert(claimRegistry.some((claim) =>
      claim.subjectKey === operation.operationKey && claim.fragment === "returns"));
    for (const parameter of operation.parameters) {
      assert(claimRegistry.some((claim) =>
        claim.subjectKey === operation.operationKey &&
        claim.fragment === `param.${parameter}`));
    }
  }
};

const safeCorpus = (files) => {
  const prohibited = [
    /runa_sk_[A-Za-z0-9_-]+/i,
    /Authorization\s*:/i,
    /\/__runa\/auth\?t=/i,
    /\b(private|protected)\s+(member|source|symbol)/i,
    /\b(streaming|file transfer|automatic browser)\b/i,
  ];
  for (const [file, content] of Object.entries(files)) {
    if (/[^\x09\x0a\x0d\x20-\x7e]/.test(content)) {
      throw new Error(`R-048-11: non-ascii-reference-prose:${file}`);
    }
    for (const pattern of prohibited) {
      if (pattern.test(content)) throw new Error(`R-048-11: unsafe-content:${file}`);
    }
    for (const match of content.matchAll(/https:\/\/[A-Za-z0-9._-]+/g)) {
      if (new URL(match[0]).hostname !== "api.runacode.io") {
        throw new Error(`R-048-11: non-runa-host:${file}`);
      }
    }
  }
};

const anchor = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const memberDescriptions = Object.freeze({
  agent: "Selected session agent, when the API returned or the caller supplied one.",
  allowedHosts: "Optional ordered host allowlist copied into the create request.",
  apiKey: "Optional constructor API key selected before environment or explicit-file sources.",
  assigned: "Literal discriminator for the workspace assignment variant.",
  authenticationStatus: "Reads the secret-free authentication status of this session's agent.",
  baseUrl: "Optional explicit canonical Runa API origin.",
  checkpoint: "Creates one named checkpoint through the owning session handle.",
  close: "Closes this client after already admitted work completes.",
  code: "Stable normalized public error code.",
  configFile: "Optional explicit JSON configuration file, or null to disable file loading.",
  constructor: "Constructs the documented public value.",
  create: "Creates one session and returns its client-owned handle.",
  createdAt: "RFC 3339 creation timestamp returned by the API.",
  cwd: "Optional working directory passed to buffered execution.",
  delete: "Deletes the owning session and returns an acknowledgement.",
  detail: "Opaque record detail preserved without an SDK-defined shape.",
  diagnostics: "Optional caller-owned diagnostic sink.",
  durationMs: "Non-negative command duration in milliseconds.",
  email: "Email address returned for the caller profile.",
  estimatedRemainingUsd: "Estimated remaining amount in US dollars.",
  estimatedSpendUsd: "Estimated spend amount in US dollars.",
  exec: "Runs one buffered command through the owning session handle.",
  exitCode: "Integer process exit code returned after execution.",
  fetch: "Optional caller-owned fetch-compatible transport function.",
  get: "Retrieves one session by canonical identifier.",
  id: "Canonical lowercase UUID returned for this public value.",
  kind: "Record kind returned by the API.",
  list: "Lists the complete public collection for this manager.",
  me: "Reads the caller profile and workspace state.",
  memoryMiB: "Memory quantity in mebibytes.",
  mode: "Selected allow-list or deny-list policy mode.",
  message: "Fixed safe English public error message.",
  method: "Authentication method selected for the session agent.",
  name: "Public name returned by the API or supplied for an operation.",
  note: "Explanatory estimated-usage note returned by the API.",
  ok: "Literal true acknowledgement of successful completion.",
  open: "Acquires and returns a validated session handoff without using it automatically.",
  outboundPolicy: "Optional explicit outbound network policy copied into the create request.",
  pause: "Pauses the owning session and refreshes only that handle after success.",
  records: "Stable records manager owned by this client.",
  refresh: "Refreshes this handle from the canonical session item read.",
  resume: "Resumes the owning session and refreshes only that handle after success.",
  runningSeconds: "Non-negative running duration returned by the API.",
  runtimePort: "Optional runtime port included in session creation.",
  sessionId: "Canonical identifier of the session associated with a record.",
  sessions: "Stable sessions manager owned by this client.",
  slug: "Validated runtime slug returned for the session.",
  snapshot: "Current immutable snapshot owned by this session handle.",
  start: "Starts the owning session and refreshes only that handle after success.",
  state: "Strict secret-free authentication state of the session agent.",
  status: "Documented session status or HTTP status, according to the owning declaration.",
  stderr: "Complete buffered standard-error text returned by execution.",
  stderrTruncated: "Whether the returned standard-error text was truncated.",
  stdout: "Complete buffered standard-output text returned by execution.",
  stdoutTruncated: "Whether the returned standard-output text was truncated.",
  stop: "Stops the owning session and refreshes only that handle after success.",
  summary: "Safe record summary returned by the API.",
  timeoutSecs: "Optional integer execution timeout in seconds.",
  hosts: "Ordered exact-domain or leading-wildcard rules for the selected mode.",
  tracing: "Optional caller-owned tracing sink.",
  updatedAt: "RFC 3339 last-update timestamp returned by the API.",
  url: "Validated runtime or handoff URL returned to the caller.",
  usage: "Estimated usage available only for an assigned workspace.",
  userId: "Canonical identifier of the user that owns the session.",
  vcpus: "Virtual CPU quantity returned by the API or supplied during creation.",
  waitlistPosition: "Non-negative waitlist position for an unassigned workspace.",
  workspace: "Assigned or unassigned workspace state for the caller.",
});

const returnDescriptions = Object.freeze({
  "Runa#constructor": "A configured Runa client.",
  "Runa#me": "The caller profile and workspace state.",
  "Runa#close": "A promise that resolves after client-owned cleanup completes.",
  "RecordsManager#list": "A fresh readonly ordered collection of records.",
  "SessionsManager#create": "A client-owned handle for the created session.",
  "SessionsManager#list": "A fresh readonly ordered collection of client-owned session handles.",
  "SessionsManager#get": "A client-owned handle for the requested session.",
  "Session#refresh": "The same session handle after an atomic successful refresh.",
  "Session#start": "The same session handle after a successful start response.",
  "Session#pause": "The same session handle after a successful pause response.",
  "Session#resume": "The same session handle after a successful resume response.",
  "Session#stop": "The same session handle after a successful stop response.",
  "Session#delete": "An acknowledgement whose ok member is literal true.",
  "Session#exec": "The complete buffered execution result.",
  "Session#checkpoint": "An acknowledgement whose ok member is literal true.",
  "Session#open": "A validated handoff result returned without automatic use.",
  "Session#authenticationStatus": "The strict agent authentication method and state.",
  "stdoutText#stdoutText": "The stdout string when present with the correct type, otherwise undefined.",
  "stderrText#stderrText": "The stderr string when present with the correct type, otherwise undefined.",
  "ConfigError#constructor": "A safe configuration error instance.",
  "ApiError#constructor": "A safe API error instance.",
});

const parameterDescriptions = Object.freeze({
  "Runa#constructor.config": "Optional client configuration resolved under the documented precedence rules.",
  "SessionsManager#create.name": "Session name containing between one and eighty characters.",
  "SessionsManager#create.options": "Optional agent, resource, host, and runtime-port settings.",
  "SessionsManager#get.id": "Exact canonical lowercase session UUID.",
  "Session#exec.command": "Non-empty command string or non-empty ordered string argument vector.",
  "Session#exec.options": "Optional working directory and integer timeout.",
  "Session#checkpoint.name": "Checkpoint name containing between one and eighty characters.",
  "stdoutText#stdoutText.result": "Unknown wire value to inspect without coercion.",
  "stderrText#stderrText.result": "Unknown wire value to inspect without coercion.",
  "ApiError#constructor.status": "HTTP status associated with the API outcome.",
  "ApiError#constructor.code": "Normalized API failure or malformed-response code.",
});

const render = (entries, exampleSources) => {
  const files = {};
  const manifestEntries = [];
  for (const [page, names] of Object.entries(conceptualPages)) {
    const pageTitle = page.replace(/\.md$/, "").replaceAll("-", " ");
    const lines = [`# ${pageTitle}`, "", "Generated from the released public TypeScript declarations.", ""];
    for (const name of names) {
      const entry = entries.find((item) => item.name === name);
      assert.notEqual(entry, undefined);
      const config = curation[name];
      lines.push(`<a id="${config.anchor}"></a>`, `## ${name}`, "", config.summary, "",
        `**Kind:** ${entry.kind}`, "", "**Signature**", "", "```ts", entry.signature, "```", "");
      if (entry.members.length > 0) {
        lines.push("### Public members", "");
        for (const member of entry.members) {
          assert.notEqual(memberDescriptions[member.name], undefined);
          lines.push(`#### ${member.name}`, "",
            memberDescriptions[member.name],
            "", "```ts", ...member.signatures, "```", "");
        }
      }
      const entryOperations = entry.operations;
      for (const operation of entryOperations) {
        const matrix = errorMatrix.find((row) => row.operationKey === operation.operationKey);
        lines.push(`### ${operation.operationKey}`, "",
          `Invokes the accepted public \`${operation.name}\` operation owned by \`${name}\`.`, "",
          `**Returns:** ${returnDescriptions[operation.operationKey]}`, "");
        for (const parameter of operation.parameters) {
          const description = parameterDescriptions[`${operation.operationKey}.${parameter}`];
          assert.notEqual(description, undefined);
          lines.push(`- **${parameter}:** ${description}`);
        }
        if (operation.parameters.length > 0) lines.push("");
        if (matrix.disposition === "accepted") {
          lines.push("**Throws**", "");
          for (const item of matrix.cases) {
            lines.push(`- \`${item.errorType}\` when the contract-backed failure condition applies.`);
          }
          lines.push("");
        }
        const example = examples[operation.operationKey];
        if (example !== undefined) {
          const code = extractExample(exampleSources[example.sourcePath], example.marker);
          lines.push("**Example**", "", "```ts", code, "```", "",
            `Source: [${example.sourcePath}](../reference/examples/workflows.ts) - Test: \`${example.testId}\``, "");
        }
      }
      const refs = claimRegistry.filter((row) =>
        row.subjectKey === name || row.subjectKey.startsWith(`${name}#`))
        .flatMap((row) => row.contractRefs);
      manifestEntries.push({
        name,
        kind: entry.kind,
        page,
        anchor: config.anchor,
        signature: entry.signature,
        documentation: "complete",
        examples: entry.operations.filter((operation) => examples[operation.operationKey] !== undefined)
          .map((operation) => ({
            operationKey: operation.operationKey,
            sourcePath: examples[operation.operationKey].sourcePath,
            testId: examples[operation.operationKey].testId,
          })),
        contractRefs: [...new Set(refs)],
        status: "PASS",
      });
    }
    files[`docs/api/${page}`] = `${lines.join("\n")}\n`;
  }
  files["docs/api/README.md"] = [
    "# API reference",
    "",
    ...Object.keys(conceptualPages).map((page) =>
      `- [${page.replace(/\.md$/, "").replaceAll("-", " ")}](${page})`),
    "",
  ].join("\n");
  const manifest = {
    schema_version: 2,
    status: "PASS",
    source: "dist/index.d.ts",
    runtime_export_count: 8,
    type_export_count: 18,
    entries: manifestEntries,
    claimRegistry,
    errorMatrix,
  };
  files["docs/api/manifest.json"] = `${JSON.stringify(manifest, null, 2)}\n`;
  files["docs/api/reflection-public.json"] = `${JSON.stringify(entries, null, 2)}\n`;
  return files;
};

const validateLinks = (files) => {
  const anchors = Object.fromEntries(Object.entries(files)
    .filter(([file]) => file.endsWith(".md"))
    .map(([file, content]) => [file, new Set([...content.matchAll(/<a id="([^"]+)"><\/a>/g)]
      .map((match) => match[1]))]));
  for (const [file, content] of Object.entries(files)) {
    if (!file.endsWith(".md")) continue;
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^[a-z]+:/i.test(target)) throw new Error("R-048-17: external reference link");
      const [relative, fragment] = target.split("#");
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), relative));
      if (files[resolved] === undefined &&
          resolved !== "docs/reference/examples/workflows.ts") {
        throw new Error("R-048-17: broken relative link");
      }
      if (fragment !== undefined && !anchors[resolved]?.has(fragment)) {
        throw new Error("R-048-17: broken reference anchor");
      }
    }
  }
};

const validateModel = (model, expectedNames) => {
  assert.deepEqual(model.entries.map((item) => item.name).sort(), expectedNames);
  assert.equal(new Set(model.entries.map((item) => item.name)).size, 31);
  for (const entry of model.entries) {
    assert.equal(curation[entry.name].page, entry.page);
    assert.equal(entry.signature.length > 3, true);
    assert.equal(entry.source, "dist/index.d.ts");
  }
  assert.equal(model.operations.every((item) => item.signature.includes(":")), true);
  const actualOwnership = Object.fromEntries(Object.keys(requiredPageOwnership).map((page) => [
    page,
    model.entries.filter((entry) => entry.page === page).map((entry) => entry.name).sort(),
  ]));
  const expectedOwnership = Object.fromEntries(Object.entries(requiredPageOwnership).map(([page, names]) => [
    page,
    [...names].sort(),
  ]));
  assert.deepEqual(actualOwnership, expectedOwnership);
  return true;
};

const mutationGate = (model, expectedNames, files, sourceTags) => {
  const mutations = [
    ["missing", () => ({ ...model, entries: model.entries.slice(1) })],
    ["extra", () => ({ ...model, entries: [...model.entries, { ...model.entries[0], name: "Hidden" }] })],
    ["alias", () => ({ ...model, entries: model.entries.map((item, index) =>
      index === 0 ? { ...item, name: `${item.name}Alias` } : item) })],
    ["page-ownership", () => ({ ...model, entries: model.entries.map((item, index) =>
      index === 0 ? { ...item, page: "Shared.md" } : item) })],
    ["signature", () => ({ ...model, entries: model.entries.map((item, index) =>
      index === 0 ? { ...item, signature: "" } : item) })],
    ["private-source", () => ({ ...model, entries: model.entries.map((item, index) =>
      index === 0 ? { ...item, source: "src/private.ts" } : item) })],
  ];
  const passed = [];
  for (const [name, mutate] of mutations) {
    assert.throws(() => validateModel(mutate(), expectedNames));
    passed.push(name);
  }
  const brokenLink = { ...files, "docs/api/README.md": "[broken](Missing.md)\n" };
  assert.throws(() => validateLinks(brokenLink));
  passed.push("link");
  const unsafe = { "docs/api/Core.md": `${"Author"}ization: ${"Bear"}er injected` };
  assert.throws(() => safeCorpus(unsafe));
  passed.push("safety");
  const matrixMutation = errorMatrix.map((row, index) =>
    index === 0 ? { ...row, disposition: "unresolved" } : row);
  assert.equal(matrixMutation.some((row) => row.disposition === "unresolved"), true);
  passed.push("throws");
  const exampleMutation = Object.values(examples)[0];
  assert.throws(() => extractExample("// divergent", exampleMutation.marker));
  passed.push("example");
  const missingTag = sourceTags.slice(1);
  const expectedTags = claimRegistry.flatMap((row) => row.contractRefs.map((contractRef) =>
    `@runa-contract ${row.claimId} ${contractRef}`)).sort();
  assert.throws(() => assert.deepEqual([...missingTag].sort(), expectedTags));
  passed.push("claim-tag");
  return passed;
};

const reflectionMutationGate = (roots) => {
  const clone = () => JSON.parse(JSON.stringify(roots));
  const operation = (candidate, key) => reflectedOperations(candidate)
    .find((item) => item.operationKey === key);
  const mutations = [
    ["reflection-tag-delete", (candidate) => {
      const target = operation(candidate, "Runa#constructor").signature.comment.blockTags;
      target.splice(target.findIndex((tag) => tag.tag === "@runa-contract"), 1);
    }],
    ["reflection-tag-change", (candidate) => {
      const target = operation(candidate, "Runa#constructor").signature.comment.blockTags
        .find((tag) => tag.tag === "@runa-contract");
      target.content[0].text = target.content[0].text.replace("runa-constructor", "changed");
    }],
    ["reflection-param", (candidate) => {
      operation(candidate, "Runa#constructor").signature.parameters[0].comment = undefined;
    }],
    ["reflection-returns", (candidate) => {
      const tags = operation(candidate, "Runa#constructor").signature.comment.blockTags;
      tags.splice(tags.findIndex((tag) => tag.tag === "@returns"), 1);
    }],
    ["reflection-throws", (candidate) => {
      const tags = operation(candidate, "Runa#constructor").signature.comment.blockTags;
      tags.splice(tags.findIndex((tag) => tag.tag === "@throws"), 1);
    }],
    ["reflection-example", (candidate) => {
      const tag = operation(candidate, "Runa#constructor").signature.comment.blockTags
        .find((item) => item.tag === "@example");
      tag.content[0].text = "docs/reference/examples/workflows.ts#changed";
    }],
  ];
  const passed = [];
  for (const [name, mutate] of mutations) {
    const candidate = clone();
    mutate(candidate);
    assert.throws(() => validateReflectionDocumentation(candidate));
    passed.push(name);
  }
  return passed;
};

export async function runReferencePipeline({ write = true } = {}) {
  const reflection = JSON.parse(await readFile("docs/.reflection.json", "utf8"));
  const surface = JSON.parse(await readFile("evidence/export-snapshot.json", "utf8"));
  const expectedNames = [...surface.runtime_exports, ...surface.type_exports].sort();
  assert.equal(expectedNames.length, 31);
  assert.deepEqual(Object.keys(curation).sort(), expectedNames);
  const reflectedRoots = (reflection.children ?? []).filter((entry) =>
    expectedNames.includes(entry.name));
  assert.deepEqual(reflectedRoots.map((entry) => entry.name).sort(), expectedNames);
  validateReflectionDocumentation(reflectedRoots);
  const entries = reflectedRoots.map((entry) => ({
    name: entry.name,
    kind: surface.runtime_exports.includes(entry.name) ? "runtime" : "type",
    declarationKind: kindName(entry),
    page: curation[entry.name].page,
    source: "dist/index.d.ts",
    signature: entrySignature(entry),
    members: membersFor(entry),
    operations: operationsFor(entry),
  })).sort((left, right) => left.name.localeCompare(right.name));
  const operations = entries.flatMap((entry) => entry.operations)
    .filter((operation) => errorMatrix.some((row) => row.operationKey === operation.operationKey))
    .sort((left, right) => left.operationKey.localeCompare(right.operationKey));
  const sourceClaimBytes = await readFile("docs/reference/claims.runa-contract", "utf8");
  const sourceClaimTags = parseSourceTags(sourceClaimBytes);
  await validateRegistries(operations, sourceClaimTags);
  const model = { entries, operations };
  validateModel(model, expectedNames);
  const exampleSources = {};
  for (const example of Object.values(examples)) {
    exampleSources[example.sourcePath] ??= await readFile(example.sourcePath, "utf8");
  }
  const tsc = spawnSync(process.execPath, [
    path.resolve("node_modules/typescript/bin/tsc"),
    "--project", "tsconfig.reference-examples.json",
  ], { encoding: "utf8" });
  assert.equal(tsc.status, 0, "R-048-09: reference example type check failed");
  const first = render(entries, exampleSources);
  const second = render(JSON.parse(JSON.stringify(entries)), exampleSources);
  assert.deepEqual(second, first);
  validateLinks(first);
  safeCorpus({
    ...first,
    ...Object.fromEntries(Object.entries(exampleSources)),
  });
  const mutations = [
    ...mutationGate(model, expectedNames, first, sourceClaimTags),
    ...reflectionMutationGate(reflectedRoots),
  ];
  const outputDigest = createHash("sha256")
    .update(Object.entries(first).sort().map(([file, content]) => `${file}\0${content}\0`).join(""))
    .digest("hex");
  if (write) {
    await rm("docs/api", { recursive: true, force: true });
    await mkdir("docs/api", { recursive: true });
    for (const [file, content] of Object.entries(first)) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    }
    await mkdir("evidence", { recursive: true });
    await writeFile("evidence/docs-readiness.json", `${JSON.stringify({
      schema_version: 2,
      status: "PASS",
      reflection_source: "dist/index.d.ts",
      runtime_export_count: 8,
      type_export_count: 18,
      operation_count: operations.length,
      claim_count: claimRegistry.length,
      source_claims_sha256: createHash("sha256").update(sourceClaimBytes).digest("hex"),
      source_claims_owner: "docs/reference/claims.runa-contract",
      error_matrix_count: errorMatrix.length,
      example_count: Object.keys(examples).length,
      deterministic_output_sha256: outputDigest,
      mutations: mutations.map((name) => ({ name, status: "REJECTED" })),
      acceptance_tests: ["TC-048-01", "TC-048-02", "TC-048-03", "TC-048-04", "TC-048-05", "TC-048-06", "TC-048-07"],
    }, null, 2)}\n`);
  }
  return { files: first, model, outputDigest, mutations };
}
