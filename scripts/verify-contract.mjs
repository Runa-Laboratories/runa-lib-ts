import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const CANONICAL_CONTRACT_COMMIT = "18cf8ff7d343ccbdbfac1493937bf20f49b238b6";
const CANONICAL_SNAPSHOT_SHA256 = "327c6ccc6a4572929ff737bc8b1af6bd3189e139548af632245ce93118368298";
const CANONICAL_ARTIFACT_MANIFEST_SHA256 = "ff86b646a624063876a28ac5c8766e0b2e52f94f16d94993f5db13d3e24c7507";
const CANONICAL_PROJECTION_SHA256 = "1b6078b566428fcdb21e1913a1fa012955a5a7ab5dac9b429d1f2bac45aa679b";
const CANONICAL_GENERATOR_SHA256 = "75de6242dde7fccfc9251d371020c5dc5ffb96a65399647b6d54d2c8850202e1";
const generatedRoot = path.resolve("src/internal/contract/generated");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function run(file, args, options = {}) {
  try {
    return await execute(file, args, {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      ...options,
    });
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    throw new Error(detail || `${file} ${args.join(" ")} failed.`, { cause: error });
  }
}

function fail(category) {
  console.error(JSON.stringify({
    category,
    requirement: "R-056-20",
    verdict: "blocked",
  }));
  process.exitCode = 1;
}

async function exactGeneratedFiles(manifest, root) {
  const entries = manifest.files;
  if (!Array.isArray(entries) || entries.length === 0) return false;
  const expected = new Map();
  for (const entry of entries) {
    if (entry === null || typeof entry !== "object" ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
        typeof entry.path !== "string" || path.basename(entry.path) !== entry.path ||
        !/^[a-f0-9]{64}$/u.test(entry.sha256) || expected.has(entry.path)) return false;
    expected.set(entry.path, entry);
  }
  const actual = (await readdir(root)).sort();
  const declared = [...expected.keys(), "generated-manifest.json"].sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared)) return false;
  for (const [name, entry] of expected) {
    const bytes = await readFile(path.join(root, name));
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) return false;
  }
  return true;
}

