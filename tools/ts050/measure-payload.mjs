import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const index = process.argv.indexOf("--artifact");
if (index < 0 || process.argv[index + 1] === undefined) {
  throw new Error("R-050-21: --artifact is required");
}
const artifact = path.resolve(process.argv[index + 1]);
const bytes = await readFile(artifact);
process.stdout.write(`${JSON.stringify({
  artifact_sha256: createHash("sha256").update(bytes).digest("hex"),
  tarball_bytes: bytes.byteLength,
})}\n`);
