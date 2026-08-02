import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { verifyTrustedEnvelope } from "./trusted-evidence.mjs";
import {
  validateSbomEvidenceBinding,
  validateTrustedRolePayload,
} from "./release-authority-schema.mjs";
import { validateApprovedLicense } from "./license-policy.mjs";
import {
  resolveReleaseChannel,
  validateReleaseMapping,
} from "./postpublish-policy.mjs";
import { validateReleaseManifestCore } from "./release-manifest-core.mjs";
import { validateReleaseManifestEnvelope } from "./release-manifest-envelope.mjs";
import { validateExternalAcceptancePayload } from "./acceptance-receipts.mjs";
import {
  validateRequirementTestMap,
  validateRequirementTestMapWithReceipts,
  validateSmokeEvidence,
} from "./evidence-policy.mjs";

const blockers = [];
const releasePolicy = JSON.parse(await readFile(".runa/release-policy.json", "utf8"));
if (releasePolicy.postPublishRecovery?.status !== "configured" ||
    releasePolicy.postPublishRecovery?.mode !== "withdrawal-only-audit" ||
    releasePolicy.postPublishRecovery?.resumeAfterUpload !== false) {
  blockers.push({
    gate: "postpublish-recovery",
    reason: "Normative no-republish withdrawal/audit recovery policy is not configured.",
  });
}
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
  const payload = verifyTrustedEnvelope(envelope, trustPolicy, role, Date.now(), {
    requiredSchemaVersion: role === "compatibility" ? 1 : 2,
  });
  if (payload === undefined) {
    blockers.push({ gate, reason: "Evidence signature, role, status, or freshness is invalid." });
    return undefined;
  }
  if (["approval", "version-classification", "publication", "sbom-validation", "external-interfaces"].includes(role)) {
    try {
      validateTrustedRolePayload(role, payload);
    } catch {
      blockers.push({
        gate,
        reason: "Trusted evidence payload does not satisfy its closed role schema.",
      });
      return undefined;
    }
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
try {
  validateApprovedLicense(
    await readFile("LICENSE", "utf8"),
    JSON.parse(await readFile("package.json", "utf8")),
  );
} catch {
  blockers.push({
    gate: "license-approval",
    reason: "The approved Apache-2.0 license or package metadata is invalid.",
  });
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
const releaseManifestCore = await readJson(
  "release-artifacts/release-manifest-core.json", "release-manifest");
if (releaseManifestCore !== undefined) {
  try {
    await validateReleaseManifestCore(releaseManifestCore);
  } catch {
    blockers.push({
      gate: "release-manifest",
      reason: "Release manifest core is non-canonical, incomplete, stale, or candidate-mismatched.",
    });
  }
}
const approval = await requireTrusted(
  "evidence/release-approval.json", "release-approval", "approval");
if (approval !== undefined && candidate !== undefined) {
  try {
    validateTrustedRolePayload("approval", approval);
    const releaseManifestCoreBytes = await readFile(
      "release-artifacts/release-manifest-core.json");
    if (approval.candidate_sha256 !== candidate.sha256 ||
        approval.artifact_sha256 !== candidate.sha256 ||
        approval.release_manifest_core_sha256 !==
          createHash("sha256").update(releaseManifestCoreBytes).digest("hex")) {
      throw new Error();
    }
  } catch {
    blockers.push({
      gate: "release-approval",
      reason: "Approval is not bound to the exact release manifest core and tarball.",
    });
  }
}
const versionClassification = await requireTrusted(
  "evidence/version-classification.json",
  "semver-classification",
  "version-classification",
);
if (versionClassification !== undefined && candidate !== undefined &&
    releaseManifestCore !== undefined) {
  try {
    validateTrustedRolePayload("version-classification", versionClassification);
    const coreBytes = await readFile("release-artifacts/release-manifest-core.json");
    if (versionClassification.candidate_sha256 !== candidate.sha256 ||
        versionClassification.version !== candidate.version ||
        versionClassification.release_manifest_core_sha256 !==
          createHash("sha256").update(coreBytes).digest("hex")) throw new Error();
  } catch {
    blockers.push({
      gate: "semver-classification",
      reason: "Version classification is not bound to the exact release manifest core.",
    });
  }
}
const requirementMap = await readJson(
  "evidence/requirement-test-map.json", "requirement-test-map");
if (requirementMap !== undefined) {
  const externalAcceptance = await requireTrusted(
    "evidence/external-acceptance.json", "requirement-test-map", "acceptance-results",
  );
  try {
    if (externalAcceptance === undefined) {
      validateRequirementTestMap(requirementMap);
    } else {
      const authorityRun = await readJson(
        "evidence/authority-run.json", "release-authority-run",
      );
      const coreBytes = await readFile("release-artifacts/release-manifest-core.json");
      validateExternalAcceptancePayload(externalAcceptance, {
        catalog: new Set(requirementMap.acceptance_test_ids),
        prdSourceDigest: requirementMap.source_digest,
        candidateSha256: candidate.sha256,
        releaseManifestCoreSha256:
          createHash("sha256").update(coreBytes).digest("hex"),
        expectedOracle: {
          provider: "github-actions",
          repository: authorityRun.repository,
          workflow: authorityRun.workflow,
          run_id: authorityRun.run_id,
          run_attempt: authorityRun.run_attempt,
          head_sha: authorityRun.head_sha,
        },
      });
      validateRequirementTestMapWithReceipts(
        requirementMap,
        externalAcceptance.results.map((result) => result.test_id),
      );
    }
  } catch {
    blockers.push({ gate: "requirement-test-map", reason: "Mandatory requirements or acceptance tests remain NOT_RUN." });
  }
}
if (releaseManifestCore !== undefined && candidate !== undefined) {
  const envelope = await readJson(
    "release-artifacts/release-manifest-envelope.json", "release-manifest-envelope",
  );
  if (envelope !== undefined) {
    try {
      const coreBytes = await readFile("release-artifacts/release-manifest-core.json");
      validateReleaseManifestEnvelope(envelope, {
        coreSha256: createHash("sha256").update(coreBytes).digest("hex"),
        candidateSha256: candidate.sha256,
      });
      if (envelope.states.at(-1)?.state !== "authority-admitted") throw new Error();
    } catch {
      blockers.push({
        gate: "release-manifest-envelope",
        reason: "Append-only release envelope is missing, stale, or tampered.",
      });
    }
  }
}
await requirePass("evidence/docs-readiness.json", "documentation");
const performance = await requirePass(
  "evidence/performance-local.json",
  "local-performance",
);
if (performance !== undefined && candidate !== undefined &&
    performance.identity?.artifact_sha256 !== candidate.sha256) {
  blockers.push({
    gate: "local-performance",
    reason: "Local performance evidence is not bound to the candidate archive.",
  });
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
if (publication !== undefined && candidate !== undefined) {
  try {
    const mapping = JSON.parse(
      await readFile("governance/release-mapping.json", "utf8"),
    );
    validateReleaseMapping(mapping);
    const release = resolveReleaseChannel(mapping, candidate.version);
    if (publication.package_name !== mapping.package_name ||
        publication.version !== candidate.version ||
        publication.registry !== mapping.registry ||
        publication.dist_tag !== release.dist_tag) throw new Error();
  } catch {
    blockers.push({
      gate: "publication-readiness",
      reason: "Publication authority does not match the closed release mapping.",
    });
  }
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
if (smoke !== undefined && candidate !== undefined) {
  try {
    validateSmokeEvidence(smoke, candidate.sha256);
  } catch {
    blockers.push({ gate: "synthetic-release-smoke", reason: "Smoke evidence is incomplete or not bound to the candidate." });
  }
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
if (sbomValidation !== undefined && candidate !== undefined) {
  try {
    validateSbomEvidenceBinding(sbomValidation, {
      candidateSha256: candidate.sha256,
      sbomBytes: await readFile("evidence/sbom.cdx.json"),
      runtimeClosure: closure,
      localValidationBytes: await readFile("evidence/sbom-local-validation.json"),
    });
  } catch {
    blockers.push({ gate: "sbom-validation", reason: "SBOM validation is not bound to exact local SBOM and closure evidence." });
  }
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
