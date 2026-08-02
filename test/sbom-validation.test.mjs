import assert from "node:assert/strict";
import { test } from "vitest";

import { createSbomValidator } from "../scripts/sbom-validation.mjs";

test("vendored CycloneDX 1.6 schema accepts a BOM and rejects mutations", async () => {
  const validator = await createSbomValidator();
  const valid = {
    $schema: "http://cyclonedx.org/schema/bom-1.6.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    metadata: { component: { type: "library", name: "@runa/sdk", version: "0.1.0" } },
    components: [],
  };
  assert.equal(validator.validate(valid), true);
  for (const mutation of [
    { ...valid, bomFormat: "NotCycloneDX" },
    { ...valid, specVersion: "1.5" },
    { ...valid, unexpected: true },
    { ...valid, $schema: "https://example.invalid/schema.json" },
  ]) assert.throws(() => validator.validate(mutation));
});
