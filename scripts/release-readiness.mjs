import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { verifyTrustedEnvelope } from "./trusted-evidence.mjs";

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
  const payload = verifyTrustedEnvelope(envelope, trustPolicy, role);
  if (payload === undefined) {
    blockers.push({ gate, reason: "Evidence signature, role, status, or freshness is invalid." });
    return undefined;
  }
  return payload;
};
const projection = await readFile("contracts/runa-sdk.projection.json");
const projectionSha = createHash("sha256").update(projection).digest("hex");
const provenance = await readJson("contracts/runa-sdk-contract.provenance.json", "canonical-contract-provenance");
if (provenance !== undefined && provenance.status !== "APPROVED") {
  blockers.push({ gate: "canonical-contract-provenance", reason: "Canonical repository provenance is not approved." });
}
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
await requirePass("evidence/docs-readiness.json", "documentation");
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
const closure = await requirePass("evidence/runtime-closure.json", "runtime-closure");
if (closure !== undefined && candidate !== undefined && closure.candidate_sha256 !== candidate.sha256) {
  blockers.push({ gate: "runtime-closure", reason: "Runtime closure is not bound to the candidate." });
}
const smoke = await requirePass("evidence/release-smoke.json", "synthetic-release-smoke");
if (smoke !== undefined && candidate !== undefined &&
    (smoke.candidate_sha256 !== candidate.sha256 || smoke.clean_room_count !== 150 ||
      smoke.runs_per_journey !== 30 || smoke.public_network_dispatches !== 0)) {
  blockers.push({ gate: "synthetic-release-smoke", reason: "Smoke evidence is incomplete or not bound to the candidate." });
}
const ciManifest = await requirePass("evidence/ci-candidate-manifest.json", "ci-candidate-manifest");
if (ciManifest !== undefined && candidate !== undefined &&
    ciManifest.candidate_sha256 !== candidate.sha256) {
  blockers.push({ gate: "ci-candidate-manifest", reason: "CI manifest is not bound to the candidate." });
}
const sbom = await readJson("evidence/sbom.cdx.json", "sbom");
if (sbom !== undefined && (sbom.bomFormat !== "CycloneDX" || sbom.specVersion !== "1.6" ||
    sbom.metadata?.component?.hashes?.[0]?.content !== candidate?.sha256)) {
  blockers.push({ gate: "sbom", reason: "CycloneDX identity or candidate binding is invalid." });
}
const sbomValidation = await requireTrusted(
  "evidence/sbom-validation.json", "sbom-validation", "sbom-validation");
if (sbomValidation !== undefined && candidate !== undefined &&
    sbomValidation.candidate_sha256 !== candidate.sha256) {
  blockers.push({ gate: "sbom-validation", reason: "SBOM validation is not bound to the candidate." });
}
const externalInterfaces = await requireTrusted(
  "evidence/external-release-interfaces.json", "external-release-interfaces", "external-interfaces");
if (externalInterfaces !== undefined && candidate !== undefined &&
    externalInterfaces.candidate_sha256 !== candidate.sha256) {
  blockers.push({ gate: "external-release-interfaces", reason: "External interface evidence is not bound to the candidate." });
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
