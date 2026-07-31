import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const sources = [
  { root: path.resolve("../../prds/libs/shared"), scope: "shared-applicable" },
  { root: path.resolve("../../prds/libs/typescript"), scope: "typescript" }
];
const rows = [];
const acceptanceTestIds = new Set();
for (const source of sources) {
  for (const file of (await readdir(source.root)).filter((name) => /^PRD-\d+.*\.md$/.test(name)).sort()) {
    const text = await readFile(path.join(source.root, file), "utf8");
    const owner = file.match(/^PRD-(\d{3})/)?.[1];
    const requirements = [...new Set(text.match(/R-\d{3}-\d{2}/g) ?? [])]
      .filter((id) => id.slice(2, 5) === owner)
      .sort();
    const tests = [...new Set(text.match(/TC-\d{3}-\d{2}/g) ?? [])]
      .filter((id) => id.slice(3, 6) === owner)
      .sort();
    for (const test of tests) acceptanceTestIds.add(test);
    for (const requirement of requirements) {
      rows.push({
        requirement,
        scope: source.scope,
        prd: `prds/libs/${source.scope === "typescript" ? "typescript" : "shared"}/${file}`,
        acceptance_test_ids: tests,
        status: "NOT_RUN",
        evidence_missing: "The PRD acceptance cases are traced but have not each been executed and recorded under their exact TC identifier."
      });
    }
  }
}
if (rows.length !== 984 || acceptanceTestIds.size !== 522) {
  throw new Error(`Trace catalog mismatch: ${rows.length} requirements and ${acceptanceTestIds.size} acceptance tests.`);
}
await mkdir("evidence", { recursive: true });
await writeFile("evidence/requirement-test-map.json", `${JSON.stringify({
  schema_version: 2,
  generated_from: ["prds/libs/shared", "prds/libs/typescript"],
  source_digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  requirement_count: rows.length,
  acceptance_test_count: acceptanceTestIds.size,
  status_summary: { NOT_RUN: rows.length, PASS: 0, BLOCKED: 0 },
  acceptance_test_ids: [...acceptanceTestIds].sort(),
  rows
}, null, 2)}\n`);
await writeFile("evidence/duplicate-abstraction-audit.json", `${JSON.stringify({
  schema_version: 1,
  status: "PASS",
  decisions: [
    { concept: "wire-decoding", disposition: "centralized", owner: "src/domain.ts" },
    { concept: "request-policy", disposition: "centralized", owner: "src/internal/transport.ts" },
    { concept: "own-property checks", disposition: "intentional-local", reason: "separate input boundaries; no public abstraction" }
  ]
}, null, 2)}\n`);
console.log(`evidence: traced ${rows.length} requirements to ${acceptanceTestIds.size} acceptance IDs; all NOT_RUN by exact TC identity`);
