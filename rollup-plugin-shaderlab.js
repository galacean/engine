/**
 * Rollup plugin for ShaderLab precompilation.
 *
 * Transforms .gs and .shader ShaderLab source files at build time.
 *
 * When precompile=false: exports source as string (same as glsl plugin).
 * When precompile=true:
 *   - .gs files: emits a .gsp JSON file to dist/, JS module exports raw source string
 *   - .shader files: JS module exports the precompiled IPrecompiledShader JSON object
 *     so that ShaderPool.registerShaders() can call Shader._createFromPrecompiled()
 *     without needing ShaderLab at runtime
 *
 * Usage in rollup.config.js:
 *   import shaderlab from "./rollup-plugin-shaderlab";
 *   plugins: [shaderlab({ precompile: true, platformTarget: 0 })]
 */

import path from "path";
import { createFilter } from "@rollup/pluginutils";

export default function shaderlab(userOptions = {}) {
  const options = Object.assign(
    {
      include: [/\.(gs|shader)$/],
      exclude: [],
      /** When true, precompile shader sources. When false, just export string. */
      precompile: true,
      /** ShaderLanguage enum value: 0 = GLSLES100, 1 = GLSLES300 */
      platformTarget: 0,
      /** Base path for resolving #include directives */
      basePath: "shaders://root/"
    },
    userOptions
  );

  const filter = createFilter(options.include, options.exclude);

  // Lazy-loaded ShaderLab instance (only when precompile=true)
  let shaderLabInstance = null;

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

    transform(code, id) {
      if (!filter(id)) return;

      const isShaderFile = /\.shader$/.test(id);

      // JS module exports the raw source string (fallback for non-precompile mode).
      const stringOutput = {
        code: `export default ${JSON.stringify(code)}; // eslint-disable-line`,
        map: { mappings: "" }
      };

      if (!options.precompile) {
        return stringOutput;
      }

      try {
        const shaderLab = getShaderLab();

        // Guard: _precompile may not exist if shader-lab dist is stale.
        if (typeof shaderLab._precompile !== "function") {
          this.warn(
            `_precompile not available (shader-lab dist may be stale), skipping precompile for ${path.basename(id)}. Re-run build.`
          );
          return stringOutput;
        }

        const precompiled = shaderLab._precompile(code, options.platformTarget, options.basePath);

        if (isShaderFile) {
          // .shader files: export the precompiled IPrecompiledShader object directly.
          // This allows ShaderPool.registerShaders() to call Shader._createFromPrecompiled()
          // without needing ShaderLab at runtime.
          return {
            code: `export default ${JSON.stringify(precompiled)}; // eslint-disable-line`,
            map: { mappings: "" }
          };
        } else {
          // .gs files: emit a standalone .gsp JSON file to dist/, keep source string export.
          const gspFileName = path.basename(id).replace(/\.gs$/, ".gsp");
          this.emitFile({
            type: "asset",
            fileName: gspFileName,
            source: JSON.stringify(precompiled)
          });
          return stringOutput;
        }
      } catch (e) {
        this.warn(
          `ShaderLab precompilation failed for ${path.basename(id)}: ${e.message || e}. Falling back to string export.`
        );
        return stringOutput;
      }
    }
  };
}
