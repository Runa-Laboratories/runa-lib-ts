import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  Agent as HttpAgent,
  createServer,
  request as httpRequest,
} from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { npmSpawnSync } from "./npm-process.mjs";

const catalogBytes = await readFile("compatibility/ts-050-evidence-v1.json");
const catalog = JSON.parse(catalogBytes);
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(catalog.catalog_revision, "TS-050-EVIDENCE-V1");
assert.equal(catalog.matrix.length, 6);
assert.equal(catalog.profile.metrics.import.samples, 20);
assert.equal(catalog.profile.metrics.retained_memory_delta.batches, 5);
assert.equal(catalog.profile.metrics.retained_memory_delta.cycles_per_batch, 100);
assert.equal(catalog.reuse_fixture.sequential_calls, 10);
assert.equal(catalog.reuse_fixture.cleanup_calls, 2);
assert.equal(packageJson.devDependencies.typescript, catalog.tools.typescript);
assert.equal(packageJson.devDependencies["@types/node"], catalog.tools.types_node);
assert.equal(packageJson.devDependencies.esbuild, catalog.tools.esbuild);
assert.equal(packageJson.devDependencies.vitest, catalog.tools.vitest_security_substitution);

const artifactArgumentIndex = process.argv.indexOf("--artifact");
const suppliedArtifact = artifactArgumentIndex < 0
  ? undefined
  : process.argv[artifactArgumentIndex + 1];
let generatedArtifact = false;
let artifactPath;
if (suppliedArtifact === undefined) {
  const packed = npmSpawnSync(["pack", "--json", "--ignore-scripts"], { encoding: "utf8" });
  assert.equal(packed.status, 0, "R-050-09: exact artifact pack failed");
  const [packMetadata] = JSON.parse(packed.stdout);
  artifactPath = path.resolve(packMetadata.filename);
  generatedArtifact = true;
} else {
  artifactPath = path.resolve(suppliedArtifact);
}
const artifactBytes = await readFile(artifactPath);
const artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");
const catalogSha256 = createHash("sha256").update(catalogBytes).digest("hex");
const localNpmVersion = npmSpawnSync(["--version"], { encoding: "utf8" }).stdout.trim();
const matrixCell = catalog.matrix.find((cell) =>
  cell.node === process.versions.node &&
  cell.npm === localNpmVersion &&
  cell.platform === process.platform &&
  cell.arch === process.arch);
const payloadResult = spawnSync(process.execPath, [
  "tools/ts050/measure-payload.mjs", "--artifact", artifactPath,
], { encoding: "utf8" });
assert.equal(payloadResult.status, 0);
const payload = JSON.parse(payloadResult.stdout);
const startupResult = spawnSync(process.execPath, [
  "tools/ts050/measure-startup.mjs", "--artifact", artifactPath, "--runs", "20",
], { encoding: "utf8", timeout: 120_000 });
assert.equal(startupResult.status, 0, "R-050-09: startup measurement failed");
const startup = JSON.parse(startupResult.stdout);

