import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tag = process.env.RUNA_RELEASE_TAG;
const configured = JSON.parse(process.env.RUNA_RELEASE_ASSETS_JSON ?? "[]");
assert.match(tag ?? "", /^ts-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
assert(Array.isArray(configured) && configured.length >= 5);
const names = configured.map((file) => path.basename(file));
assert.equal(new Set(names).size, names.length);
const view = spawnSync("gh", [
  "release", "view", tag, "--json", "assets,tagName",
], { encoding: "utf8" });
assert.equal(view.status, 0, view.stderr);
const release = JSON.parse(view.stdout);
assert.equal(release.tagName, tag);
assert.deepEqual(release.assets.map((asset) => asset.name).sort(), [...names].sort());
const directory = await mkdtemp(path.join(tmpdir(), "runa-release-assets-"));
try {
  for (const [index, file] of configured.entries()) {
    const result = spawnSync("gh", [
      "release", "download", tag, "--pattern", names[index], "--dir", directory,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const local = await readFile(file);
    const downloaded = await readFile(path.join(directory, names[index]));
    assert.equal(createHash("sha256").update(downloaded).digest("hex"),
      createHash("sha256").update(local).digest("hex"));
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log(`GitHub release assets: PASS (${tag}, ${names.length})`);
