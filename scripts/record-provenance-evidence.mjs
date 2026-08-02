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
await mkdir("evidence", { recursive: true });
await writeFile(`evidence/${filename}`, bytes);
await writeFile("evidence/provenance-manifest.json", `${JSON.stringify({
  schema_version: 1,
  status: "PASS",
  filename,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  subject: { filename: candidate.filename, sha256: candidate.sha256 },
  predicate_type: "https://slsa.dev/provenance/v1",
  generator: "actions/attest-build-provenance@0f67c3f4856b2e3261c31976d6725780e5e4c373",
  signer_workflow: "Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml",
  verifier: "gh attestation verify <artifact> --repo Runa-Laboratories/runa-lib-ts --signer-workflow Runa-Laboratories/runa-lib-ts/.github/workflows/ci.yml",
  verifier_receipt_sha256: createHash("sha256").update(verifierBytes).digest("hex"),
}, null, 2)}\n`);
console.log(`controlled provenance: PASS (${filename})`);
