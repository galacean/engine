/**
 * Rollup plugin for ShaderLab precompilation.
 *
 * Transforms .gs/.gsl ShaderLab source files at build time.
 *
 * When precompile=false: exports source as string (same as glsl plugin).
 * When precompile=true:
 *   - Emits a standalone .gsp JSON file to dist/
 *   - JS module exports the raw ShaderLab source string (unchanged)
 *   - The .gsp file can be loaded at runtime via ShaderLoader
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
      include: [/\.(gs|gsl)$/],
      exclude: [],
      /** When true, emit .gsp JSON to dist/. When false, just export string. */
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
      // Register built-in include fragments (Common.glsl, Light.glsl, etc.)
      // so that #include directives in .gs files can be resolved.
      try {
        const { registerIncludes } = require("@galacean/engine-shader");
        registerIncludes();
      } catch (e) {
        // @galacean/engine-shader may not be available in all contexts
      }
      shaderLabInstance = new ShaderLab();
    }
    return shaderLabInstance;
  }

  return {
    name: "shaderlab",

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

        const precompiled = shaderLab._precompile(code, options.platformTarget, options.basePath);
        const gspFileName = path.basename(id).replace(/\.(gs|gsl)$/, ".gsp");

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
