import { defineProject } from "vitest/config";

export default defineProject({
  optimizeDeps: {
    exclude: [
      "@galacean/engine",
      "@galacean/engine-loader",
      "@galacean/engine-rhi-webgl",
      "@galacean/engine-math",
      "@galacean/engine-core"
    ]
  },
  test: {
    browser: {
      provider: "preview",
      enabled: true,
      name: "chromium"
    },
    environmentMatchGlobs: [["tests/**/*.test.ts", "node"]]
  }
});
