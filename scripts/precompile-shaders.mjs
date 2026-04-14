#!/usr/bin/env node
/**
 * Precompile all built-in .shader files to .gsp (JSON) files.
 *
 * Usage:
 *   node scripts/precompile-shaders.mjs              # full: all shaders
 *   node scripts/precompile-shaders.mjs path/to/X.shader  # single file
 *
 * Output: packages/shader/libs/<mirrored-path>.gsp
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SHADERS_DIR = path.join(ROOT, "packages/shader/src/Shaders");
const LIBS_DIR = path.join(ROOT, "packages/shader/libs");

// Provide browser shims so engine-core can load in Node.js
if (typeof globalThis.window === "undefined") {
  globalThis.window = { devicePixelRatio: 1 };
}
if (typeof globalThis.document === "undefined") {
  globalThis.document = { createElement: () => ({}) };
}

// Load ShaderLab — this transitively loads engine-core,
// which runs ShaderPool.init() and registers all include fragments.
const { ShaderLab } = await import(
  path.resolve(ROOT, "packages/shader-lab/dist/main.js")
);
const shaderLab = new ShaderLab();

if (typeof shaderLab._precompile !== "function") {
  console.error("Error: ShaderLab._precompile not available. Rebuild shader-lab first.");
  process.exit(1);
}

/**
 * Precompile a single .shader file and write the .gsp output.
 * @param {string} shaderPath - Absolute path to the .shader file
 */
function precompileSingle(shaderPath) {
  const source = fs.readFileSync(shaderPath, "utf-8");
  const relativePath = path.relative(SHADERS_DIR, shaderPath);
  const gspRelative = relativePath.replace(/\.shader$/, ".gsp");
  const gspPath = path.join(LIBS_DIR, gspRelative);

  const gspDir = path.dirname(gspPath);
  if (!fs.existsSync(gspDir)) {
    fs.mkdirSync(gspDir, { recursive: true });
  }

  try {
    const precompiled = shaderLab._precompile(source, 0);
    fs.writeFileSync(gspPath, JSON.stringify(precompiled));
    console.log(`  ${relativePath} → libs/${gspRelative}`);
  } catch (e) {
    console.error(`  FAILED: ${relativePath} — ${e?.message ?? e ?? "unknown error"}`);
    return false;
  }
  return true;
}

/**
 * Recursively find all .shader files in a directory.
 */
function findShaderFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findShaderFiles(fullPath));
    } else if (entry.name.endsWith(".shader")) {
      results.push(fullPath);
    }
  }
  return results;
}

// Main
const singleFile = process.argv[2];
if (singleFile) {
  const absPath = path.resolve(singleFile);
  console.log(`Precompiling single shader: ${path.basename(absPath)}`);
  precompileSingle(absPath);
} else {
  const shaderFiles = findShaderFiles(SHADERS_DIR);
  console.log(`Precompiling ${shaderFiles.length} shaders...`);
  let failed = 0;
  for (const file of shaderFiles) {
    if (!precompileSingle(file)) failed++;
  }
  if (failed > 0) {
    console.warn(`\n${failed} shader(s) failed to precompile (non-fatal).`);
  }
}
console.log("Done.");
