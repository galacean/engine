import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/package-consumer/**/*.test.ts"],
    maxWorkers: 1,
    testTimeout: 120_000
  }
});
