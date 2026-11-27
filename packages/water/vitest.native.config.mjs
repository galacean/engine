import path from "node:path";
import config from "./vitest.config.mjs";

// Test freshly built native/Modify modules without requiring a complete declaration/archive bundle.
const engineRoot = process.env.WATER_TEST_ENGINE_ROOT;
if (!engineRoot) throw new Error("WATER_TEST_ENGINE_ROOT must point to a built Engine workspace.");
const packages = path.resolve(engineRoot, "packages");
config.plugins = [];
config.worker = { plugins: () => [] };
config.resolve.alias.unshift(
  ...["core", "math", "design", "loader", "rhi-webgl", "shader", "shader-compiler"].map((name) => ({
    find: `@galacean/engine-${name}`,
    replacement: path.join(packages, name, "dist/module.js")
  })),
  { find: "@galacean/engine", replacement: path.join(packages, "galacean/dist/module.js") }
);
if (process.env.WATER_TEST_CHROME)
  config.test.browser.instances[0].launch.executablePath = process.env.WATER_TEST_CHROME;
export default config;
