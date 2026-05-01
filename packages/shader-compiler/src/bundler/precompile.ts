import fs from "node:fs";
import path from "node:path";
import { findFiles, shadercPathToVarName, normalizePath, pruneEmptyDirs } from "./utils";

export interface PrecompileOptions {
  /** Absolute or relative path to the directory containing `.shader` sources. */
  input: string;
  /** Absolute or relative path to the directory where `.shaderc` outputs are written. */
  output: string;
  /** Remove `.shaderc` files whose `.shader` source no longer exists, and prune empty dirs. */
  clean?: boolean;
  /** Watch the input dir and re-run incrementally on `.shader` / `.glsl` changes. */
  watch?: boolean;
  /** Compile only this file (path may be relative to cwd). Skips full scan + cleanup. */
  only?: string;
  /** Generate `<output>/index.ts` aggregating every `.shaderc` file. */
  emitIndex?: boolean;
  /** Optional shader platform target passed through to `_precompile`. Defaults to `0`. */
  platformTarget?: number;
}

interface ShaderCompilerInstance {
  _precompile: (source: string, target: number, basePathForIncludeKey: string) => unknown;
  _includeMap: Record<string, string>;
}

// One-shot mode exits non-zero on failure so CI breaks; watch mode logs and keeps running.
export async function precompile(options: PrecompileOptions): Promise<void> {
  const { failed } = await runFull(options);

  if (options.watch) {
    await startWatcher(options);
    return;
  }

  console.log("[shader-compiler-bundler] Done.");
  if (failed > 0) {
    process.exit(1);
  }
}

export async function runFull(options: Omit<PrecompileOptions, "watch">): Promise<{ failed: number }> {
  const inputDir = path.resolve(options.input);
  const outputDir = path.resolve(options.output);
  const platformTarget = options.platformTarget ?? 0;

  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory does not exist: ${inputDir}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const shaderCompiler = await tryLoadShaderCompiler();
  if (!shaderCompiler) return { failed: 0 };

  shaderCompiler._includeMap = collectIncludeMap(inputDir);

  let failed = 0;
  if (options.only) {
    const target = path.resolve(options.only);
    if (!compileSingle(shaderCompiler, target, inputDir, outputDir, platformTarget)) failed++;
  } else {
    const shaderFiles = findFiles(inputDir, ".shader");
    console.log(`[shader-compiler-bundler] Precompiling ${shaderFiles.length} shader(s)...`);
    for (const file of shaderFiles) {
      if (!compileSingle(shaderCompiler, file, inputDir, outputDir, platformTarget)) failed++;
    }
    if (options.clean) {
      const removed = cleanOrphanedBundles(shaderFiles, inputDir, outputDir);
      if (removed > 0) console.log(`[shader-compiler-bundler] Cleaned ${removed} orphaned .shaderc file(s).`);
    }
    if (failed > 0) console.warn(`[shader-compiler-bundler] ${failed} shader(s) failed to precompile.`);
  }

  if (options.emitIndex) {
    emitIndex(outputDir);
  }

  return { failed };
}

export async function startWatcher(options: Omit<PrecompileOptions, "watch" | "only">): Promise<void> {
  const inputDir = path.resolve(options.input);
  const outputDir = path.resolve(options.output);
  const platformTarget = options.platformTarget ?? 0;
  const shaderCompiler = await loadShaderCompiler();
  shaderCompiler._includeMap = collectIncludeMap(inputDir);

  // .glsl change → full recompile (can't cheaply track include graphs).
  // .shader change → single-file recompile.
  const handleInputChange = (filename: string | null) => {
    if (!filename) return;
    const norm = normalizePath(filename);
    const fullPath = path.join(inputDir, filename);

    if (norm.endsWith(".glsl")) {
      console.log(`[shader-compiler-bundler] Include changed (${norm}), full recompile...`);
      shaderCompiler._includeMap = collectIncludeMap(inputDir);
      runFull(options as Omit<PrecompileOptions, "watch" | "only">).catch((e) => console.error(e));
      return;
    }

    if (!norm.endsWith(".shader")) return;
    if (!fs.existsSync(fullPath)) {
      removeBundleFor(fullPath, inputDir, outputDir);
    } else {
      compileSingle(shaderCompiler, fullPath, inputDir, outputDir, platformTarget);
    }
    if (options.emitIndex) emitIndex(outputDir);
  };

  console.log(`[shader-compiler-bundler] Watching ${inputDir} ...`);
  fs.watch(inputDir, { recursive: true }, (_event, filename) => handleInputChange(filename));
}

// Browser-globals shim: loaded runtime transitively imports engine utilities
// whose module-load touches `window`/`document`.
async function loadShaderCompiler(): Promise<ShaderCompilerInstance> {
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  if (typeof g.window === "undefined") g.window = { devicePixelRatio: 1 };
  if (typeof g.document === "undefined") g.document = { createElement: () => ({}) };

  // @ts-ignore — `../main.js` is the compiled runtime entry; no .ts source.
  const mod = (await import("../main.js")) as { ShaderCompiler: new () => ShaderCompilerInstance };
  const instance = new mod.ShaderCompiler();
  if (typeof instance._precompile !== "function") {
    throw new Error("ShaderCompiler._precompile is not available; rebuild @galacean/engine-shader-compiler first.");
  }
  return instance;
}

