import { defineProject } from "vitest/config";
import type {} from "@vitest/browser/providers/playwright";

export default defineProject({
  esbuild: {
    target: "es2022"
  },
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
      screenshotFailures: false,
      instances: [
        {
          browser: "chromium",
          launch: {
            args:
              process.env.HEADLESS === "true"
                ? ["--use-gl=egl", "--ignore-gpu-blocklist", "--use-gl=angle", "--headless"]
                : ["--use-gl=egl", "--ignore-gpu-blocklist", "--use-gl=angle"]
          }
        }
      ]
    }
  }
});
