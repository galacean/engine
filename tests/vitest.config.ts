import { defineProject } from "vitest/config";
import type {} from "@vitest/browser/providers/playwright";
import { fileURLToPath } from "node:url";

export default defineProject({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    port: 51204
  },
  optimizeDeps: {
    exclude: [
      "@galacean/engine",
      "@galacean/engine-loader",
      "@galacean/engine-rhi-webgl",
      "@galacean/engine-math",
      "@galacean/engine-core",
      "@galacean/engine-design",
      "@galacean/engine-shader",
      "@galacean/engine-shader-analyzer",
      "@galacean/engine-shader-compiler",
      "@galacean/engine-shader-parser/internal",
      "@galacean/engine-shader-parser/internal/analyzer",
      "playwright",
      "playwright-core",
      "fsevents"
    ]
  },
  test: {
    include: ["src/**/*.test.ts"],
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
