import fs from "node:fs";
import path from "node:path";
import { findFiles, gspPathToVarName, normalizePath, pruneEmptyDirs } from "./utils";

export interface PrecompileOptions {
  /** Absolute or relative path to the directory containing `.shader` sources. */
  input: string;
  /** Absolute or relative path to the directory where `.gsp` outputs are written. */
  output: string;
  /**
   * Optional directory of `.glsl` include fragments. When provided, watch mode
   * also monitors this directory and triggers a full recompile when any
   * `.glsl` here changes (since includes affect every dependent `.shader`).
   */
  library?: string;
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

interface ShaderLabInstance {
  _precompile: (source: string, target: number) => unknown;
}

/**
 * Top-level entry: load ShaderLab, dispatch by mode (single / full / watch),
 * and optionally emit the aggregated index file.
 */
export async function precompile(options: PrecompileOptions): Promise<void> {
  await runFull(options);

  if (options.watch) {
    const inputDir = path.resolve(options.input);
    const outputDir = path.resolve(options.output);
    const platformTarget = options.platformTarget ?? 0;
    const shaderLab = await loadShaderLab();
    await watchInput(inputDir, outputDir, platformTarget, shaderLab, options.emitIndex === true);
  } else {
    console.log("[shaderlab-bundler] Done.");
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

  const shaderLab = await loadShaderLab();

  if (options.only) {
    const target = path.resolve(options.only);
    compileSingle(shaderLab, target, inputDir, outputDir, platformTarget);
  } else {
    const shaderFiles = findFiles(inputDir, ".shader");
    console.log(`[shaderlab-bundler] Precompiling ${shaderFiles.length} shader(s)...`);
    let failed = 0;
    for (const file of shaderFiles) {
      if (!compileSingle(shaderLab, file, inputDir, outputDir, platformTarget)) failed++;
    }
    if (options.clean) {
      const removed = cleanOrphanedGsp(shaderFiles, inputDir, outputDir);
      if (removed > 0) console.log(`[shaderlab-bundler] Cleaned ${removed} orphaned .gsp file(s).`);
    }
    if (failed > 0) console.warn(`[shaderlab-bundler] ${failed} shader(s) failed to precompile.`);
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
  const libraryDir = options.library ? path.resolve(options.library) : undefined;
  const platformTarget = options.platformTarget ?? 0;
  const shaderLab = await loadShaderLab();

  const handleInputChange = (filename: string | null) => {
    if (!filename) return;
    const norm = normalizePath(filename);
    if (!norm.endsWith(".shader")) return;

    const fullPath = path.join(inputDir, filename);
    if (!fs.existsSync(fullPath)) {
      removeGspFor(fullPath, inputDir, outputDir);
    } else {
      compileSingle(shaderLab, fullPath, inputDir, outputDir, platformTarget);
    }
    if (options.emitIndex) emitIndex(outputDir);
  };

  // Any .glsl change in the include library invalidates every dependent .shader,
  // so we trigger a full recompile pass rather than try to track include graphs.
  const handleLibraryChange = (filename: string | null) => {
    if (!filename) return;
    const norm = normalizePath(filename);
    if (!norm.endsWith(".glsl")) return;
    console.log(`[shaderlab-bundler] Library changed (${norm}), full recompile...`);
    runFull({ ...options, only: undefined } as PrecompileOptions).catch((e) => console.error(e));
  };

  console.log(`[shaderlab-bundler] Watching ${inputDir} ...`);
  fs.watch(inputDir, { recursive: true }, (_event, filename) => handleInputChange(filename));
  if (libraryDir) {
    console.log(`[shaderlab-bundler] Watching ${libraryDir} ...`);
    fs.watch(libraryDir, { recursive: true }, (_event, filename) => handleLibraryChange(filename));
  }
}

/**
 * Provide minimal browser shims so engine-core can load in Node, then import
 * the ShaderLab runtime from the parent package's compiled main entry and
 * instantiate ShaderLab.
 *
 * The bundler CLI is published at `dist/bundler/cli.js`; the runtime compiler
 * lives at `dist/main.js`. Using a relative `../main.js` import (instead of the
 * package self-reference `@galacean/engine-shaderlab`) avoids any ambiguity
 * around package self-resolution and keeps the bundler entry decoupled from
 * Node's package-name resolution at runtime.
 */
async function loadShaderLab(): Promise<ShaderLabInstance> {
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  if (typeof g.window === "undefined") g.window = { devicePixelRatio: 1 };
  if (typeof g.document === "undefined") g.document = { createElement: () => ({}) };

  // @ts-ignore — `../main.js` is the compiled runtime entry produced by the
  // root rollup config; it has no TypeScript source counterpart. Resolved at
  // runtime relative to dist/bundler/cli.js (i.e. dist/main.js).
  const mod = (await import("../main.js")) as { ShaderLab: new () => ShaderLabInstance };
  const instance = new mod.ShaderLab();
  if (typeof instance._precompile !== "function") {
    throw new Error("ShaderLab._precompile is not available; rebuild @galacean/engine-shaderlab first.");
  }
  return instance;
}

/**
 * Compile a single `.shader` file to `.gsp`, mirroring the directory layout
 * from `inputDir` into `outputDir`. Returns `true` on success.
 */
function compileSingle(
  shaderLab: ShaderLabInstance,
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
    const precompiled = shaderLab._precompile(source, platformTarget);
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
  const exportList = entries.map((e) => `  ${e.varName}`).join(",\n");
  const content = `// Auto-generated by shaderlab-precompile --emit-index — do not edit\n${imports}\n\nexport {\n${exportList}\n};\n`;

  const indexPath = path.join(outputDir, "index.ts");
  const existing = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf-8") : "";
  if (content !== existing) {
    fs.writeFileSync(indexPath, content);
    console.log("  Updated index.ts");
  }
}

/**
 * Watch the input directory for `.shader` / `.glsl` changes using Node's
 * recursive `fs.watch`. On change: deletions remove the matching `.gsp` (and
 * regenerate the index if requested); other events recompile the single file.
 *
 * `fs.watch` recursive is supported on macOS and Windows since Node 14, and on
 * Linux since Node 20 — we accept that and avoid pulling in `chokidar`.
 */
async function watchInput(
  inputDir: string,
  outputDir: string,
  platformTarget: number,
  shaderLab: ShaderLabInstance,
  emitIndexOnChange: boolean
): Promise<void> {
  console.log(`[shaderlab-bundler] Watching ${inputDir} ...`);

  const handle = (filename: string | null) => {
    if (!filename) return;
    const norm = normalizePath(filename);
    if (!norm.match(/\.(shader|glsl)$/)) return;

    const fullPath = path.join(inputDir, filename);
    if (!fs.existsSync(fullPath)) {
      if (norm.endsWith(".shader")) removeGspFor(fullPath, inputDir, outputDir);
      if (emitIndexOnChange) emitIndex(outputDir);
      return;
    }
    if (norm.endsWith(".shader")) {
      compileSingle(shaderLab, fullPath, inputDir, outputDir, platformTarget);
      if (emitIndexOnChange) emitIndex(outputDir);
    }
  };

  try {
    fs.watch(inputDir, { recursive: true }, (_event, filename) => handle(filename));
  } catch (e) {
    throw new Error(
      `Failed to watch ${inputDir}: ${(e as Error).message}. Recursive fs.watch may be unsupported on this platform.`
    );
  }

  await new Promise<void>(() => {});
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
