import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "tests", "world/tests/seed-world", "world/tests/procedural-rock"]
  }
});
