import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { npmSpawnSync } from "./npm-process.mjs";

await rm("release-artifacts", { recursive: true, force: true });
await mkdir("release-artifacts");
const npmPack = npmSpawnSync([
  "pack", "--json", "--ignore-scripts", "--pack-destination", "release-artifacts",
]);
if (npmPack.status !== 0) throw new Error("Candidate package creation failed.");
const [metadata] = JSON.parse(npmPack.stdout);
const archive = await readFile(`release-artifacts/${metadata.filename}`);
const sourceCommit = process.env.GITHUB_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const sourceTreeClean = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8"
}).trim() === "";
const manifest = {
  schema_version: 1,
  package: metadata.name,
  version: metadata.version,
  filename: metadata.filename,
  size: archive.byteLength,
  sha256: createHash("sha256").update(archive).digest("hex"),
  source_commit: sourceCommit,
  source_tree_clean: sourceTreeClean
};
await writeFile("release-artifacts/candidate.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${manifest.filename} ${manifest.sha256}`);