async function main() {
  if (process.versions.node.split(".")[0] !== "24") return fail("canonical-node-version-mismatch");

  const staged = await run("git", ["ls-files", "--stage", "--", "contracts"]);
  const [mode, commit] = staged.stdout.trim().split(/\s+/u);
  if (mode !== "160000" || commit !== CANONICAL_CONTRACT_COMMIT) {
    return fail("canonical-gitlink-mismatch");
  }
  const [head, dirty] = await Promise.all([
    run("git", ["rev-parse", "HEAD"], { cwd: "contracts" }),
    run("git", ["status", "--porcelain"], { cwd: "contracts" }),
  ]);
  if (head.stdout.trim() !== CANONICAL_CONTRACT_COMMIT || dirty.stdout.trim() !== "") {
    return fail("canonical-checkout-mismatch");
  }
  try {
    await run(process.execPath, ["tools/verify-contract.mjs"], { cwd: "contracts" });
  } catch {
    return fail("canonical-currentness-failed");
  }

  const snapshotBytes = await readFile("contracts/runa-sdk-contract.snapshot.json");
  const artifactManifestBytes = await readFile("contracts/artifact-manifest.json");
  const projectionBytes = await readFile("contracts/runa-sdk-contract.prd002-projection.json");
  const generatorBytes = await readFile("contracts/tools/runa-contract-generator.mjs");
  if (sha256(snapshotBytes) !== CANONICAL_SNAPSHOT_SHA256) return fail("snapshot-digest-mismatch");
  if (sha256(artifactManifestBytes) !== CANONICAL_ARTIFACT_MANIFEST_SHA256) return fail("artifact-manifest-digest-mismatch");
  if (sha256(projectionBytes) !== CANONICAL_PROJECTION_SHA256) return fail("projection-digest-mismatch");
  if (sha256(generatorBytes) !== CANONICAL_GENERATOR_SHA256) return fail("generator-digest-mismatch");

  const provenance = JSON.parse(await readFile(
    "contracts/runa-sdk-contract.provenance.json", "utf8",
  ));
  const sha = /^[a-f0-9]{40}$/u;
  const pullRequest = /^https:\/\/github\.com\/Runa-Laboratories\/runa-sdk-contract\/pull\/\d+$/u;
  const approval = provenance.approval_reference;
  if (provenance.schema_version !== 3 || provenance.status !== "APPROVED" ||
      provenance.canonical_repository !== "Runa-Laboratories/runa-sdk-contract" ||
      !sha.test(provenance.canonical_ref ?? "") || !sha.test(provenance.source_revision ?? "") ||
      approval === null || typeof approval !== "object" ||
      approval.contract_merge_commit_sha !== provenance.canonical_ref ||
      approval.prd002_merge_commit_sha !== provenance.canonical_ref ||
      !pullRequest.test(approval.contract_pull_request_url ?? "") ||
      !pullRequest.test(approval.prd002_pull_request_url ?? "") ||
      provenance.artifacts?.snapshot?.sha256 !== CANONICAL_SNAPSHOT_SHA256 ||
      provenance.artifacts?.contract_projection?.sha256 !== CANONICAL_PROJECTION_SHA256 ||
      provenance.generator_identity?.path !== "tools/runa-contract-generator.mjs" ||
      provenance.generator_identity?.node_major !== 24 ||
      provenance.generator_identity?.sha256 !== CANONICAL_GENERATOR_SHA256 ||
      provenance.generator_identity?.git_commit_sha !== provenance.canonical_ref) {
    return fail("canonical-approval-missing");
  }

  const manifestBytes = await readFile(path.join(generatedRoot, "generated-manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  const expectedGenerator = {
    path: provenance.generator_identity.path,
    sha256: provenance.generator_identity.sha256,
    version: provenance.generator_identity.version,
  };
  if (manifest.schema_version !== 1 || manifest.language !== "typescript" ||
      manifest.snapshot?.path !== "runa-sdk-contract.snapshot.json" ||
      manifest.snapshot?.sha256 !== CANONICAL_SNAPSHOT_SHA256 ||
      JSON.stringify(manifest.generator) !== JSON.stringify(expectedGenerator) ||
      !(await exactGeneratedFiles(manifest, generatedRoot))) {
    return fail("generated-manifest-mismatch");
  }

  const temporary = await mkdtemp(path.join(tmpdir(), "runa-typescript-contract-"));
  try {
    const cleanRoot = path.join(temporary, "src", "internal", "contract", "generated");
    try {
      await run(process.execPath, [
        path.resolve("contracts/tools/runa-contract-generator.mjs"),
        "--language", "typescript",
        "--output", cleanRoot,
      ]);
    } catch {
      return fail("canonical-regeneration-failed");
    }
    const regenerated = (await readdir(cleanRoot)).sort();
    const committed = (await readdir(generatedRoot)).sort();
    if (JSON.stringify(regenerated) !== JSON.stringify(committed)) {
      return fail("canonical-regeneration-file-set-drift");
    }
    for (const name of committed) {
      const [left, right] = await Promise.all([
        readFile(path.join(generatedRoot, name)),
        readFile(path.join(cleanRoot, name)),
      ]);
      if (!left.equals(right)) return fail("canonical-regeneration-drift");
    }

    const attestationPath = path.join(temporary, "typescript-contract-attestation.json");
    try {
      await run(process.execPath, [
        path.resolve("contracts/tools/emit-release-attestation.mjs"),
        "--language", "typescript",
        "--generated-root", cleanRoot,
        "--source-revision", provenance.source_revision,
        "--output", attestationPath,
      ]);
    } catch {
      return fail("contract-attestation-failed");
    }
    if ((await stat(attestationPath)).size === 0) return fail("contract-attestation-empty");
    const attestation = JSON.parse(await readFile(attestationPath, "utf8"));
    if (attestation.status !== "PASS" || attestation.language !== "typescript" ||
        attestation.source_revision !== provenance.source_revision ||
        attestation.digests?.snapshot !== CANONICAL_SNAPSHOT_SHA256 ||
        attestation.digests?.artifact_manifest !== CANONICAL_ARTIFACT_MANIFEST_SHA256 ||
        attestation.digests?.projection !== CANONICAL_PROJECTION_SHA256 ||
        attestation.generator_identity?.sha256 !== CANONICAL_GENERATOR_SHA256 ||
        attestation.digests?.generated_file_manifest !== sha256(manifestBytes)) {
      return fail("contract-attestation-invalid");
    }
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }

  console.log(JSON.stringify({
    artifactManifestSha256: CANONICAL_ARTIFACT_MANIFEST_SHA256,
    contractCommit: CANONICAL_CONTRACT_COMMIT,
    generatorSha256: CANONICAL_GENERATOR_SHA256,
    requirement: "R-056-20",
    snapshotSha256: CANONICAL_SNAPSHOT_SHA256,
    verdict: "pass",
  }));
}

await main();
