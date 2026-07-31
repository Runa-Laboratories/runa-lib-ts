import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

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
await mkdir("evidence", { recursive: true });
await writeFile("evidence/docs-readiness.json", `${JSON.stringify({
  schema_version: 1,
  status: "BLOCKED",
  structural_checks: "PASS",
  runtime_export_count: 8,
  type_export_count: 18,
  blockers: [
    "R-048-03..09: rendered signatures, members, parameter/return/throw contracts are not verified from TypeDoc reflection",
    "R-048-13: claimRegistry and errorMatrix coverage is not implemented",
    "R-048-15: examples are not bound to executable test identifiers",
    "R-048-17: deterministic rendering and hostile documentation mutations are not implemented",
    "R-048-18: complete reference-link validation is not implemented",
  ],
}, null, 2)}\n`);
console.log("docs structural checks: PASS; complete PRD-048 documentation gate: BLOCKED");
