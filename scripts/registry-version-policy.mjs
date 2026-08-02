import assert from "node:assert/strict";

export function registryVersionUrl(registry, packageName, version) {
  assert.equal(registry, "https://registry.npmjs.org");
  assert.equal(packageName, "@runa_laboratories/sdk");
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  return `${registry}/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`;
}

export async function assertRegistryVersionAbsent({
  fetchImpl,
  registry,
  packageName,
  version,
}) {
  assert.equal(typeof fetchImpl, "function");
  const url = registryVersionUrl(registry, packageName, version);
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    headers: { accept: "application/json" },
  });
  if (response.status === 404) return Object.freeze({ status: "PASS", url });
  if (response.status === 200) {
    throw new Error("R-053-22: package version already exists in the registry.");
  }
  throw new Error(`R-053-22: registry preflight returned HTTP ${response.status}.`);
}
