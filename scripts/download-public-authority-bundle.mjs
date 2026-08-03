import assert from "node:assert/strict";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  retrievePublicAuthorityAssets,
  validateAuthorityContinuity,
} from "./public-authority-transport.mjs";

const policy = JSON.parse(await readFile(".runa/release-policy.json", "utf8"));
assert.equal(policy.releaseAuthority.status, "configured");
const expected = policy.releaseAuthority.authority;
assert.notEqual(expected, null);
const runId = process.env.RUNA_AUTHORITY_RUN_ID;
assert.match(runId ?? "", /^[1-9][0-9]*$/u);
const trustPolicy = JSON.parse(await readFile("governance/release-trust.json", "utf8"));
const output = process.env.RUNA_AUTHORITY_INPUT_DIR ?? "authority-input";
const result = await retrievePublicAuthorityAssets(expected, runId, trustPolicy);
validateAuthorityContinuity({
  bundleSha256: result.detached.bundle_sha256,
  headSha: result.run.head_sha,
  runId: result.run.id,
  runAttempt: result.run.run_attempt,
}, {
  bundleSha256: process.env.RUNA_EXPECTED_AUTHORITY_BUNDLE_SHA256,
  headSha: process.env.RUNA_EXPECTED_AUTHORITY_HEAD_SHA,
  runId: process.env.RUNA_EXPECTED_AUTHORITY_RUN_ID,
  runAttempt: process.env.RUNA_EXPECTED_AUTHORITY_RUN_ATTEMPT,
});
await mkdir(output, { recursive: true });
for (const [name, bytes] of result.assets) {
  const destination = path.join(output, name);
  const temporary = `${destination}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
if (process.env.GITHUB_OUTPUT !== undefined) {
  await appendFile(process.env.GITHUB_OUTPUT, [
    `bundle_sha256=${result.detached.bundle_sha256}`,
    `head_sha=${result.run.head_sha}`,
    `run_id=${result.run.id}`,
    `run_attempt=${result.run.run_attempt}`,
  ].join("\n") + "\n");
}
console.log(`public release-authority bundle: PASS (${result.detached.bundle_sha256})`);
