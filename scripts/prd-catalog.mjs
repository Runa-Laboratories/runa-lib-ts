import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const PRD_CATALOG_PATH = "governance/prd-catalog.json";

const identifiers = (prefix, owner, count) => Array.from(
  { length: count },
  (_, index) => `${prefix}-${owner}-${String(index + 1).padStart(2, "0")}`,
);

export async function loadPrdCatalog() {
  const bytes = await readFile(PRD_CATALOG_PATH);
  const catalog = JSON.parse(bytes.toString("utf8"));
  assert.deepEqual(Object.keys(catalog).sort(), [
    "acceptance_test_count",
    "generated_from",
    "id_scheme",
    "requirement_count",
    "schema_version",
    "source_count",
    "sources",
  ]);
  assert.equal(catalog.schema_version, 1);
  assert.equal(catalog.id_scheme, "owner-scoped contiguous R/TC identifiers");
  assert.deepEqual(catalog.generated_from, [
    "prds/libs/shared",
    "prds/libs/typescript",
  ]);
  assert.equal(catalog.source_count, catalog.sources.length);

  const owners = new Set();
  const paths = new Set();
  let requirementCount = 0;
  let acceptanceTestCount = 0;
  const sources = catalog.sources.map((source) => {
    assert.deepEqual(Object.keys(source).sort(), [
      "acceptance_test_count",
      "file",
      "requirement_count",
      "scope",
      "sha256",
    ]);
    const match = /^prds\/libs\/(shared|typescript)\/PRD-(\d{3})-.+\.md$/u.exec(
      source.file,
    );
    assert(match !== null, `Invalid PRD catalog path: ${source.file}`);
    const [, directory, owner] = match;
    assert.equal(
      source.scope,
      directory === "typescript" ? "typescript" : "shared-applicable",
    );
    assert.match(source.sha256, /^[0-9a-f]{64}$/u);
    assert(Number.isSafeInteger(source.requirement_count) && source.requirement_count > 0);
    assert(
      Number.isSafeInteger(source.acceptance_test_count) &&
        source.acceptance_test_count > 0,
    );
    assert.equal(owners.has(owner), false, `Duplicate PRD owner: ${owner}`);
    assert.equal(paths.has(source.file), false, `Duplicate PRD path: ${source.file}`);
    owners.add(owner);
    paths.add(source.file);
    requirementCount += source.requirement_count;
    acceptanceTestCount += source.acceptance_test_count;
    return {
      ...source,
      owner,
      requirements: identifiers("R", owner, source.requirement_count),
      acceptance_tests: identifiers("TC", owner, source.acceptance_test_count),
    };
  });
  assert.equal(catalog.requirement_count, requirementCount);
  assert.equal(catalog.acceptance_test_count, acceptanceTestCount);
  return {
    bytes,
    catalog,
    digest: createHash("sha256").update(bytes).digest("hex"),
    sources,
  };
}
