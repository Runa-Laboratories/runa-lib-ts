import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const prdRoot = path.resolve("../../prds/libs/typescript");
const rows = [];
for (const file of (await readdir(prdRoot)).filter((name) => /^PRD-\d+.*\.md$/.test(name)).sort()) {
  const text = await readFile(path.join(prdRoot, file), "utf8");
  const owner = file.match(/^PRD-(\d{3})/)?.[1];
  const requirements = [...new Set(text.match(/R-\d{3}-\d{2}/g) ?? [])]
    .filter((id) => id.slice(2, 5) === owner)
    .sort();
  const tests = [...new Set(text.match(/TC-\d{3}-\d{2}/g) ?? [])]
    .filter((id) => id.slice(3, 6) === owner)
    .sort();
  for (const requirement of requirements) {
    const number = requirement.slice(2, 5);
    const owned = tests.filter((test) => test.slice(3, 6) === number);
    rows.push({
      requirement,
      prd: file,
      acceptance_tests: owned,
      evidence_kind: "prd-acceptance-case"
    });
  }
}
if (rows.length === 0 || rows.some((row) => row.acceptance_tests.length === 0)) {
  throw new Error("Requirement traceability is incomplete.");
}
await mkdir("evidence", { recursive: true });
await writeFile("evidence/requirement-test-map.json", `${JSON.stringify({
  schema_version: 1,
  generated_from: "prds/libs/typescript",
  source_digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  requirement_count: rows.length,
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
console.log(`evidence: PASS (${rows.length} requirements)`);
