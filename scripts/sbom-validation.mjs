import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const EXPECTED_TOOL = {
  asset: "cyclonedx-linux-x64",
  downloadUrl: "https://github.com/CycloneDX/cyclonedx-cli/releases/download/v0.32.0/cyclonedx-linux-x64",
  sha256: "454879e6a4a405c8a13bff49b8982adcb0596f3019b26b0811c66e4d7f0783e1",
  version: "0.32.0",
};
const EXPECTED_SCHEMAS = {
  ".runa/schemas/cyclonedx-1.6.schema.json": "3e92dddbc30cf7f6a02b80f0942b1a4cfd4fb1c26f1dfc4310afa9d613cafb93",
  ".runa/schemas/jsf-0.82.schema.json": "8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae",
  ".runa/schemas/spdx.schema.json": "baa9d3bd1ed57b6751b0887edead6b5063ff53ff7429cf85d476c6c94af0166e",
};

export async function createSbomValidator() {
  const tools = JSON.parse(await readFile(".runa/supply-chain-tools.json", "utf8"));
  assert.deepEqual(tools.cyclonedxCli, EXPECTED_TOOL);
  assert.deepEqual(tools.jsonSchemaValidator, { package: "ajv", version: "8.17.1" });
  assert.equal(tools.cyclonedxSchema.specVersion, "1.6");
  assert.deepEqual(Object.fromEntries(tools.cyclonedxSchema.files.map(
    (item) => [item.path, item.sha256],
  )), EXPECTED_SCHEMAS);
  const schemas = [];
  for (const [file, expected] of Object.entries(EXPECTED_SCHEMAS)) {
    const bytes = await readFile(file);
    assert.equal(hash(bytes), expected, `Schema digest mismatch: ${file}`);
    schemas.push(JSON.parse(bytes.toString("utf8")));
  }
  assert.equal(schemas[0].$id, "http://cyclonedx.org/schema/bom-1.6.schema.json");
  assert.equal(schemas[0].$schema, "http://json-schema.org/draft-07/schema#");
  const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv);
  for (const schema of schemas.slice(1)) ajv.addSchema(schema, schema.$id);
  const validate = ajv.compile(schemas[0]);
  return {
    validate(document) {
      assert.equal(document.$schema,
        "http://cyclonedx.org/schema/bom-1.6.schema.json");
      assert.equal(document.bomFormat, "CycloneDX");
      assert.equal(document.specVersion, "1.6");
      assert.equal(validate(document), true,
        `CycloneDX 1.6 schema validation failed: ${ajv.errorsText(validate.errors)}`);
      return true;
    },
    schemaSha256s: EXPECTED_SCHEMAS,
  };
}

export async function validateSbomWithPinnedTools(sbomFile, cliPath) {
  const validator = await createSbomValidator();
  const bytes = await readFile(sbomFile);
  const document = JSON.parse(bytes.toString("utf8"));
  validator.validate(document);
  const cliBytes = await readFile(cliPath);
  assert.equal(hash(cliBytes), EXPECTED_TOOL.sha256);
  const version = spawnSync(cliPath, ["--version"], { encoding: "utf8" });
  assert.equal(version.status, 0);
  assert.match(`${version.stdout}${version.stderr}`, /0\.32\.0/u);
  const execution = spawnSync(cliPath, [
    "validate", "--input-format", "json", "--input-version", "v1_6",
    "--input-file", sbomFile, "--fail-on-errors",
  ], { encoding: "utf8" });
  assert.equal(execution.status, 0,
    `Pinned CycloneDX CLI rejected SBOM: ${execution.stderr}`);
  return {
    schema_version: 1,
    status: "PASS",
    sbom_sha256: hash(bytes),
    schema_sha256s: validator.schemaSha256s,
    tool: {
      name: "cyclonedx-cli",
      version: EXPECTED_TOOL.version,
      sha256: EXPECTED_TOOL.sha256,
    },
    validator: { package: "ajv", version: "8.17.1" },
  };
}
