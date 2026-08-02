import assert from "node:assert/strict";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { retrievePublicAuthorityAssets } from "./public-authority-transport.mjs";

const policy = JSON.parse(await readFile(".runa/release-policy.json", "utf8"));
assert.equal(policy.releaseAuthority.status, "configured");
const expected = policy.releaseAuthority.authority;
assert.notEqual(expected, null);
const runId = process.env.RUNA_AUTHORITY_RUN_ID;
assert.match(runId ?? "", /^[1-9][0-9]*$/u);
const trustPolicy = JSON.parse(await readFile("governance/release-trust.json", "utf8"));
const output = process.env.RUNA_AUTHORITY_INPUT_DIR ?? "authority-input";
const result = await retrievePublicAuthorityAssets(expected, runId, trustPolicy);
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
console.log(`public release-authority bundle: PASS (${result.detached.bundle_sha256})`);
