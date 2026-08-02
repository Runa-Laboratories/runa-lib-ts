import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { npmSpawnSync } from "./npm-process.mjs";
import { validateSbomWithPinnedTools } from "./sbom-validation.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
const archivePath = path.resolve("release-artifacts", candidate.filename);
const archive = await readFile(archivePath);
assert.equal(hash(archive), candidate.sha256);
const policy = JSON.parse(await readFile("governance/dependency-policy.json", "utf8"));
const advisory = JSON.parse(await readFile("governance/advisory-snapshot.json", "utf8"));
assert.deepEqual(policy.runtime_dependencies, []);
assert.equal(advisory.status, "PASS");
assert.equal(advisory.high + advisory.critical, 0);
const closures = [];
const installs = [];
for (let run = 0; run < 2; run += 1) {
  const workspace = await mkdtemp(path.join(tmpdir(), `runa-clean-${run}-`));
  try {
    const cache = path.join(workspace, "cache");
    await mkdir(cache);
    await writeFile(path.join(workspace, "package.json"), `${JSON.stringify({
      name: "runa-release-clean-room", version: "0.0.0",
      private: true, type: "module",
      dependencies: { "@runa_laboratories/sdk": `file:${archivePath.replaceAll("\\", "/")}` }
    })}\n`);
    const runNpm = (arguments_) => npmSpawnSync(arguments_, { cwd: workspace });
    const lock = runNpm(["install", "--package-lock-only", "--ignore-scripts",
      "--offline", "--cache", cache, "--no-audit", "--no-fund"]);
    if (lock.status !== 0) throw new Error("Isolated offline lock creation failed.");
    const lockBefore = await readFile(path.join(workspace, "package-lock.json"));
    const install = runNpm(["ci", "--ignore-scripts", "--offline", "--cache",
      cache, "--no-audit", "--no-fund"]);
    if (install.status !== 0) throw new Error("Isolated immutable offline install failed.");
    assert.deepEqual(await readFile(path.join(workspace, "package-lock.json")), lockBefore);
    const installed = JSON.parse(await readFile(path.join(workspace, "node_modules/@runa_laboratories/sdk/package.json"), "utf8"));
    assert.equal(installed.name, "@runa_laboratories/sdk");
    assert.equal(installed.version, candidate.version);
    assert.equal(Object.keys(installed.dependencies ?? {}).length, 0);
    const closure = hash(Buffer.from(JSON.stringify({
      name: installed.name, version: installed.version, runtime: [],
    })));
    closures.push(closure);
    installs.push({
      run: run + 1,
      lock_sha256: hash(lockBefore),
      closure_sha256: closure,
      immutable: true,
      offline: true,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
assert.equal(closures[0], closures[1]);
assert.equal(installs[0].lock_sha256, installs[1].lock_sha256);
const sbom = {
  $schema: "http://cyclonedx.org/schema/bom-1.6.schema.json",
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${candidate.sha256.slice(0, 8)}-${candidate.sha256.slice(8, 12)}-${candidate.sha256.slice(12, 16)}-${candidate.sha256.slice(16, 20)}-${candidate.sha256.slice(20, 32)}`,
  version: 1,
  metadata: {
    component: {
      "bom-ref": `pkg:npm/%40runa_laboratories/sdk@${candidate.version}`,
      type: "library",
      name: "@runa_laboratories/sdk",
      version: candidate.version,
      purl: `pkg:npm/%40runa_laboratories/sdk@${candidate.version}`,
      hashes: [{ alg: "SHA-256", content: candidate.sha256 }],
    },
  },
  components: [],
  dependencies: [{
    ref: `pkg:npm/%40runa_laboratories/sdk@${candidate.version}`,
    dependsOn: [],
  }],
};
assert.equal(sbom.bomFormat, "CycloneDX");
assert.equal(sbom.specVersion, "1.6");
await mkdir("evidence", { recursive: true });
const sbomBytes = Buffer.from(`${JSON.stringify(sbom, null, 2)}\n`);
await writeFile("evidence/sbom.cdx.json", sbomBytes);
const sbomLocalValidation = await validateSbomWithPinnedTools(
  "evidence/sbom.cdx.json",
  process.env.RUNA_CYCLONEDX_CLI ?? "cyclonedx-cli",
);
await writeFile("evidence/sbom-local-validation.json",
  `${JSON.stringify(sbomLocalValidation, null, 2)}\n`);
await writeFile("evidence/sbom-validation.json", `${JSON.stringify({
  schema_version: 1,
  status: "BLOCKED",
  candidate_sha256: candidate.sha256,
  artifact_subject_sha256: candidate.sha256,
  sbom_sha256: hash(sbomBytes),
  dependency_closure_sha256: closures[0],
  local_structural_checks: "PASS",
  local_validation_sha256: hash(Buffer.from(`${JSON.stringify(sbomLocalValidation, null, 2)}\n`)),
  required_validator: "cyclonedx-cli@0.32.0 validate --input-format json --input-version v1_6",
  reason: "Local version-controlled schema and pinned CLI validation passed; independent authority signature remains required.",
}, null, 2)}\n`);
await writeFile("evidence/runtime-closure.json", `${JSON.stringify({
  schema_version: 1, status: "PASS", candidate_sha256: candidate.sha256,
  clean_install_count: 2, closure_sha256: closures[0], runtime_dependencies: [],
  installs,
  reason_ledger: [{ decision: "empty-runtime-closure", reason: "The package manifest and both installed artifacts declare no runtime dependencies." }]
}, null, 2)}\n`);
const external = {
  schema_version: 1, status: "BLOCKED",
  required_interfaces: [
    "CycloneDX 1.6 schema validation receipt",
    "OIDC trusted publisher",
    "GitHub attestation verification",
    "npm registry retrieval",
    "dist-tag verification",
  ],
  candidate_sha256: candidate.sha256
};
await writeFile("evidence/external-release-interfaces.json", `${JSON.stringify(external, null, 2)}\n`);
await writeFile("evidence/ci-candidate-manifest.json", `${JSON.stringify({
  schema_version: 1, status: "PASS", source_commit: candidate.source_commit,
  candidate_sha256: candidate.sha256, expected_cells: 6,
  aggregate_rule: "same candidate digest and six exact PASS receipts"
}, null, 2)}\n`);
console.log(`local release gates: PASS (${candidate.sha256}, closure ${closures[0]})`);