const workspace = await mkdtemp(path.join(tmpdir(), "runa-ts050-profile-"));
const cache = path.join(workspace, "cache");
let releasePrivateFactory;
let releaseNodeHarness;
let server;
const activeServerSockets = new Set();
try {
  await mkdir(cache);
  await writeFile(path.join(workspace, "package.json"), `${JSON.stringify({
    name: "runa-ts050-profile",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: { "@runa/sdk": `file:${artifactPath.replaceAll("\\", "/")}` },
  })}\n`);
  const install = npmSpawnSync([
    "install", "--ignore-scripts", "--offline", "--cache", cache,
    "--no-audit", "--no-fund",
  ], { cwd: workspace });
  assert.equal(install.status, 0, "R-050-03: isolated profile install failed");
  const packageRoot = path.join(workspace, "node_modules", "@runa", "sdk");
  const sdk = await import(pathToFileURL(path.join(packageRoot, "dist", "index.js")));
  const seam = await import(pathToFileURL(
    path.join(packageRoot, "dist", "internal", "performance-seam.js"),
  ));
  const nodeSeam = await import(pathToFileURL(
    path.join(packageRoot, "dist", "internal", "node-transport-seam.js"),
  ));

  class OverheadBoundaryTransport {
    async execute(operationKey) {
      assert.equal(operationKey, "sessions.list");
      return Object.freeze([]);
    }
    close() {}
  }
  releasePrivateFactory = seam.installPrivateTransportFactory(
    () => new OverheadBoundaryTransport(),
  );
  const key = ["runa", "sk", "synthetic"].join("_");
  const requestSamples = [];
  const allocationSamples = [];
  for (let warmup = 0; warmup < 25; warmup += 1) {
    const client = new sdk.Runa({
      apiKey: key,
      baseUrl: "https://api.runacode.io",
    });
    await client.sessions.list();
    await client.close();
  }
  for (let sample = 0; sample < 20; sample += 1) {
    const client = new sdk.Runa({
      apiKey: key,
      baseUrl: "https://api.runacode.io",
    });
    const before = process.memoryUsage().heapUsed;
    const started = performance.now();
    await client.sessions.list();
    requestSamples.push(performance.now() - started);
    allocationSamples.push(Math.max(0, process.memoryUsage().heapUsed - before));
    await client.close();
  }
  releasePrivateFactory();
  releasePrivateFactory = undefined;

  let serverConnectionEstablishments = 0;
  server = createServer((request, response) => {
    request.resume();
    response.writeHead(200, {
      "content-type": "application/json",
      "content-length": "2",
    });
    response.end("[]");
  });
  server.on("connection", (socket) => {
    serverConnectionEstablishments += 1;
    activeServerSockets.add(socket);
    socket.once("close", () => activeServerSockets.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const agents = [];
  const originByAgent = new Map();
  let pendingDispatches = 0;
  class ObservedAgent extends HttpAgent {
    destroyCalls = 0;
    overrideOrigin = undefined;
    destroy() {
      this.destroyCalls += 1;
      super.destroy();
    }
  }
  const agentResources = (agent) => ({
    openConnections: Object.values(agent.sockets)
      .flat().filter((socket) => !socket.destroyed).length,
    poolEntries: Object.values(agent.freeSockets).flat().length,
    timers: Object.values(agent.sockets).flat()
      .concat(Object.values(agent.freeSockets).flat())
      .filter((socket) => !socket.destroyed &&
        socket.timeout !== undefined && socket.timeout > 0).length,
    callbackRegistrations: pendingDispatches,
    lifecycleRegistrations: agent.destroyCalls === 0 ? 1 : 0,
  });
  releaseNodeHarness = nodeSeam.installPrivateNodeTransportHarness({
    createAgent() {
      const agent = new ObservedAgent({ keepAlive: true });
      agents.push(agent);
      return agent;
    },
    dispatch(input, init, agent) {
      const origin = new URL(input).origin;
      const priorOrigin = originByAgent.get(agent);
      if (priorOrigin !== undefined) assert.equal(priorOrigin, origin);
      originByAgent.set(agent, origin);
      pendingDispatches += 1;
      return new Promise((resolve, reject) => {
        const request = httpRequest({
          hostname: "127.0.0.1",
          port: address.port,
          path: new URL(input).pathname,
          method: init.method,
          headers: init.headers,
          agent,
          signal: init.signal ?? undefined,
        }, (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.once("end", () => {
            pendingDispatches -= 1;
            resolve(new Response(Buffer.concat(chunks), {
              status: response.statusCode,
              headers: response.headers,
            }));
          });
        });
        request.once("error", (error) => {
          pendingDispatches -= 1;
          reject(error);
        });
        request.end(typeof init.body === "string" ? init.body : undefined);
      });
    },
  });

  const reuseClient = new sdk.Runa({
    apiKey: key,
    baseUrl: "https://api.runacode.io",
  });
  const reuseConnectionStart = serverConnectionEstablishments;
  const reuseAgentStart = agents.length;
  for (let call = 0; call < 10; call += 1) await reuseClient.sessions.list();
  const reuseAgent = agents[reuseAgentStart];
  assert.notEqual(reuseAgent, undefined);
  const reuseEstablishments =
    serverConnectionEstablishments - reuseConnectionStart;
  assert.equal(reuseEstablishments <= 1, true);
  await reuseClient.close();
  await reuseClient.close();
  for (let drain = 0; drain < 20 && activeServerSockets.size > 0; drain += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(reuseAgent.destroyCalls, 1);
  assert.deepEqual(agentResources(reuseAgent), {
    openConnections: 0,
    poolEntries: 0,
    timers: 0,
    callbackRegistrations: 0,
    lifecycleRegistrations: 0,
  });

  const firstOriginClient = new sdk.Runa({
    apiKey: key,
    baseUrl: "https://one.example.invalid",
  });
  const secondOriginClient = new sdk.Runa({
    apiKey: key,
    baseUrl: "https://two.example.invalid",
  });
  const isolationStart = agents.length;
  await firstOriginClient.sessions.list();
  await secondOriginClient.sessions.list();
  const firstAgent = agents[isolationStart];
  const secondAgent = agents[isolationStart + 1];
  assert.notEqual(firstAgent, secondAgent);
  assert.notEqual(originByAgent.get(firstAgent), originByAgent.get(secondAgent));
  await firstOriginClient.close();
  await secondOriginClient.close();

  let injectedCalls = 0;
  const injectedClient = new sdk.Runa({
    apiKey: key,
    baseUrl: "https://api.runacode.io",
    fetch: async () => {
      injectedCalls += 1;
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const beforeInjectedAgents = agents.length;
  await injectedClient.sessions.list();
  await injectedClient.close();
  assert.equal(injectedCalls, 1);
  assert.equal(agents.length, beforeInjectedAgents);

  const retainedBatches = [];
  let finalResourceCounters = {
    openConnections: 0,
    poolEntries: 0,
    timers: 0,
    callbackRegistrations: 0,
    lifecycleRegistrations: 0,
  };
  for (let batch = 0; batch < 5; batch += 1) {
    const heapBefore = process.memoryUsage().heapUsed;
    const batchStart = agents.length;
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const client = new sdk.Runa({
        apiKey: key,
        baseUrl: "https://api.runacode.io",
      });
      await client.sessions.list();
      await client.close();
      await client.close();
    }
    await Promise.resolve();
    for (let drain = 0; drain < 20; drain += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      const batchAgents = agents.slice(batchStart);
      if (batchAgents.every((agent) => {
        const resources = agentResources(agent);
        return Object.values(resources).every((count) => count === 0);
      })) break;
    }
    retainedBatches.push(Math.max(0, process.memoryUsage().heapUsed - heapBefore));
    const batchResources = agents.slice(batchStart).map(agentResources);
    for (const resource of Object.keys(finalResourceCounters)) {
      finalResourceCounters[resource] = Math.max(
        finalResourceCounters[resource],
        ...batchResources.map((item) => item[resource]),
      );
    }
  }
  const p95 = (values) => [...values].sort((left, right) => left - right)[
    Math.ceil(values.length * 0.95) - 1
  ];
  const metrics = {
    tarball_bytes: payload.tarball_bytes,
    import_p95_ms: startup.import_p95_ms,
    construction_p95_ms: startup.construction_p95_ms,
    request_overhead_p95_ms: p95(requestSamples),
    allocation_delta_bytes_max: Math.max(...allocationSamples),
    connection_establishments: reuseEstablishments,
    retained_memory_delta_bytes_p95: p95(retainedBatches),
    ...finalResourceCounters,
    startup_dispatches: startup.startup_dispatches,
    startup_connection_attempts: startup.startup_connection_attempts,
    startup_session_operations: startup.startup_session_operations,
    startup_hidden_transport_creations: startup.startup_hidden_transport_creations,
  };
  const caps = catalog.profile.metrics;
  const evaluate = (value) => {
    assert.equal(value.status, "PASS", "R-050-19: non-passing profile");
    assert.equal(value.identity.artifact_sha256, artifactSha256, "R-050-20: artifact mismatch");
    assert.equal(value.identity.catalog_sha256, catalogSha256, "R-050-20: catalog mismatch");
    assert.equal(value.identity.catalog_revision, catalog.catalog_revision, "R-050-20: revision mismatch");
    assert.deepEqual(value.tools, catalog.tools, "R-050-20: tool provenance mismatch");
    assert.equal(value.profile.isolated_import_runs, 20, "R-050-09: import sample mismatch");
    assert.equal(value.profile.isolated_construction_runs, 20, "R-050-09: construction sample mismatch");
    assert.equal(value.profile.isolated_request_invocations, 20, "R-050-10: request sample mismatch");
    assert.equal(value.profile.sequential_calls, 10, "R-050-11: reuse fixture mismatch");
    assert.equal(value.profile.cleanup_calls, 2, "R-050-12: cleanup fixture mismatch");
    assert.equal(value.profile.leak_batches, 5, "R-050-12: leak batch mismatch");
    assert.equal(value.profile.cycles_per_batch, 100, "R-050-12: leak cycle mismatch");
    assert.equal(value.forced_gc, false, "R-017-18: forced collection is prohibited");
    assert(value.metrics.tarball_bytes <= caps.payload.cap, "R-050-09: payload cap");
    assert(value.metrics.import_p95_ms <= caps.import.cap, "R-050-09: import cap");
    assert(value.metrics.construction_p95_ms <= caps.construction.cap, "R-050-09: construction cap");
    assert(value.metrics.request_overhead_p95_ms <= caps.request_overhead.cap, "R-050-10: request cap");
    assert(value.metrics.allocation_delta_bytes_max <= caps.allocation_delta.cap, "R-050-10: allocation cap");
    assert(value.metrics.connection_establishments <= caps.connection_establishments.cap, "R-050-11: reuse cap");
    assert(value.metrics.retained_memory_delta_bytes_p95 <= caps.retained_memory_delta.cap, "R-050-12: retained-memory cap");
    for (const resource of [
      "openConnections", "poolEntries", "timers",
      "callbackRegistrations", "lifecycleRegistrations",
    ]) assert.equal(value.metrics[resource], 0, `R-050-12: ${resource}`);
    for (const sideEffect of [
      "startup_dispatches", "startup_connection_attempts",
      "startup_session_operations", "startup_hidden_transport_creations",
    ]) assert.equal(value.metrics[sideEffect], 0, `R-050-09: ${sideEffect}`);
    assert.equal(value.ownership.default_transport, "client", "R-050-11: default ownership");
    assert.equal(value.ownership.origin_isolation, "PASS", "R-050-11: origin isolation");
    assert.equal(value.ownership.client_isolation, "PASS", "R-050-11: client isolation");
    assert.equal(value.ownership.injected_transport, "caller", "R-050-12: injected ownership");
    assert.equal(value.ownership.cleanup_idempotence, "PASS", "R-050-12: cleanup idempotence");
    assert.equal(/runa_sk_|Authorization\s*:|__runa\/auth\?t=/i.test(JSON.stringify(value)), false,
      "R-050-14: protected evidence");
    return true;
  };
  const report = {
    schema_version: 1,
    status: "PASS",
    identity: {
      artifact_sha256: artifactSha256,
      catalog_sha256: catalogSha256,
      catalog_revision: catalog.catalog_revision,
      matrix_cell: matrixCell?.id ?? null,
      environment_classification: matrixCell === undefined
        ? "local-non-matrix"
        : "exact-matrix-cell",
    },
    runtime: {
      node: process.versions.node,
      npm: localNpmVersion,
      platform: process.platform,
      arch: process.arch,
    },
    tools: catalog.tools,
    profile: {
      id: `${catalog.profile.id_prefix}${matrixCell?.id ?? "local-non-matrix"}`,
      revision: 1,
      baseline_reference: "bootstrap-v1",
      isolated_import_runs: 20,
      isolated_construction_runs: 20,
      isolated_request_invocations: 20,
      sequential_calls: 10,
      cleanup_calls: 2,
      leak_batches: 5,
      cycles_per_batch: 100,
    },
    metrics,
    forced_gc: false,
    ownership: {
      default_transport: "client",
      origin_isolation: "PASS",
      client_isolation: "PASS",
      injected_transport: "caller",
      cleanup_idempotence: "PASS",
    },
    acceptance_tests: [
      "TC-017-02", "TC-017-03", "TC-017-04", "TC-017-05",
      "TC-017-06", "TC-017-07", "TC-017-08",
      "TC-050-05", "TC-050-06", "TC-050-08",
    ],
  };
  evaluate(report);
  const mutationDefinitions = [
    ["artifact", (value) => { value.identity.artifact_sha256 = "0".repeat(64); }],
    ["catalog", (value) => { value.identity.catalog_sha256 = "0".repeat(64); }],
    ["tool", (value) => { value.tools.esbuild = "0.0.0"; }],
    ["profile-fact", (value) => { delete value.profile.isolated_request_invocations; }],
    ["sequence", (value) => { value.profile.sequential_calls = 9; }],
    ["cleanup-sequence", (value) => { value.profile.cleanup_calls = 1; }],
    ["cycles", (value) => { value.profile.cycles_per_batch = 99; }],
    ["forced-gc", (value) => { value.forced_gc = true; }],
    ["payload", (value) => { value.metrics.tarball_bytes = caps.payload.cap + 1; }],
    ["import", (value) => { value.metrics.import_p95_ms = caps.import.cap + 1; }],
    ["construction", (value) => { value.metrics.construction_p95_ms = caps.construction.cap + 1; }],
    ["request", (value) => { value.metrics.request_overhead_p95_ms = caps.request_overhead.cap + 1; }],
    ["allocation", (value) => { value.metrics.allocation_delta_bytes_max = caps.allocation_delta.cap + 1; }],
    ["reuse", (value) => { value.metrics.connection_establishments = 2; }],
    ["retained-memory", (value) => { value.metrics.retained_memory_delta_bytes_p95 = caps.retained_memory_delta.cap + 1; }],
    ["resource", (value) => { value.metrics.openConnections = 1; }],
    ["missing-metric", (value) => { delete value.metrics.request_overhead_p95_ms; }],
    ["startup-work", (value) => { value.metrics.startup_dispatches = 1; }],
    ["origin-isolation", (value) => { value.ownership.origin_isolation = "FAIL"; }],
    ["client-isolation", (value) => { value.ownership.client_isolation = "FAIL"; }],
    ["injected-ownership", (value) => { value.ownership.injected_transport = "client"; }],
    ["cleanup-idempotence", (value) => { value.ownership.cleanup_idempotence = "FAIL"; }],
    ["protected-evidence", (value) => { value.injected = ["runa", "sk", "hostile"].join("_"); }],
  ];
  const mutations = [];
  for (const [name, mutate] of mutationDefinitions) {
    const candidate = JSON.parse(JSON.stringify(report));
    mutate(candidate);
    assert.throws(() => evaluate(candidate));
    mutations.push({ name, status: "REJECTED" });
  }
  report.mutations = mutations;
  const acceptedBaselinePath = "governance/performance-baseline.accepted.json";
  let baselineStatus = "PROPOSED";
  try {
    const accepted = JSON.parse(await readFile(acceptedBaselinePath, "utf8"));
    assert.equal(accepted.status, "ACCEPTED");
    assert.equal(accepted.profile_id, report.profile.id);
    for (const metric of [
      "tarball_bytes", "import_p95_ms", "construction_p95_ms",
      "request_overhead_p95_ms", "allocation_delta_bytes_max",
      "connection_establishments", "retained_memory_delta_bytes_p95",
    ]) assert(report.metrics[metric] <= accepted.metrics[metric],
      `R-017-05: deterioration from accepted baseline:${metric}`);
    baselineStatus = "ACCEPTED";
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir("evidence", { recursive: true });
  await writeFile("evidence/performance-local.json", `${JSON.stringify(report, null, 2)}\n`);
  await writeFile("evidence/performance-baseline-proposal.json", `${JSON.stringify({
    schema_version: 1,
    status: baselineStatus,
    proposal_only: baselineStatus !== "ACCEPTED",
    profile_id: report.profile.id,
    baseline_reference: "bootstrap-v1",
    artifact_sha256: artifactSha256,
    catalog_sha256: catalogSha256,
    metrics,
    acceptance_requires_external_authority: baselineStatus !== "ACCEPTED",
  }, null, 2)}\n`);
  await writeFile("evidence/performance-release-handoff.json", `${JSON.stringify({
    schema_version: 1,
    status: "BLOCKED",
    local_measurements: "PASS",
    blocker: {
      id: "TS-050-AUTH-001",
      decision: "Approve exact six-cell execution, the security-remediated Vitest substitution, and bootstrap baseline promotion.",
      owner: "Runa SDK technical and release owners",
    },
    artifact_sha256: artifactSha256,
    catalog_sha256: catalogSha256,
  }, null, 2)}\n`);
  console.log(`performance: PASS local metrics (${mutations.length} hostile mutations); release authority: BLOCKED`);
} finally {
  releasePrivateFactory?.();
  releaseNodeHarness?.();
  if (server !== undefined) {
    for (const socket of activeServerSockets) socket.destroy();
    server.close();
    await once(server, "close");
  }
  await rm(workspace, { recursive: true, force: true });
  if (generatedArtifact) await rm(artifactPath, { force: true });
}
