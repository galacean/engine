import { isBuiltin } from "node:module";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "tests",
      "world/tests/seed-world",
      "world/tests/seed-world-browser",
      ...(isBuiltin("node:sqlite") ? ["world/tests/seed-world-storage"] : [])
    ]
  }
});
