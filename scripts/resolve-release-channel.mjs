import { appendFile, readFile } from "node:fs/promises";
import { resolveReleaseChannel } from "./postpublish-policy.mjs";

const mapping = JSON.parse(await readFile("governance/release-mapping.json", "utf8"));
const candidate = JSON.parse(await readFile("release-artifacts/candidate.json", "utf8"));
const result = resolveReleaseChannel(mapping, candidate.version);
if (process.env.GITHUB_REF_NAME !== undefined) {
  if (process.env.GITHUB_REF_NAME !== result.expected_git_tag) {
    throw new Error("R-053-03: release tag does not match candidate version.");
  }
}
const output = process.env.GITHUB_OUTPUT;
if (output !== undefined) {
  await appendFile(output, `dist_tag=${result.dist_tag}\nchannel=${result.channel}\n`);
}
console.log(JSON.stringify(result));
