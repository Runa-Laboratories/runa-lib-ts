import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "vitest";

import {
  AUTHORITY_REPOSITORY,
  AUTHORITY_WORKFLOW,
  retrievePublicAuthorityAssets,
  validateAuthorityContinuity,
  validateAuthorityRun,
  verifyAuthorityAssets,
} from "../scripts/public-authority-transport.mjs";
import { jcsBytes, verifyTrustedEnvelope } from "../scripts/trusted-evidence.mjs";

const runId = 1234;
const runAttempt = 2;
const headSha = "a".repeat(40);
const expected = {
  repository: AUTHORITY_REPOSITORY,
  workflow: AUTHORITY_WORKFLOW,
  artifact: "release-authority-bundle",
  branch: "main",
  event: "workflow_dispatch",
};
const validRun = () => ({
  id: runId,
  repository: { full_name: AUTHORITY_REPOSITORY, private: false },
  path: AUTHORITY_WORKFLOW,
  event: "workflow_dispatch",
  head_branch: "main",
  head_sha: headSha,
  status: "completed",
  conclusion: "success",
  run_attempt: runAttempt,
});
const producerApproval = JSON.parse(readFileSync(new URL(
  "./fixtures/release-authority-v2/producer-approval-receipt.json", import.meta.url,
), "utf8"));
const digest = (character) => character.repeat(64);

const roleFields = [
  ["approval_receipt", "approval"],
  ["version_classification", "version-classification"],
  ["repository_controls", "repository-controls"],
  ["cross_language", "cross-language"],
  ["publication_readiness", "publication"],
  ["sbom_validation", "sbom-validation"],
  ["external_release_interfaces", "external-interfaces"],
  ["acceptance_results", "acceptance-results"],
];

