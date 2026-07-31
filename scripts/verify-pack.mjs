import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { npmSpawnSync } from "./npm-process.mjs";

const commandOptions = { encoding: "utf8" };
const npmRun = (arguments_, options = {}) =>
  npmSpawnSync(arguments_, { ...commandOptions, ...options });
const packed = npmRun(["pack", "--json", "--ignore-scripts"]);
if (packed.status !== 0) throw new Error("Package creation failed.");
const [metadata] = JSON.parse(packed.stdout);
assert(metadata.size <= 1_048_576);
const allowed = /^(?:package\/)?(?:package\.json|README\.md|LICENSE|dist\/.+)$/;
for (const file of metadata.files) assert.match(file.path, allowed);
const archive = path.resolve(metadata.filename);
const bytes = await readFile(archive);
const workspace = await mkdtemp(path.join(tmpdir(), "runa-sdk-pack-"));
try {
  await writeFile(path.join(workspace, "package.json"), `${JSON.stringify({
    private: true,
    type: "module",
    dependencies: { "@runa/sdk": `file:${archive.replaceAll("\\", "/")}` }
  })}\n`);
  const install = npmRun(["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: workspace });
  assert.equal(install.status, 0);
  const probe = spawnSync(process.execPath, ["--input-type=module", "-e",
    "import('@runa/sdk').then(m=>{if(Object.keys(m).length!==8)process.exit(2)})"], {
    cwd: workspace, encoding: "utf8"
  });
  assert.equal(probe.status, 0);
  console.log(`pack: PASS (${metadata.size} bytes, sha256 ${createHash("sha256").update(bytes).digest("hex")})`);
} finally {
  await rm(workspace, { recursive: true, force: true });
  await rm(archive, { force: true });
}
