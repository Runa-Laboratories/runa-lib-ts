import { createHash, verify } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const blockers = [];
const readJson = async (file, gate) => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    blockers.push({ gate, reason: `Missing or invalid evidence: ${file}` });
    return undefined;
  }
};
const requirePass = async (file, gate) => {
  const value = await readJson(file, gate);
  if (value !== undefined && value.status !== "PASS") {
    blockers.push({ gate, reason: `${file} does not record PASS.` });
  }
  return value;
};
let trustPolicy;
try {
  trustPolicy = JSON.parse(await readFile("governance/release-trust.json", "utf8"));
} catch {
  trustPolicy = undefined;
}
const requireTrusted = async (file, gate, role) => {
  const envelope = await readJson(file, gate);
  if (envelope === undefined) return undefined;
  if (trustPolicy === undefined || trustPolicy.schema_version !== 1) {
    blockers.push({ gate, reason: "No accepted release trust root is configured." });
    return undefined;
  }
  const key = trustPolicy.keys?.find((item) => item.key_id === envelope.key_id && item.role === role);
  const exactEnvelope = ["key_id", "payload", "schema_version", "signature"].sort();
  if (envelope.schema_version !== 1 || Object.keys(envelope).sort().join() !== exactEnvelope.join() ||
      key === undefined || typeof envelope.signature !== "string" ||
      !verify(null, Buffer.from(JSON.stringify(envelope.payload)), key.public_key_pem,
        Buffer.from(envelope.signature, "base64"))) {
    blockers.push({ gate, reason: "Evidence signature or role authorization is invalid." });
    return undefined;
  }
  const issued = Date.parse(envelope.payload.issued_at);
  const expires = Date.parse(envelope.payload.expires_at);
  const now = Date.now();
  if (envelope.payload.status !== "PASS" || !Number.isFinite(issued) ||
      !Number.isFinite(expires) || issued > now || expires <= now ||
      expires - issued > trustPolicy.maximum_validity_ms) {
    blockers.push({ gate, reason: "Evidence is failed, stale, future-dated, or exceeds freshness policy." });
    return undefined;
  }
  return envelope.payload;
};
const projection = await readFile("contracts/runa-sdk.projection.json");
const projectionSha = createHash("sha256").update(projection).digest("hex");
const provenance = await requirePass("contracts/runa-sdk-contract.provenance.json", "canonical-contract-provenance");
if (provenance !== undefined && provenance.projection_sha256 !== projectionSha) {
  blockers.push({ gate: "canonical-contract-provenance", reason: "Projection digest does not match provenance." });
}
const license = await readFile("LICENSE", "utf8");
if (license.startsWith("NON-GA LICENSE PLACEHOLDER")) {
  blockers.push({ gate: "license-approval", reason: "LICENSE remains the non-GA placeholder." });
}
const candidate = await readJson("release-artifacts/candidate.json", "candidate-identity");
if (candidate !== undefined) {
  try {
    const archive = await readFile(`release-artifacts/${candidate.filename}`);
    const digest = createHash("sha256").update(archive).digest("hex");
    if (digest !== candidate.sha256) throw new Error();
  } catch {
    blockers.push({ gate: "candidate-identity", reason: "Candidate archive is absent or its digest differs." });
  }
  if (candidate.source_tree_clean !== true || typeof candidate.source_commit !== "string") {
    blockers.push({ gate: "candidate-identity", reason: "Candidate is not bound to a clean source commit." });
  }
}
const quality = await requirePass("evidence/quality-gate.json", "quality");
if (quality !== undefined && candidate !== undefined &&
    quality.commit_sha !== candidate.source_commit) {
  blockers.push({ gate: "quality", reason: "Quality evidence is not bound to the candidate source commit." });
}
const matrix = await requireTrusted("evidence/compatibility-matrix.json", "compatibility-matrix", "compatibility");
if (matrix !== undefined && (!Array.isArray(matrix.cells) || matrix.cells.length !== 6 ||
    matrix.cells.some((cell) => cell.status !== "PASS"))) {
  blockers.push({ gate: "compatibility-matrix", reason: "The six exact matrix cells are not all PASS." });
}
if (matrix !== undefined && candidate !== undefined && matrix.candidate_sha256 !== candidate.sha256) {
  blockers.push({ gate: "compatibility-matrix", reason: "Matrix evidence is not bound to the candidate archive." });
}
const repository = await requireTrusted("evidence/repository-controls.json", "repository-controls", "repository-controls");
if (repository !== undefined && candidate !== undefined && repository.commit_sha !== candidate.source_commit) {
  blockers.push({ gate: "repository-controls", reason: "Repository-control evidence is not bound to the candidate source commit." });
}
const crossLanguage = await requireTrusted("evidence/cross-language.json", "cross-language", "cross-language");
if (crossLanguage !== undefined && provenance !== undefined &&
    crossLanguage.canonical_contract_sha256 !== provenance.canonical_contract_sha256) {
  blockers.push({ gate: "cross-language", reason: "Cross-language evidence is not bound to the canonical contract." });
}
const publication = await requireTrusted("evidence/publication-readiness.json", "publication-readiness", "publication");
if (publication !== undefined && candidate !== undefined && publication.candidate_sha256 !== candidate.sha256) {
  blockers.push({ gate: "publication-readiness", reason: "Publication evidence is not bound to the candidate archive." });
}
const dependency = await requirePass("evidence/dependency-audit.json", "dependencies");
if (dependency !== undefined && ((dependency.vulnerabilities?.critical ?? 0) > 0 ||
    (dependency.vulnerabilities?.high ?? 0) > 0)) {
  blockers.push({ gate: "dependencies", reason: "High or critical dependency vulnerabilities remain." });
}
const report = {
  schema_version: 2,
  decision: blockers.length === 0 ? "PASS" : "BLOCKED",
  projection_sha256: projectionSha,
  candidate_sha256: candidate?.sha256 ?? null,
  blockers: blockers.map((blocker, index) => ({ id: `TS-REL-${String(index + 1).padStart(3, "0")}`, ...blocker }))
};
await writeFile("evidence/release-readiness.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(`release readiness: ${report.decision} (${blockers.length} unresolved gates)`);
if (blockers.length > 0) process.exit(2);
