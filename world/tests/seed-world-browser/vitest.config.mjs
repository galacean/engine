import path from "node:path";
import { fileURLToPath } from "node:url";
import worldConfig from "../../vite.config.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const engineTests = path.resolve(directory, "../../../tests/src");
export default {
  ...worldConfig,
  optimizeDeps: {
    ...worldConfig.optimizeDeps,
    include: [...worldConfig.optimizeDeps.include, "mdast-util-from-markdown"],
    noDiscovery: true,
    entries: [],
    needsInterop: ["typescript", "esbuild-wasm"]
  },
  server: { ...worldConfig.server, open: false },
  worker: { ...worldConfig.worker, plugins: () => worldConfig.worker.plugins },
  test: {
    name: "seed-world-browser",
    // Exercise the upstream contracts that World shaders and resource loaders can override.
    include: [
      path.join(directory, "*.test.ts"),
      path.join(engineTests, "core/lighting/LightAttenuation.test.ts"),
      path.join(engineTests, "core/resource/{ReferResource,ResourceManager}.test.ts"),
      path.join(engineTests, "loader/{AnimatorControllerLoader,GLTFLoader,PrefabResource,SpriteAtlasLoader}.test.ts")
    ],
    testTimeout: 30000,
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: "chromium", launch: { args: ["--ignore-gpu-blocklist", "--use-angle=metal"] } }]
    }
  }
};
