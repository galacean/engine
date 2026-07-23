import { defineProject } from "vitest/config";
import type {} from "@vitest/browser/providers/playwright";

export default defineProject({
  server: {
    port: 51204
  },
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
      provider: "playwright",
      enabled: true,
      headless: process.env.HEADLESS === "true",
      screenshotFailures: false,
      instances: [
        {
          browser: "chromium",
          launch: {
            args: ["--ignore-gpu-blocklist", "--use-gl=angle"]
          }
        }
      ]
    }
  }
});