function signedAssets() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const keyId = "authority-v2";
  const keys = ["release-authority", ...roleFields.map(([, role]) => role)]
    .map((role) => ({
      key_id: keyId,
      role,
      algorithm: "Ed25519",
      public_key_pem: publicKey.export({ type: "spki", format: "pem" }),
    }));
  const trust = { schema_version: 1, maximum_validity_ms: 3_600_000, keys };
  const common = {
    status: "PASS",
    issued_at: "2026-08-02T12:00:00.000Z",
    expires_at: "2026-08-02T12:30:00.000Z",
  };
  const candidateSha = digest("a");
  const pythonWheelSha = digest("b");
  const pythonSdistSha = digest("c");
  const candidateSetDigest = hash(jcsBytes([
    { form: "python-sdist", digest: `sha256:${pythonSdistSha}` },
    { form: "python-wheel", digest: `sha256:${pythonWheelSha}` },
    { form: "typescript-tarball", digest: `sha256:${candidateSha}` },
  ]));
  const payloads = {
    approval_receipt: producerApproval,
    version_classification: {
      ...common, candidate_sha256: candidateSha, classification: "initial",
      release_manifest_core_sha256: digest("d"), version: "0.1.0",
    },
    repository_controls: {
      ...common, administrators_enforced: true, branch: "main", commit_sha: headSha,
      deletions_allowed: false, dismiss_stale_reviews: true,
      force_pushes_allowed: false, pull_request_required: true,
      repository: "Runa-Laboratories/runa-lib-ts", required_approving_reviews: 0,
      required_status_checks: ["release-admission", "ts-quality-gates"],
    },
    cross_language: {
      ...common, authority_head_sha: headSha, candidate_sha256: candidateSha,
      candidate_source_commit: headSha,
      candidate_set_digest: `sha256:${candidateSetDigest}`,
      canonical_contract_sha256: digest("e"),
      conformance_counts: { fixtures: 12, modes: 3, operations: 13 },
      conformance_verdict_sha256: digest("f"),
      python_artifacts: {
        candidate_manifest_sha256: digest("1"), candidate_run_id: 44,
        source_commit: "2".repeat(40),
        wheel: { filename: "runa_sdk-0.1.0-py3-none-any.whl", sha256: pythonWheelSha },
        sdist: { filename: "runa_sdk-0.1.0.tar.gz", sha256: pythonSdistSha },
      },
      typescript_artifact: {
        filename: "runa_laboratories-sdk-0.1.0.tgz", sha256: candidateSha,
      },
    },
    publication_readiness: {
      ...common, candidate_sha256: candidateSha, dist_tag: "latest",
      oidc_trusted_publisher: true, package_name: "@runa_laboratories/sdk",
      provenance_attestation_required: true, registry: "https://registry.npmjs.org",
      registry_retrieval_required: true, version: "0.1.0",
    },
    sbom_validation: {
      ...common, artifact_subject_sha256: candidateSha, bom_format: "CycloneDX",
      candidate_sha256: candidateSha, dependency_closure_sha256: digest("3"),
      local_validation_sha256: digest("4"), sbom_sha256: digest("5"),
      schema_sha256s: {
        ".runa/schemas/cyclonedx-1.6.schema.json": "3e92dddbc30cf7f6a02b80f0942b1a4cfd4fb1c26f1dfc4310afa9d613cafb93",
        ".runa/schemas/jsf-0.82.schema.json": "8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae",
        ".runa/schemas/spdx.schema.json": "baa9d3bd1ed57b6751b0887edead6b5063ff53ff7429cf85d476c6c94af0166e",
      },
      spec_version: "1.6", status: "PASS",
      tool: {
        name: "cyclonedx-cli", version: "0.32.0",
        sha256: "454879e6a4a405c8a13bff49b8982adcb0596f3019b26b0811c66e4d7f0783e1",
      },
    },
    external_release_interfaces: {
      ...common, candidate_sha256: candidateSha,
      github_attestations_api_required: true, github_release_required: true,
      npm_registry_required: true,
      receipt_types: ["github-attestation", "npm-registry", "provenance"],
      withdrawal_policy_id: "TS-053-WITHDRAWAL-V1",
    },
    acceptance_results: {
      schema_version: 1, ...common, candidate_sha256: candidateSha,
      oracle: {
        provider: "github-actions", repository: AUTHORITY_REPOSITORY,
        workflow: AUTHORITY_WORKFLOW, run_id: runId, run_attempt: runAttempt,
        head_sha: headSha,
      },
      prd_source_digest: digest("6"), release_manifest_core_sha256: digest("d"),
      results: [{
        test_id: "TC-001-01", status: "PASS",
        oracle_case: "verified-candidate:TC-001-01",
      }],
    },
  };
  const bundle = {
    schema_version: 1,
    contract_provenance: {
      schema_version: 1, status: "APPROVED", canonical_contract_sha256: digest("e"),
    },
  };
  for (const [field] of roleFields) {
    const payload = payloads[field];
    bundle[field] = {
      schema_version: 2,
      canonicalization: "RFC8785-JCS",
      key_id: keyId,
      payload,
      signature: sign(null, jcsBytes(payload), privateKey).toString("base64"),
    };
  }
  const bundleBytes = Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`);
  const canonical = jcsBytes(bundle);
  const statement = {
    schema_version: 2,
    canonicalization: "RFC8785-JCS",
    key_id: keyId,
    bundle_sha256: hash(bundleBytes),
    canonical_sha256: hash(canonical),
    authority_repository: AUTHORITY_REPOSITORY,
    authority_workflow: AUTHORITY_WORKFLOW,
    authority_run_id: runId,
    authority_run_attempt: runAttempt,
    authority_head_sha: headSha,
  };
  const detached = {
    ...statement,
    signature: sign(null, jcsBytes(statement), privateKey).toString("base64"),
  };
  const assets = new Map([
    ["release-authority-bundle.json", bundleBytes],
    ["release-authority-bundle.json.sig",
      Buffer.from(`${JSON.stringify(detached, null, 2)}\n`)],
    ["release-authority-bundle.json.sha256",
      Buffer.from(`${detached.bundle_sha256}  release-authority-bundle.json\n`)],
  ]);
  return { assets, bundle, trust };
}

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

const jsonResponse = (value) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { "content-type": "application/json" },
});

const producerAdditionalAssets = new Map([
  ["release-authority-public-key.pem", Buffer.from("public key transport only")],
  ["release-authority-public-key.pem.sha256", Buffer.from(`${"b".repeat(64)}  release-authority-public-key.pem\n`)],
  ["inherited-evidence.json", Buffer.from("{}")],
  ["inherited-evidence.sigstore.json", Buffer.from("{}")],
  ["prd013-security.json", Buffer.from("{}")],
  ["prd014-compatibility.json", Buffer.from("{}")],
  ["prd015-conformance.json", Buffer.from("{}")],
  ["prd016-quality.json", Buffer.from("{}")],
  ["prd017-budgets.json", Buffer.from("{}")],
  ["release-manifest.json", Buffer.from("{}")],
  ["sbom-wheel.cdx.json", Buffer.from("{}")],
  ["sbom-sdist.cdx.json", Buffer.from("{}")],
  ["provenance-wheel.intoto.json", Buffer.from("{}")],
  ["provenance-sdist.intoto.json", Buffer.from("{}")],
  ["release-core-manifest.json", Buffer.from("{}")],
  ["approval-receipt.json", Buffer.from("{}")],
  ["approval-receipt.sig", Buffer.from("signature")],
  ["approval-receipt.json.sha256", Buffer.from(`${"c".repeat(64)}  approval-receipt.json\n`)],
]);

function releaseFor(assets) {
  const tag = `authority-run-${runId}-${runAttempt}`;
  return {
    tag_name: tag,
    target_commitish: headSha,
    draft: false,
    prerelease: false,
    assets: [...assets].map(([name, bytes]) => ({
      name,
      state: "uploaded",
      size: bytes.length,
      browser_download_url:
        `https://github.com/${AUTHORITY_REPOSITORY}/releases/download/${tag}/${name}`,
    })),
  };
}

