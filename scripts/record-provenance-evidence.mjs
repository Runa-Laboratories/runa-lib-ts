import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { validateAttestationJsonl } from "./attestation-bundle.mjs";

const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
const input = process.env.RUNA_ATTESTATION_BUNDLE;
assert.equal(typeof input, "string");
const bytes = await readFile(input);
assert.equal(validateAttestationJsonl(bytes.toString("utf8"), candidate), true);
const filename = `${candidate.filename}.intoto.jsonl`;
const verifierBytes = await readFile("evidence/provenance-verifier.json");
const verifier = JSON.parse(verifierBytes.toString("utf8"));
assert.equal(verifier.status, "PASS");
assert.equal(verifier.candidate_sha256, candidate.sha256);
assert.match(process.env.RUNA_ATTESTATION_ID ?? "", /^[A-Za-z0-9._:-]+$/u);
assert.match(process.env.RUNA_ATTESTATION_URL ?? "",
  /^https:\/\/github\.com\/Runa-Laboratories\/runa-lib-ts\/attestations\/[A-Za-z0-9._:-]+$/u);
await mkdir("evidence", { recursive: true });
await writeFile(`evidence/${filename}`, bytes);
await writeFile("evidence/provenance-manifest.json", `${JSON.stringify({
  schema_version: 1,
  status: "PASS",
  filename,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  subject: { filename: candidate.filename, sha256: candidate.sha256 },
  predicate_type: "https://slsa.dev/provenance/v1",
  generator: "actions/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d",
  signer_workflow: "Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml",
  verifier: "gh attestation verify <artifact> --repo Runa-Laboratories/runa-lib-ts --signer-workflow Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml",
  verifier_receipt_sha256: createHash("sha256").update(verifierBytes).digest("hex"),
  source_commit: verifier.source_commit,
  intended_tag: verifier.intended_tag,
  lockfile_sha256: verifier.lockfile_sha256,
  build_definition_sha256: verifier.build_definition_sha256,
  builder_identity: verifier.builder_identity,
  build_started_at: verifier.build_started_at,
  build_finished_at: verifier.build_finished_at,
  verified_at: verifier.verified_at,
  predicate_sha256: verifier.predicate_sha256,
  attestation_id: process.env.RUNA_ATTESTATION_ID,
  attestation_url: process.env.RUNA_ATTESTATION_URL,
}, null, 2)}\n`);
console.log(`controlled provenance: PASS (${filename})`);
