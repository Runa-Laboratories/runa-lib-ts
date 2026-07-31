import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { npmSpawn } from "./npm-process.mjs";

const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
const archivePath = path.resolve("release-artifacts", candidate.filename);
const archive = await readFile(archivePath);
assert.equal(createHash("sha256").update(archive).digest("hex"), candidate.sha256);
assert.equal(candidate.package, "@runa/sdk");

const collect = (child) => new Promise((resolve, reject) => {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (status) => resolve({ status, stdout, stderr }));
});
const npm = (arguments_, cwd) => collect(npmSpawn(arguments_, {
  cwd,
  env: { ...process.env, npm_config_update_notifier: "false" },
}));
const runNode = (arguments_, cwd, env) => collect(spawn(process.execPath, arguments_, {
  cwd,
  env,
  stdio: ["ignore", "pipe", "pipe"],
}));

const runnerSource = String.raw`
import assert from "node:assert/strict";
import { Runa } from "@runa/sdk";

const journey = process.argv[2];
const sessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const session = {
  id: sessionId, user_id: userId, slug: "synthetic-session",
  name: "Synthetic session", agent: "codex", vcpus: 2, memory_mib: 4096,
  status: "running", running_seconds: 7,
  created_at: "2026-07-30T00:00:00Z", updated_at: "2026-07-30T00:00:01Z",
  url: "https://synthetic-session.runacode.cloud"
};
const calls = [];
let cleanup = "not-required";
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json; charset=utf-8" }
});
const fetch = async (url, init) => {
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://sdk.example.invalid");
  const route = parsed.pathname;
  if (route === "/v1/me" && init.method === "GET") {
    return json({ id: userId, email: "sdk@example.invalid",
      workspace: { assigned: false, waitlist_position: 0 } });
  }
  if (route === "/v1/records" && init.method === "GET") {
    return json([{ id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      session_id: sessionId, kind: "synthetic", summary: "Synthetic record.",
      detail: { nested_key: ["unchanged"] }, created_at: "2026-07-30T00:00:02Z" }]);
  }
  if (route === "/v1/sessions" && init.method === "POST") return json(session, 201);
  if (route.endsWith("/exec") && init.method === "POST") {
    return json({ exit_code: 0, stdout: "ok", stderr: "", duration_ms: 1,
      stdout_truncated: false, stderr_truncated: false });
  }
  if (route.endsWith("/checkpoint") && init.method === "POST") return json({ ok: true });
  if (route.endsWith("/open") && init.method === "POST") {
    return json({ url: "https://synthetic-session.runacode.cloud/__runa/auth?t=synthetic" });
  }
  if (init.method === "DELETE") return json({ ok: true });
  if (init.method === "POST" && /\/(pause|resume|stop|start)$/.test(route)) return json(session);
  throw new Error("Unexpected synthetic route.");
};

const started = performance.now();
const runa = new Runa({
  apiKey: ["runa", "sk", "synthetic"].join("_"),
  baseUrl: "https://sdk.example.invalid",
  fetch
});
try {
  if (journey === "ttfc") {
    calls.push("Runa", "me");
    await runa.me();
  } else if (journey === "first-session") {
    calls.push("Runa", "sessions.create");
    const created = await runa.sessions.create("first-session");
    calls.push("session.delete");
    await created.delete();
    cleanup = "pass";
  } else if (journey === "first-exec") {
    calls.push("Runa", "sessions.create");
    const created = await runa.sessions.create("first-exec");
    try {
      calls.push("session.exec");
      const result = await created.exec("true");
      assert.equal(result.exitCode, 0);
    } finally {
      calls.push("session.delete");
      await created.delete();
      cleanup = "pass";
    }
  } else if (journey === "session-lifecycle-checkpoint") {
    calls.push("Runa", "sessions.create");
    const created = await runa.sessions.create("session-lifecycle-checkpoint");
    try {
      calls.push("session.pause"); await created.pause();
      calls.push("session.resume"); await created.resume();
      calls.push("session.stop"); await created.stop();
      calls.push("session.start"); await created.start();
      calls.push("session.checkpoint"); await created.checkpoint("smoke");
    } finally {
      calls.push("session.delete");
      await created.delete();
      cleanup = "pass";
    }
  } else if (journey === "read-and-open-boundary") {
    calls.push("Runa", "records.list");
    const records = await runa.records.list();
    assert.equal(Array.isArray(records), true);
    calls.push("sessions.create");
    const created = await runa.sessions.create("read-and-open-boundary");
    try {
      calls.push("session.open");
      await created.open();
    } finally {
      calls.push("session.delete");
      await created.delete();
      cleanup = "pass";
    }
  } else {
    throw new Error("Unknown journey.");
  }
} finally {
  await runa.close();
}
process.stdout.write(JSON.stringify({
  journey, calls, outcome: "structural-pass", cleanup,
  elapsed_ms: performance.now() - started
}));
`;

