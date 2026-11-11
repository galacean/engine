import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { engineModify } from "@galacean/engine-modify/vite";
import { projectAssets } from "./scripts/project-assets.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const plantBuild = require("../packages/farming/src/farming/tools/plant-shader-precompile.cjs");
const treeBuild = require("../packages/vegetation/src/asset-assembly/offline/tree-reconstruction-service.cjs");
const waterBuild = require("../packages/water/src/water/build/WaterShaderProductionAssetPlugin.cjs");

const world = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(world);
function shaderLibrary(directory, prefix = "ShaderLibrary") {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name),
      name = `${prefix}/${entry.name}`;
    return entry.isDirectory()
      ? shaderLibrary(file, name)
      : entry.name.endsWith(".glsl")
        ? [{ path: name, source: fs.readFileSync(file, "utf8") }]
        : [];
  });
}
const demo = process.env.WORLD_DEMO || "seed-world";
if (!/^[a-z0-9/-]+$/.test(demo) || demo.includes("..")) throw new Error("Invalid WORLD_DEMO path");
const entry = path.join(world, "demos", demo, "index.html");
if (demo !== "all" && !fs.existsSync(entry)) throw new Error(`Unknown World demo: ${demo}`);
const entries =
  demo === "all"
    ? JSON.parse(fs.readFileSync(path.join(world, "demos.json"), "utf8"))
        .filter((item) => item.mode === "static")
        .map((item) => path.join(world, item.entry))
    : [entry];

export default {
  root,
  base: "./",
  plugins: [
    engineModify(),
    projectAssets(root),
    treeBuild.createTreeReconstructionServer(),
    plantBuild.plantShaderPrecompile({
      shaderLibrary: shaderLibrary(path.join(root, "packages/modify/.cache/shader-src/ShaderLibrary"))
    }),
    waterBuild.createWaterShaderProductionAssetPlugin(path.join(root, "packages/water/src/water/shaders"))
  ],
  server: { host: "127.0.0.1", port: 5193, open: `/world/demos/${demo}/index.html`, fs: { allow: [root] } },
  resolve: {
    dedupe: ["@galacean/engine", "@galacean/engine-core"],
    // Vite's root is the repository, but these browser dependencies belong to World.
    alias: [
      { find: /^esbuild-wasm$/, replacement: path.dirname(require.resolve("esbuild-wasm/package.json")) },
      { find: /^re2js$/, replacement: path.dirname(path.dirname(require.resolve("re2js"))) }
    ]
  },
  esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } } },
  // Inline Workers must remain classic-script compatible, as in engine-next.
  worker: {
    format: "iife",
    plugins: [engineModify(), projectAssets(root)],
    // WASM loaders may contain conditional imports; classic workers need one chunk.
    rollupOptions: { output: { inlineDynamicImports: true } }
  },
  optimizeDeps: { include: ["typescript", "esbuild-wasm", "re2js"] },
  build: {
    target: "esnext",
    outDir: path.join(world, "dist", demo),
    emptyOutDir: true,
    rollupOptions: { input: entries }
  }
};
