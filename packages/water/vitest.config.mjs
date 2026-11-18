import { defineConfig } from "vitest/config";
import { engineModify } from "../modify/build/vite.mjs";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(new URL("../../world/package.json", import.meta.url));

export default defineConfig({
  plugins: [engineModify()],
  resolve: { alias: [
    { find: /^esbuild-wasm$/, replacement: path.dirname(require.resolve("esbuild-wasm/package.json")) },
    { find: /^re2js$/, replacement: path.dirname(path.dirname(require.resolve("re2js"))) }
  ] },
  optimizeDeps: { noDiscovery: true, entries: [], include: ["typescript", "esbuild-wasm", "re2js"], needsInterop: ["typescript", "esbuild-wasm"] },
  esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } } },
  worker: { plugins: () => [engineModify()] },
  test: {
    name: "water", include: ["packages/water/tests/*.test.ts", "packages/world-planning/tests/*Water*.test.ts", "world/demos/seed-world/tests/Water*.test.ts"], testTimeout: 30000,
    browser: { enabled: true, provider: "playwright", headless: true,
      screenshotFailures: false,
      instances: [{ browser: "chromium", launch: { args: ["--ignore-gpu-blocklist", "--use-angle=metal"] } }] }
  }
});
