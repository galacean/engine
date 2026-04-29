import fs from "node:fs";
import path from "node:path";
import { findFiles, gspPathToVarName, normalizePath, pruneEmptyDirs } from "./utils";

export interface PrecompileOptions {
  /** Absolute or relative path to the directory containing `.shader` sources. */
  input: string;
  /** Absolute or relative path to the directory where `.gsp` outputs are written. */
  output: string;
  /** Remove `.gsp` files whose `.shader` source no longer exists, and prune empty dirs. */
  clean?: boolean;
  /** Watch the input dir and re-run incrementally on `.shader` / `.glsl` changes. */
  watch?: boolean;
  /** Compile only this file (path may be relative to cwd). Skips full scan + cleanup. */
  only?: string;
  /** Generate `<output>/index.ts` aggregating every `.gsp` file. */
  emitIndex?: boolean;
  /** Optional shader platform target passed through to `_precompile`. Defaults to `0`. */
  platformTarget?: number;
}

interface ShaderCompilerInstance {
  _precompile: (source: string, target: number) => unknown;
}

interface EngineModule {
  ShaderFactory: { registerInclude: (key: string, source: string) => void };
}

/**
 * Top-level entry: load the shader compiler, dispatch by mode (single / full / watch),
 * and optionally emit the aggregated index file.
 */
export async function precompile(options: PrecompileOptions): Promise<void> {
  await runFull(options);

  if (options.watch) {
    await startWatcher(options);
  } else {
    console.log("[shader-compiler-bundler] Done.");
  }
}

/**
 * Run a one-shot full (or single) precompile pass without watching.
 * Returns after all `.shader` files have been compiled and (optionally)
 * orphans cleaned + index emitted.
 */
export async function runFull(options: Omit<PrecompileOptions, "watch">): Promise<void> {
  const inputDir = path.resolve(options.input);
  const outputDir = path.resolve(options.output);
  const platformTarget = options.platformTarget ?? 0;

  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory does not exist: ${inputDir}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const shaderCompiler = await tryLoadShaderCompiler();
  if (!shaderCompiler) return;

  await registerLocalIncludes(inputDir);

  if (options.only) {
    const target = path.resolve(options.only);
    compileSingle(shaderCompiler, target, inputDir, outputDir, platformTarget);
  } else {
    const shaderFiles = findFiles(inputDir, ".shader");
    console.log(`[shader-compiler-bundler] Precompiling ${shaderFiles.length} shader(s)...`);
    let failed = 0;
    for (const file of shaderFiles) {
      if (!compileSingle(shaderCompiler, file, inputDir, outputDir, platformTarget)) failed++;
    }
    if (options.clean) {
      const removed = cleanOrphanedGsp(shaderFiles, inputDir, outputDir);
      if (removed > 0) console.log(`[shader-compiler-bundler] Cleaned ${removed} orphaned .gsp file(s).`);
    }
    if (failed > 0) console.warn(`[shader-compiler-bundler] ${failed} shader(s) failed to precompile.`);
  }

  if (options.emitIndex) {
    emitIndex(outputDir);
  }
}

/**
 * Start a non-blocking file watcher. Returns a Promise that resolves once the
 * watcher is set up; the watcher itself runs in the background.
 */
export async function startWatcher(options: Omit<PrecompileOptions, "watch" | "only">): Promise<void> {
  const inputDir = path.resolve(options.input);
  const outputDir = path.resolve(options.output);
  const platformTarget = options.platformTarget ?? 0;
  const shaderCompiler = await loadShaderCompiler();

  // A `.glsl` change invalidates every `.shader` that may include it, since we
  // can't cheaply track include graphs across files. Recompile everything
  // under `inputDir` on any `.glsl` event; recompile the single touched
  // `.shader` on a `.shader` event.
  const handleInputChange = (filename: string | null) => {
    if (!filename) return;
    const norm = normalizePath(filename);
    const fullPath = path.join(inputDir, filename);

    if (norm.endsWith(".glsl")) {
      console.log(`[shader-compiler-bundler] Include changed (${norm}), full recompile...`);
      runFull(options as Omit<PrecompileOptions, "watch" | "only">).catch((e) => console.error(e));
      return;
    }

    if (!norm.endsWith(".shader")) return;
    if (!fs.existsSync(fullPath)) {
      removeGspFor(fullPath, inputDir, outputDir);
    } else {
      compileSingle(shaderCompiler, fullPath, inputDir, outputDir, platformTarget);
    }
    if (options.emitIndex) emitIndex(outputDir);
  };

  console.log(`[shader-compiler-bundler] Watching ${inputDir} ...`);
  fs.watch(inputDir, { recursive: true }, (_event, filename) => handleInputChange(filename));
}