test("public authority transport is anonymous and verifies run, SHA, detached, and role signatures", async () => {
  const fixture = signedAssets();
  const releaseAssets = new Map([...fixture.assets, ...producerAdditionalAssets]);
  const release = releaseFor(releaseAssets);
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    const headers = new Headers(options?.headers);
    assert.equal(headers.has("authorization"), false);
    if (url.hostname === "api.github.com" && url.pathname.endsWith(`/runs/${runId}`)) {
      return jsonResponse(validRun());
    }
    if (url.hostname === "api.github.com" && url.pathname.includes("/releases/tags/")) {
      return jsonResponse(release);
    }
    if (url.hostname === "github.com") {
      const name = url.pathname.split("/").at(-1);
      return new Response(null, {
        status: 302,
        headers: { location: `https://release-assets.githubusercontent.com/${name}` },
      });
    }
    if (url.hostname === "release-assets.githubusercontent.com") {
      return new Response(fixture.assets.get(url.pathname.slice(1)), { status: 200 });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const result = await retrievePublicAuthorityAssets(expected, runId, fixture.trust, {
    fetchImpl,
    now: Date.parse("2026-08-02T12:10:00.000Z"),
  });
  assert.equal(result.run.head_sha, headSha);
  assert.deepEqual(result.bundle, fixture.bundle);
});

test("wrong repository and invalid run states fail closed", () => {
  assert.throws(() => validateAuthorityRun(validRun(), {
    ...expected, repository: "attacker/release-authority",
  }, runId));
  for (const mutation of [
    { repository: { full_name: "attacker/release-authority", private: false } },
    { event: "push" },
    { head_branch: "other" },
    { status: "in_progress" },
    { conclusion: "failure" },
    { run_attempt: 0 },
    { head_sha: "not-a-commit" },
  ]) assert.throws(() => validateAuthorityRun({ ...validRun(), ...mutation }, expected, runId));
});

test("unexpected release-asset redirect host is rejected", async () => {
  const fixture = signedAssets();
  const release = releaseFor(fixture.assets);
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "api.github.com" && url.pathname.endsWith(`/runs/${runId}`)) {
      return jsonResponse(validRun());
    }
    if (url.hostname === "api.github.com") return jsonResponse(release);
    return new Response(null, {
      status: 302,
      headers: { location: "https://objects.attacker.example/bundle" },
    });
  };
  await assert.rejects(retrievePublicAuthorityAssets(expected, runId, fixture.trust, {
    fetchImpl,
  }), /unexpected host/u);
});

test("oversized public assets are rejected before download", async () => {
  const fixture = signedAssets();
  const release = releaseFor(fixture.assets);
  release.assets.find((asset) => asset.name === "release-authority-bundle.json").size =
    5_242_881;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith(`/runs/${runId}`)) return jsonResponse(validRun());
    return jsonResponse(release);
  };
  await assert.rejects(retrievePublicAuthorityAssets(expected, runId, fixture.trust, {
    fetchImpl,
  }));
});

test("duplicate and uncatalogued producer asset names are rejected", async () => {
  const fixture = signedAssets();
  const duplicate = releaseFor(fixture.assets);
  duplicate.assets.push({ ...duplicate.assets[0] });
  const unexpected = releaseFor(fixture.assets);
  unexpected.assets.push({
    name: "../../authority-bundle.json",
    state: "uploaded",
    size: 1,
    browser_download_url: "https://github.com/attacker/authority-bundle.json",
  });
  for (const release of [duplicate, unexpected]) {
    const fetchImpl = async (input) => {
      const url = new URL(input);
      if (url.pathname.endsWith(`/runs/${runId}`)) return jsonResponse(validRun());
      return jsonResponse(release);
    };
    await assert.rejects(retrievePublicAuthorityAssets(expected, runId, fixture.trust, {
      fetchImpl,
    }));
  }
});

