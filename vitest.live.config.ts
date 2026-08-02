import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/live/**/*.live.test.ts"],
    environment: "node",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
