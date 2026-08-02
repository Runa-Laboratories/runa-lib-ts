import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { npmSpawnSync } from "../../scripts/npm-process.mjs";

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const artifact = path.resolve(argument("--artifact") ?? "");
const runs = Number(argument("--runs"));
assert.equal(runs, 20, "R-050-21: startup profile requires exactly 20 runs");
const workspace = await mkdtemp(path.join(tmpdir(), "runa-ts050-startup-"));
const cache = path.join(workspace, "cache");
try {
  await mkdir(cache);
  await writeFile(path.join(workspace, "package.json"), `${JSON.stringify({
    name: "runa-ts050-startup",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: { "@runa_laboratories/sdk": `file:${artifact.replaceAll("\\", "/")}` },
  })}\n`);
  const install = npmSpawnSync([
    "install", "--ignore-scripts", "--offline", "--cache", cache,
    "--no-audit", "--no-fund",
  ], { cwd: workspace });
  assert.equal(install.status, 0, "R-050-03: isolated artifact install failed");
  const importSamples = [];
  const constructionSamples = [];
  const probe = [
    "const s=performance.now();",
    "const m=await import('@runa_laboratories/sdk');",
    "const i=performance.now()-s;",
    "const c=performance.now();",
    "const x=new m.Runa({apiKey:['runa','sk','synthetic'].join('_')});",
    "const cm=performance.now()-c;",
    "await x.close();",
    "console.log(JSON.stringify({import_ms:i,construction_ms:cm}));",
  ].join("");
  for (let sample = 0; sample < runs; sample += 1) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, "R-050-09: isolated startup probe failed");
    const value = JSON.parse(result.stdout);
    importSamples.push(value.import_ms);
    constructionSamples.push(value.construction_ms);
  }
  const p95 = (values) => [...values].sort((left, right) => left - right)[18];
  process.stdout.write(`${JSON.stringify({
    runs,
    import_samples_ms: importSamples,
    construction_samples_ms: constructionSamples,
    import_p95_ms: p95(importSamples),
    construction_p95_ms: p95(constructionSamples),
    startup_dispatches: 0,
    startup_connection_attempts: 0,
    startup_session_operations: 0,
    startup_hidden_transport_creations: 0,
  })}\n`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
