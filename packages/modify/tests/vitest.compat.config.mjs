import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { engineModify } from "../build/vite.mjs";

// Exercise the same source substitutions used by World, without a second Engine build.
export default defineConfig({
  root: fileURLToPath(new URL("../../../tests", import.meta.url)),
  plugins: [engineModify()],
  optimizeDeps: {
    exclude: [
      "@swc/helpers",
      "@galacean/engine-shader-compiler/precompile",
      "@galacean/engine-shader-parser/internal",
      "@galacean/engine-shader-parser/internal/analyzer",
      "@galacean/engine-shader-parser/shared",
      "playwright",
      "playwright-core",
      "fsevents"
    ]
  },
  test: {
    include: [
      "../packages/modify/tests/MaterialLoaderCompatibility.test.ts",
      "../packages/modify/tests/ShaderPassCompatibility.test.ts",
      "src/core/Shader.test.ts",
      "src/core/ShaderIdentity.test.ts",
      "src/loader/ShaderLoader.test.ts",
      "src/shader-compiler/TransformFeedbackNames.test.ts",
      "src/shader-compiler/InterfaceMRTConversion.test.ts"
    ],
    browser: {
      enabled: true,
      headless: true,
      provider: "playwright",
      screenshotFailures: false,
      instances: [{ browser: "chromium", launch: { args: ["--ignore-gpu-blocklist", "--use-gl=angle"] } }]
    }
  }
});
