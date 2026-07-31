import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build as bundle } from "esbuild";
import { npmSpawnSync } from "./npm-process.mjs";

const catalog = JSON.parse(await readFile("compatibility/ts-050-evidence-v1.json", "utf8"));
const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
const archivePath = path.resolve("release-artifacts", candidate.filename);
const archive = await readFile(archivePath);
assert.equal(createHash("sha256").update(archive).digest("hex"), candidate.sha256);
const npmVersionResult = npmSpawnSync(["--version"]);
assert.equal(npmVersionResult.status, 0);
const npmVersion = npmVersionResult.stdout.trim();
const cell = catalog.matrix.find((item) => item.node === process.versions.node &&
  item.npm === npmVersion && item.platform === process.platform && item.arch === process.arch);
if (cell === undefined) throw new Error("Runtime is not an exact V1 matrix cell.");
const workspace = await mkdtemp(path.join(tmpdir(), "runa-ts050-"));
const cache = path.join(workspace, "cache");
const runNpm = (args) => npmSpawnSync(args, { cwd: workspace });
let status = "BLOCKED";
let failure = null;
let metrics = null;
let compatibilityStatus = "PASS";
let performanceStatus = "BLOCKED";
try {
  await mkdir(cache);
  await writeFile(path.join(workspace, "package.json"), `${JSON.stringify({
    name: "runa-compatibility-clean-room", version: "0.0.0",
    private: true, type: "module",
    dependencies: { "@runa/sdk": `file:${archivePath.replaceAll("\\", "/")}` }
  })}\n`);
  let result = runNpm(["install", "--package-lock-only", "--ignore-scripts", "--offline",
    "--cache", cache, "--no-audit", "--no-fund"]);
  assert.equal(result.status, 0);
  result = runNpm(["ci", "--ignore-scripts", "--offline", "--cache", cache, "--no-audit", "--no-fund"]);
  assert.equal(result.status, 0);
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e",
    "import('@runa/sdk').then(m=>{if(Object.keys(m).sort().join(',')!=='ApiError,CommandError,ConfigError,Runa,RunaError,Session,stderrText,stdoutText')process.exit(2)})"],
    { cwd: workspace, encoding: "utf8" });
  assert.equal(imported.status, 0);
  await writeFile(path.join(workspace, "consumer.mts"),
    "import { Runa, stdoutText } from '@runa/sdk'; import type { AssignedWorkspace } from '@runa/sdk'; const r: Runa = new Runa({apiKey: 'runa_sk_synthetic'}); const x: true = (null as unknown as AssignedWorkspace).assigned; void stdoutText; void r;\n");
  await writeFile(path.join(workspace, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true,
      verbatimModuleSyntax: true, isolatedModules: true, exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true, skipLibCheck: false, noEmit: true
    }, files: ["consumer.mts"]
  }));
  const tsc = spawnSync(process.execPath,
    [path.resolve("node_modules/typescript/bin/tsc"), "--project", path.join(workspace, "tsconfig.json")],
    { cwd: workspace, encoding: "utf8" });
  assert.equal(tsc.status, 0);
  const installed = JSON.parse(await readFile(path.join(workspace, "node_modules/@runa/sdk/package.json"), "utf8"));
  assert.deepEqual(Object.keys(installed.exports), ["."]);
  assert.equal(installed.sideEffects, false);
  const importStarted = performance.now();
  const sdk = await import(new URL(`file://${path.join(workspace, "node_modules/@runa/sdk/dist/index.js").replaceAll("\\", "/")}`));
  const importMs = performance.now() - importStarted;
  const construction = [];
  for (let index = 0; index < 20; index += 1) {
    const started = performance.now();
    const client = new sdk.Runa({ apiKey: "runa_sk_synthetic" });
    construction.push(performance.now() - started);
    await client.close();
  }
  construction.sort((left, right) => left - right);
  const request = [];
  const heapBefore = process.memoryUsage().heapUsed;
  const client = new sdk.Runa({
    apiKey: "runa_sk_synthetic",
    baseUrl: "https://sdk.example.invalid",
    fetch: async () => new Response(JSON.stringify({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      email: "sdk@example.invalid",
      workspace: { assigned: false, waitlist_position: 0 }
    }), { status: 200, headers: { "content-type": "application/json" } })
  });
  for (let index = 0; index < 20; index += 1) {
    const started = performance.now();
    await client.me();
    request.push(performance.now() - started);
  }
  await client.close();
  request.sort((left, right) => left - right);
  metrics = {
    tarball_bytes: archive.byteLength,
    import_ms: importMs,
    construction_p95_ms: construction[18],
    request_p95_ms: request[18],
    allocation_delta_bytes: Math.max(0, process.memoryUsage().heapUsed - heapBefore)
  };
  assert(metrics.tarball_bytes <= catalog.profile.metrics.payload.cap);
  assert(metrics.import_ms <= catalog.profile.metrics.import.cap);
  assert(metrics.construction_p95_ms <= catalog.profile.metrics.construction.cap);
  assert(metrics.request_p95_ms <= catalog.profile.metrics.request_overhead.cap);
  assert(metrics.allocation_delta_bytes <= catalog.profile.metrics.allocation_delta.cap);
  const readme = await readFile(path.join(workspace, "node_modules/@runa/sdk/README.md"), "utf8");
  assert.match(readme, /npm install @runa\/sdk/);
  await writeFile(path.join(workspace, "bundle-entry.mjs"),
    "export { stdoutText } from '@runa/sdk';\n");
  const bundleResult = await bundle({
    absWorkingDir: workspace,
    entryPoints: ["bundle-entry.mjs"],
    outfile: "bundle.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    treeShaking: true,
    metafile: true,
    write: true
  });
  assert.equal(Object.keys(bundleResult.metafile.inputs).some((input) =>
    input.replaceAll("\\", "/").endsWith("/dist/client.js")), false);
  const performanceRun = spawnSync(process.execPath, [
    "scripts/verify-performance.mjs", "--artifact", archivePath,
  ], { cwd: path.resolve("."), encoding: "utf8", timeout: 180_000 });
  assert.equal(performanceRun.status, 0);
  const performance = JSON.parse(
    await readFile("evidence/performance-local.json", "utf8"),
  );
  assert.equal(performance.status, "PASS");
  assert.equal(performance.identity.artifact_sha256, candidate.sha256);
  assert.equal(performance.identity.matrix_cell, cell.id);
  performanceStatus = "PASS";
  metrics = performance.metrics;
  status = "PASS";
} catch {
  status = "FAIL";
  compatibilityStatus = "FAIL";
  failure = "compatibility-probe";
} finally {
  await mkdir("evidence/compatibility-receipts", { recursive: true });
  await writeFile(`evidence/compatibility-receipts/${cell.id}.json`, `${JSON.stringify({
    schema_version: 1, status, cell_id: cell.id, candidate_sha256: candidate.sha256,
    node: process.versions.node, npm: npmVersion, platform: process.platform,
    arch: process.arch, probes: ["isolated-offline-install", "root-esm", "declarations", "tree-shaking", "readme", "package-surface"],
    compatibility_status: compatibilityStatus,
    performance_status: performanceStatus,
    performance_receipt: "evidence/performance-local.json",
    metrics, failure
  }, null, 2)}\n`);
  await rm(workspace, { recursive: true, force: true });
}
if (status === "FAIL") process.exit(1);
console.log(`compatibility: ${status}; performance: ${performanceStatus} (${cell.id}, ${candidate.sha256})`);
