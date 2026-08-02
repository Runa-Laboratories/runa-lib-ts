import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { loadPrdCatalog } from "./prd-catalog.mjs";

const prdCatalog = await loadPrdCatalog();
const workspaceRoot = process.env.RUNA_PRD_ROOT ?? path.resolve("../../prds/libs");
let workspaceAvailable = true;
try {
  await access(workspaceRoot);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  workspaceAvailable = false;
}

if (workspaceAvailable) {
  for (const source of prdCatalog.sources) {
    const relative = source.file.replace(/^prds\/libs\//u, "");
    const bytes = await readFile(path.join(workspaceRoot, relative));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      source.sha256,
      `PRD catalog drift: ${source.file}`,
    );
  }
}

console.log(
  `PRD catalog: PASS (${prdCatalog.catalog.source_count} sources, ` +
    `${prdCatalog.catalog.requirement_count} requirements, ` +
    `${prdCatalog.catalog.acceptance_test_count} acceptance tests; ` +
    `workspace comparison ${workspaceAvailable ? "PASS" : "SKIPPED"})`,
);
