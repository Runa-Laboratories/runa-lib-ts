import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.mjs"],
    exclude: ["test/live/**"],
    setupFiles: ["test/harness/setup.ts"],
    environment: "node",
    coverage: {
      enabled: false,
    },
  },
});
