import { defineProject } from "vitest/config";
import type {} from "@vitest/browser/providers/playwright";
import type { BrowserContext } from "playwright";
import { fileURLToPath } from "node:url";
import { resolve, relative, isAbsolute } from "node:path";

const repository = fileURLToPath(new URL("..", import.meta.url));
const assetRoutes = new WeakMap<BrowserContext, Map<string, Promise<void>>>();

export default defineProject({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    port: 51204
  },
  optimizeDeps: {
    exclude: [
      "@esotericsoftware/spine-core",
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
    include: ["src/**/*.test.ts", "../packages/*/tests/integration/**/*.test.ts"],
    browser: {
      provider: "playwright",
      commands: {
        async mockRemoteAsset({ context }, pattern: string, localFile: string) {
          const path = resolve(repository, localFile);
          const repoPath = relative(repository, path);
          if (repoPath.startsWith("..") || isAbsolute(repoPath)) {
            throw new Error("Asset path must be inside the repository.");
          }

          let routes = assetRoutes.get(context);
          if (!routes) assetRoutes.set(context, (routes = new Map()));
          const key = JSON.stringify([pattern, path]);
          let requested = routes.get(key);
          if (!requested) {
            requested = context.route(new RegExp(pattern), (route) =>
              route.fulfill({ path, headers: { "Access-Control-Allow-Origin": "*" } })
            );
            routes.set(key, requested);
            requested.catch(() => routes.delete(key));
          }
          await requested;
        }
      },
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
