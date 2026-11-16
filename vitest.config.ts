import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["packages/*/tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "packages/*/tests/browser/**"]
        }
      },
      "tests"
    ]
  }
});
