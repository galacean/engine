import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { engineModify } from "@galacean/engine-modify/vite";
import { PUGC_UNSUPPORTED_ASSET_EXTENSIONS, projectAssets } from "./scripts/project-assets.mjs";
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
const flashApp = process.env.WORLD_FLASH_APP === "1";
const demo = flashApp ? "seed-world" : process.env.WORLD_DEMO || "seed-world";
if (!/^[a-z0-9/-]+$/.test(demo) || demo.includes("..")) throw new Error("Invalid WORLD_DEMO path");
const entry = path.join(world, "demos", demo, "index.html");
if (demo !== "all" && !fs.existsSync(entry)) throw new Error(`Unknown World demo: ${demo}`);
const entries =
  demo === "all"
    ? JSON.parse(fs.readFileSync(path.join(world, "demos.json"), "utf8"))
        .filter((item) => item.mode === "static")
        .map((item) => path.join(world, item.entry))
    : [entry];
const outDir = process.env.WORLD_OUT_DIR
  ? path.resolve(process.env.WORLD_OUT_DIR)
  : path.join(world, "dist", flashApp ? "seed-world-flash-app" : demo);

function flashAppAssetFileName(assetInfo) {
  const extension = path.extname(assetInfo.name || "").toLowerCase();
  const suffix = PUGC_UNSUPPORTED_ASSET_EXTENSIONS.has(extension) ? "[extname].wasm" : "[extname]";
  return `assets/[name]-[hash]${suffix}`;
}

const VITE_MODULE_WORKER_PATTERN =
  /new Worker\(\s*new URL\(\s*""\s*\+\s*new URL\(\s*(["'])([^"']+)\1\s*,\s*import\.meta\.url\s*\)\.href\s*,\s*self\.location\s*\)\s*,\s*\{\s*type:\s*["']module["']\s*\}\s*\)/gu;
const FLASH_APP_CLASSIC_WORKER_HELPER =
  'function __flashAppCreateClassicWorker(u){var t=typeof window!=="undefined"&&window.__seedWorldBootTrace;if(t)t.event("info","worker","spawn",u);var w=new Worker(URL.createObjectURL(new Blob(["self.__FLASH_APP_WORKER_BASE_URL__="+JSON.stringify(u)+";try{importScripts("+JSON.stringify(u)+");}catch(e){setTimeout(function(){throw e;},0);}"],{type:"text/javascript"})));w.addEventListener("error",function(e){var tr=typeof window!=="undefined"&&window.__seedWorldBootTrace;if(tr)tr.event("error","worker","load/runtime error: "+(e.message||"unknown"),u);});return w;}\n';

/**
 * Flash App production runs inside an `about:srcdoc` iframe with static assets potentially on a
 * separate CDN origin, and mobile WebViews such as DingTalk UWS do not support `{ type: "module" }`
 * Workers. Since `worker.format` is already classic IIFE, boot emitted Worker files through a
 * same-origin classic Blob `importScripts(...)` shim and pass the real CDN base URL for relative
 * `new URL(..., self.location.href)` lookups inside those Workers.
 */
function flashAppClassicWorkers() {
  return {
    name: "flash-app-classic-workers",
    generateBundle(_options, bundle) {
      const workerFiles = new Set();
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue;
        let replaced = false;
        const nextCode = item.code.replace(VITE_MODULE_WORKER_PATTERN, (_match, quote, fileName) => {
          replaced = true;
          workerFiles.add(fileName);
          return `__flashAppCreateClassicWorker(new URL(${quote}${fileName}${quote},import.meta.url).href)`;
        });
        if (replaced) {
          item.code = FLASH_APP_CLASSIC_WORKER_HELPER + nextCode;
        }
      }
      for (const fileName of workerFiles) {
        const assetKey = `assets/${fileName}`;
        const asset = bundle[assetKey];
        if (!asset || asset.type !== "asset") continue;
        const source = typeof asset.source === "string" ? asset.source : Buffer.from(asset.source).toString("utf8");
        asset.source = source.replace(
          /,\s*self\.location\.href\s*\)/gu,
          ",(self.__FLASH_APP_WORKER_BASE_URL__||self.location.href))"
        );
      }
    }
  };
}

export default {
  root: flashApp ? path.join(world, "demos", demo) : root,
  base: "./",
  plugins: [
    engineModify(),
    projectAssets(root, { pugcCompatible: flashApp }),
    treeBuild.createTreeReconstructionServer(),
    plantBuild.plantShaderPrecompile({
      shaderLibrary: shaderLibrary(path.join(root, "packages/modify/.cache/shader-src/ShaderLibrary"))
    }),
    waterBuild.createWaterShaderProductionAssetPlugin(path.join(root, "packages/water/src/water/shaders")),
    ...(flashApp ? [flashAppClassicWorkers()] : [])
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
    plugins: [engineModify(), projectAssets(root, { pugcCompatible: flashApp })],
    // WASM loaders may contain conditional imports; classic workers need one chunk.
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        ...(flashApp ? { assetFileNames: flashAppAssetFileName } : {})
      }
    }
  },
  optimizeDeps: { include: ["typescript", "esbuild-wasm", "re2js"] },
  build: {
    target: "esnext",
    outDir,
    emptyOutDir: true,
    ...(flashApp ? { assetsInlineLimit: 0 } : {}),
    ...(process.env.WORLD_MINIFY === "0" ? { minify: false } : {}),
    rollupOptions: {
      input: entries,
      ...(flashApp ? { output: { assetFileNames: flashAppAssetFileName } } : {})
    }
  }
};