/**
 * Provide minimal browser shims so engine-core can load in Node, then import
 * the shader compiler runtime from the parent package's compiled main entry and
 * instantiate the compiler.
 *
 * The bundler CLI is published at `dist/bundler/cli.js`; the runtime compiler
 * lives at `dist/main.js`. Using a relative `../main.js` import (instead of the
 * package self-reference `@galacean/engine-shader-compiler`) avoids any ambiguity
 * around package self-resolution and keeps the bundler entry decoupled from
 * Node's package-name resolution at runtime.
 */
async function loadShaderCompiler(): Promise<ShaderCompilerInstance> {
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  if (typeof g.window === "undefined") g.window = { devicePixelRatio: 1 };
  if (typeof g.document === "undefined") g.document = { createElement: () => ({}) };

  // @ts-ignore — `../main.js` is the compiled runtime entry produced by the
  // root rollup config; it has no TypeScript source counterpart. Resolved at
  // runtime relative to dist/bundler/cli.js (i.e. dist/main.js).
  const mod = (await import("../main.js")) as { ShaderCompiler: new () => ShaderCompilerInstance };
  const instance = new mod.ShaderCompiler();
  if (typeof instance._precompile !== "function") {
    throw new Error("ShaderCompiler._precompile is not available; rebuild @galacean/engine-shader-compiler first.");
  }
  return instance;
}

/**
 * Test whether the shader-compiler runtime + its `@galacean/engine` peer can
 * be loaded right now. Returns `null` (with a log line) when prerequisites
 * are missing — typical on a cold-start CI build where the rollup plugin's
 * `buildStart` fires before any package's `dist/` exists. The plugin uses
 * this to gracefully skip precompile and let the rollup itself build the
 * runtimes; a follow-up `npm run precompile` (or watch-mode change) does
 * the actual gsp emission afterwards.
 */
async function tryLoadShaderCompiler(): Promise<ShaderCompilerInstance | null> {
  try {
    return await loadShaderCompiler();
  } catch (e) {
    const msg = (e as Error).message;
    console.warn(`[shader-compiler-bundler] Precompile skipped — runtime not yet built (${msg})`);
    console.warn("[shader-compiler-bundler] Re-run after the workspace build to regenerate .gsp outputs.");
    return null;
  }
}

/**
 * Register every `.glsl` file under `inputDir` as a relative-path include.
 *
 * `.shader` sources commonly use `#include "./Foo.glsl"` (relative to the
 * source file). The engine's preprocessor resolves these against
 * `ShaderFactory`'s registered include map keyed by exact string. We mirror
 * the basename under `./Name.glsl` so relative includes resolve.
 *
 * Engine's own includes (e.g. `Common/Common.glsl`, `PBR/VertexPBR.glsl`) are
 * already registered by `ShaderPool.init()` when `@galacean/engine` loads —
 * this function only handles project-local fragments.
 */
async function registerLocalIncludes(inputDir: string): Promise<void> {
  // Use a dynamic import so this works both in the ESM bundler entry and the
  // CJS one — rollup leaves `import()` as native dynamic import in both.
  const eng = (await import("@galacean/engine")) as unknown as EngineModule;
  if (!eng?.ShaderFactory?.registerInclude) return;

  for (const file of findFiles(inputDir, ".glsl")) {
    const source = fs.readFileSync(file, "utf-8");
    const basename = path.basename(file);
    eng.ShaderFactory.registerInclude(`./${basename}`, source);
  }
}