test("tampered SHA, detached signature, and legacy embedded envelopes are rejected", () => {
  const fixture = signedAssets();
  const badSha = new Map(fixture.assets);
  badSha.set("release-authority-bundle.json.sha256",
    Buffer.from(`${"0".repeat(64)}  release-authority-bundle.json\n`));
  assert.throws(() => verifyAuthorityAssets(badSha, fixture.trust,
    Date.parse("2026-08-02T12:10:00.000Z"), validRun()));

  const tampered = new Map(fixture.assets);
  const detached = JSON.parse(tampered.get("release-authority-bundle.json.sig"));
  detached.signature = Buffer.alloc(64).toString("base64");
  tampered.set("release-authority-bundle.json.sig", Buffer.from(JSON.stringify(detached)));
  assert.throws(() => verifyAuthorityAssets(tampered, fixture.trust,
    Date.parse("2026-08-02T12:10:00.000Z"), validRun()));

  const envelope = fixture.bundle.approval_receipt;
  assert.equal(verifyTrustedEnvelope({
    schema_version: 1,
    key_id: envelope.key_id,
    payload: envelope.payload,
    signature: envelope.signature,
  }, fixture.trust, "approval", Date.parse("2026-08-02T12:10:00.000Z"), {
    requiredSchemaVersion: 2,
  }), undefined);
});

test("detached v2 authenticates raw bytes and rejects duplicate JSON keys", () => {
  const fixture = signedAssets();
  const original = JSON.parse(fixture.assets.get("release-authority-bundle.json"));
  const { schema_version: schemaVersion, ...remaining } = original;
  const reorderedBytes = Buffer.from(`${JSON.stringify({
    ...remaining, schema_version: schemaVersion,
  }, null, 2)}\n`);
  const swapped = new Map(fixture.assets);
  const detached = JSON.parse(swapped.get("release-authority-bundle.json.sig"));
  detached.bundle_sha256 = hash(reorderedBytes);
  swapped.set("release-authority-bundle.json", reorderedBytes);
  swapped.set("release-authority-bundle.json.sig",
    Buffer.from(`${JSON.stringify(detached, null, 2)}\n`));
  swapped.set("release-authority-bundle.json.sha256",
    Buffer.from(`${detached.bundle_sha256}  release-authority-bundle.json\n`));
  assert.throws(() => verifyAuthorityAssets(swapped, fixture.trust,
    Date.parse("2026-08-02T12:10:00.000Z"), validRun()),
  /Detached authority signature/u);

  const duplicate = new Map(fixture.assets);
  const duplicateBytes = Buffer.from(fixture.assets.get(
    "release-authority-bundle.json",
  ).toString("utf8").replace("{\n", "{\n  \"schema_version\": 1,\n"));
  duplicate.set("release-authority-bundle.json", duplicateBytes);
  duplicate.set("release-authority-bundle.json.sha256",
    Buffer.from(`${hash(duplicateBytes)}  release-authority-bundle.json\n`));
  assert.throws(() => verifyAuthorityAssets(duplicate, fixture.trust,
    Date.parse("2026-08-02T12:10:00.000Z"), validRun()), /unique producer JSON/u);
});

test("authority evidence is rejected when a publish queue outlives freshness", () => {
  const fixture = signedAssets();
  assert.throws(() => verifyAuthorityAssets(fixture.assets, fixture.trust,
    Date.parse("2026-08-02T12:31:00.000Z"), validRun()), /JCS signature/u);
});

test("admission rejects a valid authority asset swapped after phase A", () => {
  const phaseA = {
    bundleSha256: digest("1"), headSha, runId, runAttempt,
  };
  assert.equal(validateAuthorityContinuity(phaseA, phaseA), true);
  assert.throws(() => validateAuthorityContinuity({
    ...phaseA, bundleSha256: digest("2"),
  }, phaseA), /bundleSha256 changed/u);
});

test("JCS envelope verification is invariant to parsed property order", () => {
  const fixture = signedAssets();
  const original = fixture.bundle.approval_receipt;
  const reordered = {
    ...original,
    payload: Object.fromEntries(Object.entries(original.payload).reverse()),
  };
  assert.deepEqual(verifyTrustedEnvelope(
    reordered,
    fixture.trust,
    "approval",
    Date.parse("2026-08-02T12:10:00.000Z"),
    { requiredSchemaVersion: 2 },
  ), reordered.payload);
});
