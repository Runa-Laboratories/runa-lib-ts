import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function recursiveFiles(root, extension) {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) found.push(...await recursiveFiles(target, extension));
    else if (entry.name.endsWith(extension)) found.push(target);
  }
  return found;
}

const runtimeFiles = (await recursiveFiles("src", ".ts")).sort();
const files = [...runtimeFiles, ...(await recursiveFiles("scripts", ".mjs")).sort()];
const sources = Object.fromEntries(await Promise.all(files.map(async (file) =>
  [file, await readFile(file, "utf8")])));
const occurrences = (pattern, selected = files) => selected.reduce((total, file) =>
  total + [...sources[file].matchAll(pattern)].length, 0);
const digest = createHash("sha256");
for (const file of files) digest.update(`${file}\0${sources[file]}\0`);

const decodeExports = [...sources["src/domain.ts"].matchAll(
  /export function (decode[A-Za-z]+)\(/g)].map((match) => match[1]).sort();
assert.deepEqual(decodeExports, [
  "decodeAcknowledgement", "decodeExec", "decodeMe", "decodeOpen",
  "decodeRecords", "decodeSession", "decodeSessions",
]);
assert.equal(occurrences(/export function decode[A-Za-z]+\(/g,
  files.filter((file) => file !== "src/domain.ts")), 0);

const prohibitedDefinitions = occurrences(
  /export function containsProhibitedMarker\(/g);
assert.equal(prohibitedDefinitions, 1);
assert.match(sources["src/internal/sanitize.ts"],
  /import \{ containsProhibitedMarker \} from "\.\/boundary-policy\.js";/);
assert.match(sources["scripts/verify-security.mjs"],
  /import \{ containsProhibitedMarker \} from "\.\.\/dist\/internal\/boundary-policy\.js";/);

const decisions = [
  {
    concept: "wire-decoding",
    disposition: "centralized",
    owner: "src/domain.ts",
    observed: { decoder_exports: decodeExports, out_of_owner_definitions: 0 },
    rationale: "All response-shape decoders and primitive wire validators share one fail-closed module.",
  },
  {
    concept: "request-validation-and-policy",
    disposition: "layered-distinct",
    owners: ["src/client.ts", "src/session.ts", "src/internal/transport.ts"],
    observed: {
      create_body_validator: occurrences(/function createBody\(/g),
      exec_body_validator: occurrences(/function prepareExec\(/g),
      transport_request_preparer: occurrences(/function prepare\(/g),
    },
    rationale: "Public option validation, session command validation, and transport framing enforce different contracts and are intentionally not one permissive validator.",
  },
  {
    concept: "own-property-checks",
    disposition: "intentional-local",
    owners: ["src/domain.ts", "src/client.ts", "src/session.ts"],
    observed: {
      object_has_own_calls: occurrences(/Object\.hasOwn\(/g,
        ["src/domain.ts", "src/client.ts", "src/session.ts"]),
      local_own_helpers: occurrences(/function own\(/g,
        ["src/client.ts", "src/session.ts"]),
    },
    rationale: "Tiny private predicates stay at separate decode and caller-input trust boundaries; no public or cross-layer abstraction is created.",
  },
  {
    concept: "hash-and-evidence-utilities",
    disposition: "accepted-job-local",
    owners: files.filter((file) => file.startsWith("scripts/") &&
      /createHash\("sha256"\)/.test(sources[file])),
    observed: {
      sha256_call_sites: occurrences(/createHash\("sha256"\)/g,
        files.filter((file) => file.startsWith("scripts/"))),
    },
    rationale: "Release tools are independently executable trust-boundary gates; their one-line SHA-256 calculations remain local and compare the same candidate rather than sharing mutable evidence state.",
  },
  {
    concept: "secret-redaction-and-boundary-policy",
    disposition: "centralized-runtime-plus-control-plane",
    owners: [
      "src/internal/boundary-policy.ts",
      "src/internal/sanitize.ts",
      "scripts/verify-security.mjs",
    ],
    observed: {
      prohibited_marker_definitions: prohibitedDefinitions,
      runtime_policy_consumers: 1,
      exact_byte_scanner_consumers: 1,
      scanner_credential_pattern_families: occurrences(/new RegExp\(|PRIVATE KEY|Authorization\\s/g,
        ["scripts/verify-security.mjs"]),
    },
    rationale: "Runtime fail-closed wire screening and the repository exact-byte scanner reuse one prohibited-marker predicate; credential byte patterns remain scanner-only because they are not wire-decoding policy.",
  },
];

for (const decision of decisions) {
  for (const value of Object.values(decision.observed)) {
    if (typeof value === "number") assert(value > 0 || decision.concept === "wire-decoding");
  }
}

await mkdir("evidence", { recursive: true });
await writeFile("evidence/duplicate-abstraction-audit.json", `${JSON.stringify({
  schema_version: 2,
  status: "PASS",
  method: "scripts/verify-duplicate-abstractions.mjs",
  audited_source_sha256: digest.digest("hex"),
  audited_files: files,
  exclusions: [],
  decisions,
}, null, 2)}\n`);
console.log(`duplicate abstractions: PASS (${decisions.length} governed concepts)`);
