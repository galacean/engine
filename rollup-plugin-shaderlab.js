/**
 * Rollup plugin for ShaderLab precompilation.
 *
 * Transforms .gs ShaderLab source files at build time.
 *
 * When precompile=false: exports source as string (same as glsl plugin).
 * When precompile=true:
 *   - .gs files: emits a .gsp JSON file to dist/, JS module exports raw source string
 *   - buildStart: runs full precompile of all .shader files → libs/*.gsp
 *   - watchChange: incrementally precompiles changed .shader files → libs/*.gsp
 *
 * Usage in rollup.config.js:
 *   import shaderlab from "./rollup-plugin-shaderlab";
 *   plugins: [shaderlab({ precompile: true, platformTarget: 0 })]
 */

import path from "path";
import { createFilter } from "@rollup/pluginutils";
import { execSync } from "child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const SHADERS_DIR = path.join(ROOT, "packages/shader/src/Shaders");

export default function shaderlab(userOptions = {}) {
  const options = Object.assign(
    {
      include: [/\.gs$/],
      exclude: [],
      /** When true, precompile shader sources. When false, just export string. */
      precompile: true,
      /** ShaderLanguage enum value: 0 = GLSLES100, 1 = GLSLES300 */
      platformTarget: 0
    },
    userOptions
  );

  const filter = createFilter(options.include, options.exclude);

  // Lazy-loaded ShaderLab instance (only when precompile=true)
  let shaderLabInstance = null;
  let precompiled = false;

  function getShaderLab() {
    if (!shaderLabInstance) {
      // ShaderLab transitively loads @galacean/engine-core which has browser-only
      // top-level code (window.devicePixelRatio etc.). Provide a minimal shim so
      // the module can be loaded in Node.js at build time.
      if (typeof globalThis.window === "undefined") {
        globalThis.window = { devicePixelRatio: 1 };
      }
      if (typeof globalThis.document === "undefined") {
        globalThis.document = { createElement: () => ({}) };
      }
      const { ShaderLab } = require("@galacean/engine-shaderlab");
      // Built-in include fragments are auto-registered by core's ShaderPool.init()
      // which runs when @galacean/engine-core is loaded.
      shaderLabInstance = new ShaderLab();
    }
    return shaderLabInstance;
  }

  return {
    name: "shaderlab",

    buildStart() {
      if (!options.precompile || precompiled) return;
      precompiled = true;
      try {
        console.log("[shaderlab] Precompiling all .shader files → libs/*.gsp ...");
        execSync("node scripts/precompile-shaders.mjs", { cwd: ROOT, stdio: "inherit" });
      } catch (e) {
        this.warn(`Shader precompilation failed: ${e.message || e}`);
      }
    },

    watchChange(id) {
      if (!options.precompile) return;
      if (id.endsWith(".shader") && id.includes(SHADERS_DIR)) {
        try {
          console.log(`[shaderlab] Incremental precompile: ${path.basename(id)}`);
          execSync(`node scripts/precompile-shaders.mjs "${id}"`, { cwd: ROOT, stdio: "inherit" });
        } catch (e) {
          this.warn(`Incremental precompile failed for ${path.basename(id)}: ${e.message || e}`);
        }
      }
    },

    transform(code, id) {
      if (!filter(id)) return;

      // JS module always exports the raw source string.
      const jsOutput = {
        code: `export default ${JSON.stringify(code)}; // eslint-disable-line`,
        map: { mappings: "" }
      };

      if (!options.precompile) {
        return jsOutput;
      }

      // Precompile mode: additionally emit a .gsp JSON file to dist/.
      try {
        const shaderLab = getShaderLab();

        // Guard: _precompile may not exist if shader-lab dist is stale.
        if (typeof shaderLab._precompile !== "function") {
          this.warn(
            `_precompile not available (shader-lab dist may be stale), skipping .gsp for ${path.basename(id)}. Re-run build to generate .gsp.`
          );
          return jsOutput;
        }

        const precompiled = shaderLab._precompile(code, options.platformTarget);
        const gspFileName = path.basename(id).replace(/\.gs$/, ".gsp");

        this.emitFile({
          type: "asset",
          fileName: gspFileName,
          source: JSON.stringify(precompiled)
        });

        return jsOutput;
      } catch (e) {
        this.warn(
          `ShaderLab precompilation failed for ${path.basename(id)}: ${e.message || e}. Falling back to string export.`
        );
        return jsOutput;
      }
    }
  };
}
