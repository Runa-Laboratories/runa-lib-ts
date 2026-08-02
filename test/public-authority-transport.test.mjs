import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { test } from "vitest";

import {
  AUTHORITY_REPOSITORY,
  AUTHORITY_WORKFLOW,
  retrievePublicAuthorityAssets,
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
  const bundle = { schema_version: 1, contract_provenance: { status: "APPROVED" } };
  for (const [field] of roleFields) {
    const payload = { ...common, field };
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
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const detached = {
    schema_version: 1,
    canonicalization: "RFC8785-JCS",
    key_id: keyId,
    bundle_sha256: hash(bundleBytes),
    canonical_sha256: hash(canonical),
    signature: sign(null, canonical, privateKey).toString("base64"),
  };
  const assets = new Map([
    ["release-authority-bundle.json", bundleBytes],
    ["release-authority-bundle.json.sig", Buffer.from(`${JSON.stringify(detached)}\n`)],
    ["release-authority-bundle.json.sha256",
      Buffer.from(`${detached.bundle_sha256}  release-authority-bundle.json\n`)],
  ]);
  return { assets, bundle, trust };
}

const jsonResponse = (value) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { "content-type": "application/json" },
});

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
  const release = releaseFor(fixture.assets);
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

test("tampered SHA, detached signature, and legacy embedded envelopes are rejected", () => {
  const fixture = signedAssets();
  const badSha = new Map(fixture.assets);
  badSha.set("release-authority-bundle.json.sha256",
    Buffer.from(`${"0".repeat(64)}  release-authority-bundle.json\n`));
  assert.throws(() => verifyAuthorityAssets(badSha, fixture.trust,
    Date.parse("2026-08-02T12:10:00.000Z")));

  const tampered = new Map(fixture.assets);
  const detached = JSON.parse(tampered.get("release-authority-bundle.json.sig"));
  detached.signature = Buffer.alloc(64).toString("base64");
  tampered.set("release-authority-bundle.json.sig", Buffer.from(JSON.stringify(detached)));
  assert.throws(() => verifyAuthorityAssets(tampered, fixture.trust,
    Date.parse("2026-08-02T12:10:00.000Z")));

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

test("JCS envelope verification is invariant to parsed property order", () => {
  const fixture = signedAssets();
  const original = fixture.bundle.approval_receipt;
  const reordered = {
    ...original,
    payload: {
      field: original.payload.field,
      expires_at: original.payload.expires_at,
      issued_at: original.payload.issued_at,
      status: original.payload.status,
    },
  };
  assert.deepEqual(verifyTrustedEnvelope(
    reordered,
    fixture.trust,
    "approval",
    Date.parse("2026-08-02T12:10:00.000Z"),
    { requiredSchemaVersion: 2 },
  ), reordered.payload);
});
