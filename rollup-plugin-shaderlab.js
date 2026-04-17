/**
 * Rollup plugin for ShaderLab.
 *
 * - Transforms .gs ShaderLab source files: exports source as string, optionally emits .gsp to dist/
 * - In watch mode: detects shader/compiler changes and runs precompile at the right timing
 *
 * Note: for non-watch builds (b:module, b:all etc.), precompile runs as a separate
 * npm script step BEFORE rollup to avoid stale dist issues.
 */

import fs from "fs";
import path from "path";
import { createFilter } from "@rollup/pluginutils";
import { execSync } from "child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const SHADERS_DIR = path.join(ROOT, "packages/shader/src/Shaders");
const LIBS_DIR = path.join(ROOT, "packages/shader/libs");
const SHADERLAB_SRC = path.join(ROOT, "packages/shader-lab/src");
const SHADERLIB_SRC = path.join(ROOT, "packages/shader/src/ShaderLibrary");

// Module-level: deferred full precompile flag (for shader-lab source changes)
let _pendingFullPrecompile = false;

/**
 * If the .shader was deleted, remove its .gsp and update libs/index.ts.
 * Returns true if shader exists (needs precompile), false if deleted.
 */
function syncGsp(shaderPath) {
  const rel = path.relative(SHADERS_DIR, shaderPath).replace(/\.shader$/, ".gsp");
  const gspPath = path.join(LIBS_DIR, rel);

  if (fs.existsSync(shaderPath)) return true;

  if (fs.existsSync(gspPath)) {
    fs.unlinkSync(gspPath);
    console.log(`[shaderlab] Removed gsp: libs/${rel}`);
    let dir = path.dirname(gspPath);
    while (dir !== LIBS_DIR && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    }
    // Regenerate libs/index.ts to remove the deleted import
    execSync("node scripts/precompile-shaders.mjs --index-only", { cwd: ROOT, stdio: "inherit" });
  }
  return false;
}

function runPrecompile(mode) {
  try {
    if (mode === "full") {
      execSync("node scripts/precompile-shaders.mjs", { cwd: ROOT, stdio: "inherit" });
    } else {
      execSync(`node scripts/precompile-shaders.mjs "${mode}"`, { cwd: ROOT, stdio: "inherit" });
    }
  } catch (e) {
    console.warn(`[shaderlab] Precompile failed: ${e.message || e}`);
  }
}

export default function shaderlab(userOptions = {}) {
  const options = Object.assign(
    {
      include: [/\.gs$/],
      exclude: [],
      precompile: true,
      platformTarget: 0
    },
    userOptions
  );

  const filter = createFilter(options.include, options.exclude);

  let shaderLabInstance = null;
  let initialPrecompileDone = false;

  function getShaderLab() {
    if (!shaderLabInstance) {
      if (typeof globalThis.window === "undefined") {
        globalThis.window = { devicePixelRatio: 1 };
      }
      if (typeof globalThis.document === "undefined") {
        globalThis.document = { createElement: () => ({}) };
      }
      const { ShaderLab } = require("@galacean/engine-shaderlab");
      shaderLabInstance = new ShaderLab();
    }
    return shaderLabInstance;
  }

  return {
    name: "shaderlab",

    buildStart() {
      if (!options.precompile || initialPrecompileDone || !this.meta.watchMode) return;
      initialPrecompileDone = true;
      console.log("[shaderlab] Initial precompile for watch mode...");
      runPrecompile("full");
    },

    watchChange(id) {
      if (!options.precompile) return;

      // .shader file changed → handle immediately (shader-lab dist is stable)
      if (id.endsWith(".shader") && id.includes(SHADERS_DIR)) {
        if (!syncGsp(id)) return; // deleted — gsp removed
        console.log(`[shaderlab] Precompile: ${path.basename(id)}`);
        runPrecompile(id);
        return;
      }

      // Shader-lab source or glsl include changed → defer full precompile to writeBundle
      if (id.includes(SHADERLAB_SRC) || (id.endsWith(".glsl") && id.includes(SHADERLIB_SRC))) {
        _pendingFullPrecompile = true;
      }
    },

    writeBundle() {
      if (!options.precompile || !_pendingFullPrecompile) return;
      _pendingFullPrecompile = false;
      console.log("[shaderlab] Full precompile (compiler/include changed)...");
      runPrecompile("full");
    },

    transform(code, id) {
      if (!filter(id)) return;

      const jsOutput = {
        code: `export default ${JSON.stringify(code)}; // eslint-disable-line`,
        map: { mappings: "" }
      };

      if (!options.precompile) {
        return jsOutput;
      }

      try {
        const shaderLab = getShaderLab();

        if (typeof shaderLab._precompile !== "function") {
          this.warn(`_precompile not available, skipping .gsp for ${path.basename(id)}.`);
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
        this.warn(`Precompilation failed for ${path.basename(id)}: ${e.message || e}`);
        return jsOutput;
      }
    }
  };
}
