import { readdir, readFile, writeFile } from "node:fs/promises";
import { createPrivateKey, sign } from "node:crypto";

const catalog = JSON.parse(await readFile("evidence/compatibility-catalog.json", "utf8"));
const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
const files = await readdir("evidence/compatibility-receipts");
const cells = [];
for (const expected of catalog.cells) {
  if (!files.includes(`${expected.id}.json`)) throw new Error(`Missing receipt: ${expected.id}`);
  const receipt = JSON.parse(await readFile(`evidence/compatibility-receipts/${expected.id}.json`, "utf8"));
  if (receipt.status !== "PASS" || receipt.candidate_sha256 !== candidate.sha256 ||
      receipt.node !== expected.node || receipt.npm !== expected.npm ||
      receipt.platform !== expected.platform || receipt.arch !== expected.arch) {
    throw new Error(`Invalid receipt: ${expected.id}`);
  }
  cells.push(receipt);
}
const issuedAt = new Date();
const payload = {
  schema_version: 1, status: "PASS", catalog: catalog.catalog,
  candidate_sha256: candidate.sha256, cells,
  issued_at: issuedAt.toISOString(),
  expires_at: new Date(issuedAt.getTime() + 60 * 60 * 1_000).toISOString()
};
const keyId = process.env.RUNA_COMPAT_SIGNING_KEY_ID;
const privateKeyPem = process.env.RUNA_COMPAT_SIGNING_KEY_PEM;
if (typeof keyId !== "string" || typeof privateKeyPem !== "string") {
  throw new Error("Trusted compatibility signer is not configured.");
}
const signature = sign(null, Buffer.from(JSON.stringify(payload)),
  createPrivateKey(privateKeyPem)).toString("base64");
await writeFile("evidence/compatibility-matrix.json", `${JSON.stringify({
  schema_version: 1, key_id: keyId, payload, signature
}, null, 2)}\n`);
console.log("compatibility matrix: PASS (6/6)");
