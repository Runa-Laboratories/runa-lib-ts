import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";

await rm("release-artifacts", { recursive: true, force: true });
await mkdir("release-artifacts");
const npmPack = process.platform === "win32"
  ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c",
      "npm pack --json --ignore-scripts --pack-destination release-artifacts"], { encoding: "utf8" })
  : spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", "release-artifacts"], { encoding: "utf8" });
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
