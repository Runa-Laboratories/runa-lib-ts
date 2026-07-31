import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const guides = [
  "install-and-authentication", "first-session", "session-lifecycle",
  "session-exec", "session-checkpoint", "session-open", "records", "account",
  "errors", "cleanup", "troubleshooting"
];
for (const guide of guides) await access(`docs/guides/${guide}.md`);
for (const example of guides.filter((name) => !["install-and-authentication", "troubleshooting"].includes(name))) {
  await access(`examples/guides/${example}.ts`);
}
const openExample = await readFile("examples/guides/session-open.ts", "utf8");
assert.match(openExample, /await session\.open\(\);/);
assert.doesNotMatch(openExample, /=\s*await session\.open|console|writeFile|fetch\(/);
const apiManifest = JSON.parse(await readFile("docs/api/manifest.json", "utf8"));
assert.equal(apiManifest.runtime.length, 8);
assert.equal(apiManifest.types.length, 18);
console.log("docs: PASS");
