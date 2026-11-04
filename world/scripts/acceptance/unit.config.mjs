import fs from "node:fs";
import { nativePaths } from "./native-paths.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { engineModify } from "../../../packages/modify/build/vite.mjs";
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const { plantShaderPrecompile } = require("../../../packages/farming/src/farming/tools/plant-shader-precompile.cjs");
const baseline = process.env.TEST_VARIANT === "baseline";
const root = baseline
  ? path.resolve(repository, "../engine-next/world/.materialized/engine/world-gallery")
  : path.join(repository, "world/.acceptance/tests");
const baselineRequire = createRequire(path.join(root, "package.json"));
const baselinePlant = baseline
  ? baselineRequire("./shared/farming/tools/plant-shader-precompile.cjs").plantShaderPrecompile
  : null;
const group = process.env.TEST_GROUP || "water";
const groups = {
  regressions: [path.join(repository, "packages/world-planning/tests/**/*.spec.ts")],
  water: ["demos/water/tests/**/*.test.ts", "shared/water/tests/**/*.test.ts"],
  terrain: ["demos/terrain/project-tests/**/*.spec.ts"],
  animals: ["shared/gameplay/tests/**/*.spec.ts"],
  farming: ["shared/farming/tests/**/*.spec.ts"],
  editor: [
    "tests/runtime-editor/**/*.spec.ts",
    "shared/ai-chat/tests/**/*.spec.ts",
    "shared/runtime-editor/tests/**/*.spec.ts",
    "shared/runtime-editor-agent/tests/**/*.spec.ts"
  ],
  environment: ["demos/volumetric-clouds/tests/**/*.spec.ts", "demos/screen-space-reflection/tests/**/*.spec.ts"]
};
const shaderRoot = path.join(repository, "packages/modify/.cache/shader-src/ShaderLibrary");
const shaderLibrary = [];
function shaders(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) shaders(p);
    else if (e.name.endsWith(".glsl"))
      shaderLibrary.push({ path: "ShaderLibrary/" + path.relative(shaderRoot, p), source: fs.readFileSync(p, "utf8") });
  }
}
shaders(shaderRoot);
export default {
  root,
  plugins: baseline
    ? [baselinePlant()]
    : [nativePaths(repository), engineModify(), plantShaderPrecompile({ shaderLibrary })],
  define: { __buildVersion: JSON.stringify("migration-acceptance") },
  esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } } },
  resolve: {
    dedupe: ["@galacean/engine", "@galacean/engine-core"],
    ...(baseline
      ? {
          alias: {
            "@galacean/engine-ui": path.resolve(root, "../packages/ui/src/index.ts"),
            "@galacean/engine-physics-physx": path.resolve(root, "../packages/physics-physx/src/index.ts")
          }
        }
      : {})
  },
  test: {
    environment: "node",
    diff: { truncateThreshold: 80 },
    include: groups[group],
    exclude: ["**/*.e2e.spec.ts", "demos/terrain/project-tests/runtime.spec.ts"],
    setupFiles: [
      path.join(repository, "world/scripts/acceptance/unit-setup.mjs"),
      ...(group === "terrain" ? [path.join(root, "demos/terrain/project-tests/SeedWorldProjectTestSetup.ts")] : [])
    ],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: [
      "default",
      "json",
      ...(group === "terrain" ? [path.join(repository, "world/scripts/acceptance/incremental-reporter.mjs")] : [])
    ],
    outputFile: path.join(repository, `world/.acceptance/${baseline ? "baseline" : "migrated"}-${group}-unit.json`)
  }
};
