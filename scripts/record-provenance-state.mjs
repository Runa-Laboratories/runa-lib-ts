import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateAttestationJsonl } from "./attestation-bundle.mjs";
import { appendReleaseManifestState } from "./release-manifest-envelope.mjs";

const bundle = process.env.RUNA_ATTESTATION_BUNDLE;
assert.equal(typeof bundle, "string");
assert.match(bundle, /\.intoto\.jsonl$/u);
const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
const core = JSON.parse(await readFile("release-artifacts/release-manifest-core.json", "utf8"));
const bundleBytes = await readFile(bundle);
assert.equal(core.provenance.filename, bundle.split(/[\\/]/u).at(-1));
assert.equal(core.provenance.sha256,
  createHash("sha256").update(bundleBytes).digest("hex"));
assert.equal(validateAttestationJsonl(bundleBytes.toString("utf8"), candidate), true);
await appendReleaseManifestState("provenance-attested", { attestation: bundle });
console.log(`provenance state: PASS (${candidate.sha256})`);