const journeys = [
  "ttfc",
  "first-session",
  "first-exec",
  "session-lifecycle-checkpoint",
  "read-and-open-boundary",
];
const results = Object.fromEntries(journeys.map((journey) => [journey, []]));
let cleanRooms = 0;
const installManifest = `${JSON.stringify({
  private: true,
  type: "module",
  dependencies: { "@runa/sdk": `file:${archivePath.replaceAll("\\", "/")}` },
})}\n`;
const lockRoom = await mkdtemp(path.join(tmpdir(), "runa-ts054-lock-"));
let lockBefore;
try {
  const cache = path.join(lockRoom, "cache");
  await mkdir(cache);
  await writeFile(path.join(lockRoom, "package.json"), installManifest);
  const lock = await npm([
    "install", "--package-lock-only", "--ignore-scripts", "--offline",
    "--cache", cache, "--no-audit", "--no-fund", "--package-lock=true",
  ], lockRoom);
  assert.equal(lock.status, 0, "R-054-03: exact offline lock creation failed.");
  lockBefore = await readFile(path.join(lockRoom, "package-lock.json"));
  const lockJson = JSON.parse(lockBefore);
  assert.equal(lockJson.packages["node_modules/@runa/sdk"].version, candidate.version);
  assert.match(lockJson.packages["node_modules/@runa/sdk"].resolved,
    new RegExp(`${candidate.filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
} finally {
  await rm(lockRoom, { recursive: true, force: true });
}

const tasks = [];
for (let run = 0; run < 30; run += 1) {
  for (const journey of journeys) tasks.push({ run, journey });
}
const execute = async ({ run, journey }) => {
  const workspace = await mkdtemp(path.join(tmpdir(), `runa-ts054-${run}-`));
  try {
    const cache = path.join(workspace, "cache");
    await mkdir(cache);
    await writeFile(path.join(workspace, "package.json"), installManifest);
    await writeFile(path.join(workspace, "package-lock.json"), lockBefore);
    const install = await npm([
      "ci", "--ignore-scripts", "--offline", "--cache", cache,
      "--no-audit", "--no-fund",
    ], workspace);
    assert.equal(install.status, 0, "R-054-03: exact offline install failed.");
    assert.deepEqual(await readFile(path.join(workspace, "package-lock.json")), lockBefore);
    const installed = JSON.parse(await readFile(
      path.join(workspace, "node_modules/@runa/sdk/package.json"), "utf8"));
    assert.equal(installed.name, candidate.package);
    assert.equal(installed.version, candidate.version);
    assert.equal(Object.keys(installed.dependencies ?? {}).length, 0);
    await writeFile(path.join(workspace, "runner.mjs"), runnerSource);
    const probe = await runNode(["runner.mjs", journey], workspace, {
      ...process.env,
      RUNA_API_KEY: "",
      RUNA_BASE_URL: "",
    });
    assert.equal(probe.status, 0, `R-054-05: ${journey} failed.`);
    const result = JSON.parse(probe.stdout);
    assert.equal(result.journey, journey);
    assert.equal(result.outcome, "structural-pass");
    if (journey !== "ttfc") assert.equal(result.cleanup, "pass");
    results[journey].push(result);
    cleanRooms += 1;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
};
let nextTask = 0;
const worker = async () => {
  for (;;) {
    const index = nextTask;
    nextTask += 1;
    if (index >= tasks.length) return;
    await execute(tasks[index]);
  }
};
await Promise.all(Array.from({ length: 12 }, worker));

for (const journey of journeys) assert.equal(results[journey].length, 30);
await mkdir("evidence", { recursive: true });
await writeFile("evidence/release-smoke.json", `${JSON.stringify({
  schema_version: 2,
  status: "PASS",
  candidate_sha256: candidate.sha256,
  candidate_package: candidate.package,
  candidate_version: candidate.version,
  synthetic: true,
  clean_room_count: cleanRooms,
  runs_per_journey: 30,
  journeys: Object.fromEntries(journeys.map((journey) => [journey, {
    passed: results[journey].length,
    public_calls: results[journey][0].calls,
    cleanup: results[journey][0].cleanup,
    elapsed_ms: results[journey].map((result) => result.elapsed_ms),
  }])),
  public_network_dispatches: 0,
}, null, 2)}\n`);
console.log(`release smoke: PASS (5 x 30 clean rooms, ${candidate.sha256})`);
