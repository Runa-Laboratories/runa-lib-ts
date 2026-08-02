import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { npmSpawnSync } from "./npm-process.mjs";

await rm("release-artifacts", { recursive: true, force: true });
await mkdir("release-artifacts");
const buildStartedAt = new Date().toISOString();
const npmPack = npmSpawnSync([
  "pack", "--json", "--ignore-scripts", "--pack-destination", "release-artifacts",
]);
if (npmPack.status !== 0) throw new Error("Candidate package creation failed.");
const buildFinishedAt = new Date().toISOString();
const [metadata] = JSON.parse(npmPack.stdout);
const archive = await readFile(`release-artifacts/${metadata.filename}`);
const sourceCommit = process.env.GITHUB_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const generatedOutputRoots = ["evidence/", "release-artifacts/"];
const worktreeEntries = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  { encoding: "utf8" },
).split(/\r?\n/u).filter(Boolean);
const sourceTreeChanges = worktreeEntries.filter((entry) => {
  const renderedPath = entry.slice(3).replaceAll("\\", "/");
  const paths = renderedPath.includes(" -> ")
    ? renderedPath.split(" -> ")
    : [renderedPath];
  return paths.some((candidatePath) =>
    !generatedOutputRoots.some((root) => candidatePath.startsWith(root))
  );
});
const sourceTreeClean = sourceTreeChanges.length === 0;
const manifest = {
  schema_version: 1,
  package: metadata.name,
  version: metadata.version,
  filename: metadata.filename,
  size: archive.byteLength,
  sha256: createHash("sha256").update(archive).digest("hex"),
  source_commit: sourceCommit,
  source_tree_clean: sourceTreeClean,
  source_change_count: sourceTreeChanges.length,
  generated_output_roots: generatedOutputRoots,
  build_started_at: buildStartedAt,
  build_finished_at: buildFinishedAt,
};
if (Date.parse(manifest.build_finished_at) < Date.parse(manifest.build_started_at)) {
  throw new Error("Candidate build timestamps are invalid.");
}
await writeFile("release-artifacts/candidate.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${manifest.filename} ${manifest.sha256}`);
