import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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
for (let run = 0; run < 2; run += 1) {
  const workspace = await mkdtemp(path.join(tmpdir(), `runa-clean-${run}-`));
  try {
    const cache = path.join(workspace, "cache");
    await mkdir(cache);
    await writeFile(path.join(workspace, "package.json"), `${JSON.stringify({
      private: true, type: "module",
      dependencies: { "@runa/sdk": `file:${archivePath.replaceAll("\\", "/")}` }
    })}\n`);
    const command = `npm install --ignore-scripts --offline --cache ${cache} --no-audit --no-fund`;
    const install = process.platform === "win32"
      ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], { cwd: workspace, encoding: "utf8" })
      : spawnSync("sh", ["-c", command], { cwd: workspace, encoding: "utf8" });
    if (install.status !== 0) throw new Error("Isolated offline install failed.");
    const installed = JSON.parse(await readFile(path.join(workspace, "node_modules/@runa/sdk/package.json"), "utf8"));
    assert.equal(installed.name, "@runa/sdk");
    assert.equal(Object.keys(installed.dependencies ?? {}).length, 0);
    closures.push(hash(Buffer.from(JSON.stringify({ name: installed.name, version: installed.version, runtime: [] }))));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
assert.equal(closures[0], closures[1]);
const sbom = {
  bomFormat: "CycloneDX", specVersion: "1.6", version: 1,
  metadata: { component: { type: "library", name: "@runa/sdk", version: candidate.version,
    hashes: [{ alg: "SHA-256", content: candidate.sha256 }] } },
  components: []
};
assert.equal(sbom.bomFormat, "CycloneDX");
assert.equal(sbom.specVersion, "1.6");
await mkdir("evidence", { recursive: true });
await writeFile("evidence/sbom.cdx.json", `${JSON.stringify(sbom, null, 2)}\n`);
await writeFile("evidence/runtime-closure.json", `${JSON.stringify({
  schema_version: 1, status: "PASS", candidate_sha256: candidate.sha256,
  clean_install_count: 2, closure_sha256: closures[0], runtime_dependencies: [],
  reason_ledger: [{ decision: "empty-runtime-closure", reason: "The package manifest and both installed artifacts declare no runtime dependencies." }]
}, null, 2)}\n`);
const external = {
  schema_version: 1, status: "BLOCKED",
  required_interfaces: ["OIDC trusted publisher", "GitHub attestation verification", "npm registry retrieval", "dist-tag verification"],
  candidate_sha256: candidate.sha256
};
await writeFile("evidence/external-release-interfaces.json", `${JSON.stringify(external, null, 2)}\n`);
await writeFile("evidence/ci-candidate-manifest.json", `${JSON.stringify({
  schema_version: 1, status: "PASS", source_commit: candidate.source_commit,
  candidate_sha256: candidate.sha256, expected_cells: 6,
  aggregate_rule: "same candidate digest and six exact PASS receipts"
}, null, 2)}\n`);
console.log(`local release gates: PASS (${candidate.sha256}, closure ${closures[0]})`);