/**
 * Compile a single `.shader` file to `.gsp`, mirroring the directory layout
 * from `inputDir` into `outputDir`. Returns `true` on success.
 */
function compileSingle(
  shaderCompiler: ShaderCompilerInstance,
  shaderPath: string,
  inputDir: string,
  outputDir: string,
  platformTarget: number
): boolean {
  const source = fs.readFileSync(shaderPath, "utf-8");
  const relativePath = normalizePath(path.relative(inputDir, shaderPath));
  const gspRelative = relativePath.replace(/\.shader$/, ".gsp");
  const gspPath = path.join(outputDir, gspRelative);

  fs.mkdirSync(path.dirname(gspPath), { recursive: true });

  try {
    const precompiled = shaderCompiler._precompile(source, platformTarget);
    fs.writeFileSync(gspPath, JSON.stringify(precompiled));
    console.log(`  ${relativePath} -> ${gspRelative}`);
    return true;
  } catch (e) {
    console.error(`  FAILED: ${relativePath}`);
    console.error(e);
    return false;
  }
}

/**
 * Delete `.gsp` files in `outputDir` whose `.shader` source no longer exists in
 * `inputDir`. Empty parent directories are pruned afterward. Returns the count
 * of removed files.
 */
function cleanOrphanedGsp(shaderFiles: string[], inputDir: string, outputDir: string): number {
  const aliveSet = new Set(shaderFiles.map((f) => normalizePath(path.relative(inputDir, f)).replace(/\.shader$/, "")));
  const gspFiles = findFiles(outputDir, ".gsp");
  let removed = 0;

  for (const gspFile of gspFiles) {
    const rel = normalizePath(path.relative(outputDir, gspFile)).replace(/\.gsp$/, "");
    if (!aliveSet.has(rel)) {
      fs.unlinkSync(gspFile);
      console.log(`  Removed orphaned: ${rel}.gsp`);
      removed++;
      pruneEmptyDirs(path.dirname(gspFile), outputDir);
    }
  }
  return removed;
}

/**
 * Generate `<outputDir>/index.ts`: an alphabetized aggregator of every `.gsp`
 * file's default export, named via {@link gspPathToVarName}.
 */
function emitIndex(outputDir: string): void {
  const gspFiles = findFiles(outputDir, ".gsp");
  const entries = gspFiles
    .map((file) => {
      const rel = normalizePath(path.relative(outputDir, file));
      return { varName: gspPathToVarName(rel), importPath: `./${rel}` };
    })
    .sort((a, b) => a.varName.localeCompare(b.varName));

  const imports = entries.map((e) => `import ${e.varName} from "${e.importPath}";`).join("\n");
  const exportBlock = `export {\n${entries.map((e) => `  ${e.varName}`).join(",\n")}\n};`;
  // `// prettier-ignore` on the export block — the consumer's prettier config
  // (printWidth, trailingComma, …) is unknown, so the multi-line block would
  // otherwise drift on every precompile vs. format-on-save. Imports above are
  // sorted deterministically and stay format-stable.
  const content = `// Auto-generated by shader-precompile --emit-index — do not edit\n${imports}\n\n// prettier-ignore\n${exportBlock}\n`;

  const indexPath = path.join(outputDir, "index.ts");
  const existing = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf-8") : "";
  if (content !== existing) {
    fs.writeFileSync(indexPath, content);
    console.log("  Updated index.ts");
  }
}

/**
 * Remove the `.gsp` mirror for a deleted `.shader` source, then prune empty
 * directories beneath `outputDir`.
 */
function removeGspFor(shaderPath: string, inputDir: string, outputDir: string): void {
  const rel = normalizePath(path.relative(inputDir, shaderPath)).replace(/\.shader$/, ".gsp");
  const gspPath = path.join(outputDir, rel);
  if (fs.existsSync(gspPath)) {
    fs.unlinkSync(gspPath);
    console.log(`  Removed: ${rel}`);
    pruneEmptyDirs(path.dirname(gspPath), outputDir);
  }
}
