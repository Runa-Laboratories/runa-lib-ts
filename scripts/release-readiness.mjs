import { createHash } from "node:crypto";
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
}
await requirePass("evidence/quality-gate.json", "quality");
const matrix = await requirePass("evidence/compatibility-matrix.json", "compatibility-matrix");
if (matrix !== undefined && (!Array.isArray(matrix.cells) || matrix.cells.length !== 6 ||
    matrix.cells.some((cell) => cell.status !== "PASS"))) {
  blockers.push({ gate: "compatibility-matrix", reason: "The six exact matrix cells are not all PASS." });
}
await requirePass("evidence/repository-controls.json", "repository-controls");
await requirePass("evidence/cross-language.json", "cross-language");
await requirePass("evidence/publication-readiness.json", "publication-readiness");
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
