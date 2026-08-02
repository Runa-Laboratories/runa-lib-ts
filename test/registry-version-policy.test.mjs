import assert from "node:assert/strict";
import { test } from "vitest";

import {
  assertRegistryVersionAbsent,
  registryVersionUrl,
} from "../scripts/registry-version-policy.mjs";

test("registry preflight allows only an authoritative 404", async () => {
  const url = registryVersionUrl(
    "https://registry.npmjs.org",
    "@runa/sdk",
    "0.1.0",
  );
  assert.equal(url, "https://registry.npmjs.org/%40runa%2Fsdk/0.1.0");
  const invoke = (status) => assertRegistryVersionAbsent({
    fetchImpl: async (target, init) => {
      assert.equal(target, url);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "manual");
      return { status };
    },
    registry: "https://registry.npmjs.org",
    packageName: "@runa/sdk",
    version: "0.1.0",
  });
  assert.equal((await invoke(404)).status, "PASS");
  await assert.rejects(invoke(200), /already exists/u);
  await assert.rejects(invoke(500), /HTTP 500/u);
});
