import { test } from "vitest";
import { expect } from "vitest";
import { loadPrdCatalog } from "../scripts/prd-catalog.mjs";

test("the standalone PRD catalog preserves the complete requirement identity", async () => {
  const prdCatalog = await loadPrdCatalog();
  expect(prdCatalog.catalog.source_count).toBe(57);
  expect(prdCatalog.catalog.requirement_count).toBe(994);
  expect(prdCatalog.catalog.acceptance_test_count).toBe(532);
  const requirements = new Set(
    prdCatalog.sources.flatMap((source) => source.requirements),
  );
  expect(requirements.has("R-048-07")).toBe(true);
  expect(requirements.size).toBe(994);
});
