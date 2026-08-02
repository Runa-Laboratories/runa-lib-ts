import { readFile } from "node:fs/promises";

import { assertRegistryVersionAbsent } from "./registry-version-policy.mjs";

const candidate = JSON.parse(
  await readFile("release-artifacts/candidate.json", "utf8"),
);
const mapping = JSON.parse(
  await readFile("governance/release-mapping.json", "utf8"),
);
await assertRegistryVersionAbsent({
  fetchImpl: globalThis.fetch,
  registry: mapping.registry,
  packageName: mapping.package_name,
  version: candidate.version,
});
console.log(`registry preflight: PASS (${candidate.version} is unpublished)`);