// Cold-start: returns `null` on a fresh CI checkout missing `dist/main.js`
// so the rollup plugin can skip precompile and let the workspace build
// produce the runtimes; a follow-up pass emits the .shaderc outputs.
async function tryLoadShaderCompiler(): Promise<ShaderCompilerInstance | null> {
  try {
    return await loadShaderCompiler();
  } catch (e) {
    const msg = (e as Error).message;
    console.warn(`[shader-compiler-bundler] Precompile skipped — runtime not yet built (${msg})`);
    console.warn("[shader-compiler-bundler] Re-run after the workspace build to regenerate .shaderc outputs.");
    return null;
  }
}

// Read includes from src by convention: <inputDir>/*.glsl + sibling
// <ShaderLibrary>/*.glsl. Injected into `shaderCompiler._includeMap`, so the
// preprocessor never reads from any dist snapshot.
function collectIncludeMap(inputDir: string): Record<string, string> {
  const map: Record<string, string> = {};

  for (const file of findFiles(inputDir, ".glsl")) {
    const relPath = normalizePath(path.relative(inputDir, file));
    map[relPath] = fs.readFileSync(file, "utf-8");
  }

  const libraryDir = path.join(path.dirname(inputDir), "ShaderLibrary");
  if (fs.existsSync(libraryDir)) {
    for (const file of findFiles(libraryDir, ".glsl")) {
      const rel = normalizePath(path.relative(libraryDir, file));
      map[`ShaderLibrary/${rel}`] = fs.readFileSync(file, "utf-8");
    }
  }

  return map;
}

// Mirrors `ShaderPass._shaderRootPath` in engine; inlined to keep bundler engine-free.
const SHADER_ROOT_PATH = "shaders://root/";

function compileSingle(
  shaderCompiler: ShaderCompilerInstance,
  shaderPath: string,
  inputDir: string,
  outputDir: string,
  platformTarget: number
): boolean {
  const source = fs.readFileSync(shaderPath, "utf-8");
  const relativePath = normalizePath(path.relative(inputDir, shaderPath));
  const bundleRelative = relativePath.replace(/\.shader$/, ".shaderc");
  const bundlePath = path.join(outputDir, bundleRelative);
  const basePathForIncludeKey = new URL(relativePath, SHADER_ROOT_PATH).href;

  fs.mkdirSync(path.dirname(bundlePath), { recursive: true });

  try {
    const precompiled = shaderCompiler._precompile(source, platformTarget, basePathForIncludeKey);
    fs.writeFileSync(bundlePath, JSON.stringify(precompiled));
    console.log(`  ${relativePath} -> ${bundleRelative}`);
    return true;
  } catch (e) {
    console.error(`  FAILED: ${relativePath}`);
    console.error(e);
    return false;
  }
}

function cleanOrphanedBundles(shaderFiles: string[], inputDir: string, outputDir: string): number {
  const aliveSet = new Set(shaderFiles.map((f) => normalizePath(path.relative(inputDir, f)).replace(/\.shader$/, "")));
  const bundleFiles = findFiles(outputDir, ".shaderc");
  let removed = 0;

  for (const bundleFile of bundleFiles) {
    const rel = normalizePath(path.relative(outputDir, bundleFile)).replace(/\.shaderc$/, "");
    if (!aliveSet.has(rel)) {
      fs.unlinkSync(bundleFile);
      console.log(`  Removed orphaned: ${rel}.shaderc`);
      removed++;
      pruneEmptyDirs(path.dirname(bundleFile), outputDir);
    }
  }
  return removed;
}

function emitIndex(outputDir: string): void {
  const bundleFiles = findFiles(outputDir, ".shaderc");
  const entries = bundleFiles
    .map((file) => {
      const rel = normalizePath(path.relative(outputDir, file));
      return { varName: shadercPathToVarName(rel), importPath: `./${rel}` };
    })
    .sort((a, b) => a.varName.localeCompare(b.varName));

  const imports = entries.map((e) => `import ${e.varName} from "${e.importPath}";`).join("\n");
  const exportBlock = `export {\n${entries.map((e) => `  ${e.varName}`).join(",\n")}\n};`;
  // prettier-ignore the export block: consumer's prettier config is unknown.
  const content = `// Auto-generated by shader-precompile --emit-index — do not edit\n${imports}\n\n// prettier-ignore\n${exportBlock}\n`;

  const indexPath = path.join(outputDir, "index.ts");
  const existing = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf-8") : "";
  if (content !== existing) {
    fs.writeFileSync(indexPath, content);
    console.log("  Updated index.ts");
  }
}

function removeBundleFor(shaderPath: string, inputDir: string, outputDir: string): void {
  const rel = normalizePath(path.relative(inputDir, shaderPath)).replace(/\.shader$/, ".shaderc");
  const bundlePath = path.join(outputDir, rel);
  if (fs.existsSync(bundlePath)) {
    fs.unlinkSync(bundlePath);
    console.log(`  Removed: ${rel}`);
    pruneEmptyDirs(path.dirname(bundlePath), outputDir);
  }
}
