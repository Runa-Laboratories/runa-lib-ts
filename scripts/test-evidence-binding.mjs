import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadPrdCatalog } from "./prd-catalog.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function filesBelow(root, predicate = () => true) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(target, predicate));
    else if (predicate(target)) output.push(target.replaceAll("\\", "/"));
  }
  return output;
}

async function digestFiles(files) {
  const digest = createHash("sha256");
  for (const file of [...files].sort()) {
    digest.update(`${file}\0`);
    digest.update(await readFile(file));
    digest.update("\0");
  }
  return digest.digest("hex");
}

export async function computeTestEvidenceBinding() {
  const implementationFiles = [
    ...await filesBelow("src"),
    ...await filesBelow("test"),
    ...await filesBelow("scripts", (file) => file.endsWith(".mjs")),
    "package.json", "package-lock.json", "tsconfig.json", "tsconfig.build.json",
    "tsconfig.type-tests.json", "vitest.config.ts",
  ];
  const prdCatalog = await loadPrdCatalog();
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  return {
    source_commit: process.env.GITHUB_SHA ?? execFileSync(
      "git", ["rev-parse", "HEAD"], { encoding: "utf8" },
    ).trim(),
    test_input_sha256: await digestFiles(implementationFiles),
    prd_source_sha256: prdCatalog.digest,
    package_lock_sha256: sha256(await readFile("package-lock.json")),
    toolchain: {
      node: process.version,
      vitest: packageJson.devDependencies.vitest,
    },
  };
}
