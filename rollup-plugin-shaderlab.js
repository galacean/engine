/**
 * Rollup plugin for ShaderLab precompilation.
 *
 * Transforms .gs/.gsl ShaderLab source files at build time.
 *
 * When precompile=false: exports source as string (same as glsl plugin).
 * When precompile=true:
 *   - Emits a standalone .gsb binary file to dist/
 *   - JS module exports the raw ShaderLab source string (unchanged, same as precompile=false)
 *   - The .gsb file can be loaded at runtime via PrecompiledShaderLoader
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
      /** When true, emit .gsb binary to dist/. When false, just export string. */
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

  /** Encode IPrecompiledShader to .gsb ArrayBuffer (8-byte header + JSON payload). */
  function encodeGsb(data) {
    const json = JSON.stringify(data);
    const jsonBytes = Buffer.from(json, "utf8");
    const buffer = Buffer.alloc(8 + jsonBytes.length);
    buffer.writeUInt32LE(0x00425347, 0); // magic "GSB\0"
    buffer.writeUInt16LE(1, 4);          // version
    jsonBytes.copy(buffer, 8);
    return buffer;
  }

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
      // This keeps Shader.create(PBRSource) working as the live-compilation fallback,
      // and tests can always get the raw ShaderLab source.
      const jsOutput = {
        code: `export default ${JSON.stringify(code)}; // eslint-disable-line`,
        map: { mappings: "" }
      };

      if (!options.precompile) {
        return jsOutput;
      }

      // Precompile mode: additionally emit a .gsb binary file to dist/.
      // The .gsb can be loaded at runtime via PrecompiledShaderLoader for zero-parse loading.
      try {
        const shaderLab = getShaderLab();
        const precompiled = shaderLab._precompile(code, options.platformTarget, options.basePath);
        const buffer = encodeGsb(precompiled);
        const gsbFileName = path.basename(id).replace(/\.(gs|gsl)$/, ".gsb");

        this.emitFile({
          type: "asset",
          fileName: gsbFileName,
          source: Buffer.from(new Uint8Array(buffer))
        });

        return jsOutput;
      } catch (e) {
        this.error(`ShaderLab precompilation failed for ${id}: ${e.message || e}`);
      }
    }
  };
}
