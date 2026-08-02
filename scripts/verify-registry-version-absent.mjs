import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import { assertRegistryVersionAbsent } from "./registry-version-policy.mjs";

const candidate = JSON.parse(
  await readFile("release-artifacts/candidate.json", "utf8"),
);
const mapping = JSON.parse(
  await readFile("governance/release-mapping.json", "utf8"),
);
if (process.env.RUNA_VERIFY_ONLY !== "true") {
  await assertRegistryVersionAbsent({
  fetchImpl: globalThis.fetch,
  registry: mapping.registry,
  packageName: mapping.package_name,
  version: candidate.version,
  });
  console.log(`registry preflight: PASS (${candidate.version} is unpublished)`);
} else {
  const endpoint = `${mapping.registry.replace(/\/$/u, "")}/@runa_laboratories%2fsdk/${candidate.version}`;
  const response = await fetch(endpoint, { redirect: "error" });
  if (response.status !== 200) throw new Error("Verify-only recovery requires an existing exact version.");
  const metadata = await response.json();
  if (metadata.name !== mapping.package_name || metadata.version !== candidate.version ||
      typeof metadata.dist?.tarball !== "string") throw new Error("Registry metadata mismatch.");
  const tarballResponse = await fetch(metadata.dist.tarball, { redirect: "error" });
  if (!tarballResponse.ok) throw new Error("Registry tarball retrieval failed.");
  const digest = createHash("sha256")
    .update(Buffer.from(await tarballResponse.arrayBuffer())).digest("hex");
  if (digest !== candidate.sha256) throw new Error("Existing registry artifact differs from candidate.");
  console.log(`registry recovery preflight: PASS (${candidate.version}, exact digest)`);
}
