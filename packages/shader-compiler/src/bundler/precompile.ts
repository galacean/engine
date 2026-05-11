import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/** Normalize to forward slashes (Windows uses `\`; downstream regex/keys assume `/`). */
export function normalizePath(p: string): string {
  return p.split(path.sep).join("/");
}

/** Recursively find all files with a given extension. */
function findFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(normalizePath(fullPath));
    }
  }
  return results;
}

/** `PBR.shaderc` → `PBRSource`,  `2D/Sprite.shaderc` → `SpriteSource`. */
function shadercPathToVarName(relPath: string): string {
  const normalized = normalizePath(relPath).replace(/\.shaderc$/, "");
  const base = normalized.split("/").pop() ?? normalized;
  const cleaned = base.replace(/[^A-Za-z0-9]/g, "");
  if (cleaned.length === 0) return "Source";
  return `${cleaned[0].toUpperCase()}${cleaned.slice(1)}Source`;
}

/** `Common/Common.glsl` → `Common_Common` — TS identifier for source-index imports. */
function pathToIdentifier(rel: string, ext: string): string {
  let id = rel.replace(new RegExp(`\\${ext}$`), "").replace(/[^A-Za-z0-9_]/g, "_");
  if (/^[0-9]/.test(id)) id = "_" + id;
  return id;
}

/** Remove empty parent directories upward from `startDir` until `stopDir` is hit. */
function pruneEmptyDirs(startDir: string, stopDir: string): void {
  let dir = startDir;
  while (dir !== stopDir && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

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
  /** Generate raw-source indexes: `<input>/index.ts` (.shader) + sibling `ShaderLibrary/index.ts` (.glsl). */
  emitSources?: boolean;
  /** Optional shader platform target passed through to `_precompile`. Defaults to `0`. */
  platformTarget?: number;
}

interface ShaderCompilerInstance {
  _precompile: (source: string, target: number, basePathForIncludeKey: string) => unknown;
  _setIncludeMap: (includeMap: Record<string, string>) => void;
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

  // Emit source indexes before compile so collectIncludeMap can resolve the freshly-built sources.
  if (options.emitSources) {
    emitSources(inputDir);
  }

  const shaderCompiler = await loadShaderCompiler();
  shaderCompiler._setIncludeMap(await collectIncludeMap(inputDir));

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
  shaderCompiler._setIncludeMap(await collectIncludeMap(inputDir));

  // .glsl change → full recompile (can't cheaply track include graphs).
  // .shader change → single-file recompile.
  const handleInputChange = async (filename: string | null): Promise<void> => {
    if (!filename) return;
    const norm = normalizePath(filename);
    const fullPath = path.join(inputDir, filename);

    if (norm.endsWith(".glsl")) {
      console.log(`[shader-compiler-bundler] Include changed (${norm}), full recompile...`);
      shaderCompiler._setIncludeMap(await collectIncludeMap(inputDir));
      runFull(options as Omit<PrecompileOptions, "watch" | "only">).catch((e) => console.error(e));
      return;
    }

    if (!norm.endsWith(".shader")) return;
    if (!fs.existsSync(fullPath)) {
      removeBundleFor(fullPath, inputDir, outputDir);
    } else {
      compileSingle(shaderCompiler, fullPath, inputDir, outputDir, platformTarget);
    }
    if (options.emitSources) emitSources(inputDir);
    if (options.emitIndex) emitIndex(outputDir);
  };

  console.log(`[shader-compiler-bundler] Watching ${inputDir} ...`);
  fs.watch(inputDir, { recursive: true }, (_event, filename) => {
    handleInputChange(filename).catch((e) => console.error(e));
  });
}

async function loadShaderCompiler(): Promise<ShaderCompilerInstance> {
  // @ts-ignore — `../main.js` is the compiled runtime entry; no .ts source.
  const mod = (await import("../main.js")) as { ShaderCompiler: new () => ShaderCompilerInstance };
  const instance = new mod.ShaderCompiler();
  if (typeof instance._precompile !== "function") {
    throw new Error("ShaderCompiler._precompile is not available; rebuild @galacean/engine-shader-compiler first.");
  }
  return instance;
}

// Local .glsl come from inputDir; standard library comes from
// `@galacean/engine-shader/sources` with a sibling-dir fallback for engine self-build cold-start.
async function collectIncludeMap(inputDir: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  for (const file of findFiles(inputDir, ".glsl")) {
    const relPath = normalizePath(path.relative(inputDir, file));
    map[relPath] = fs.readFileSync(file, "utf-8");
  }

  let usedRelease = false;
  // Resolve from inputDir's node_modules so consumers without transitive linkage to shader-compiler can still find it.
  try {
    const requireFromInput = createRequire(path.join(inputDir, "package.json"));
    const sourcesPath = requireFromInput.resolve("@galacean/engine-shader/sources");
    const { shaderLibrary } = (await import(pathToFileURL(sourcesPath).href)) as {
      shaderLibrary: { source: string; path: string }[];
    };
    for (const { source, path: chunkPath } of shaderLibrary) {
      map[chunkPath] = source;
    }
    usedRelease = true;
  } catch {
    // engine self-build cold-start: dist/sources.* not yet built; use sibling source.
  }

  if (!usedRelease) {
    const siblingLibrary = path.join(path.dirname(inputDir), "ShaderLibrary");
    if (fs.existsSync(siblingLibrary)) {
      for (const file of findFiles(siblingLibrary, ".glsl")) {
        const rel = normalizePath(path.relative(siblingLibrary, file));
        map[`ShaderLibrary/${rel}`] = fs.readFileSync(file, "utf-8");
      }
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
  const content = `// Auto-generated by shader-compiler-precompile --emit-index — do not edit.\n${imports}\n\n// prettier-ignore\n${exportBlock}\n`;

  const indexPath = path.join(outputDir, "index.ts");
  const existing = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf-8") : "";
  if (content !== existing) {
    fs.writeFileSync(indexPath, content);
    console.log("  Updated index.ts");
  }
}

// Generate raw-source indexes:
//   <inputDir>/index.ts           — `.shader` array (defines IShaderSource interface)
//   <sibling>/ShaderLibrary/index.ts — `.glsl` array (only if the directory exists)
function emitSources(inputDir: string): void {
  emitShaderSourceIndex(inputDir);
  const libraryDir = path.join(path.dirname(inputDir), "ShaderLibrary");
  if (fs.existsSync(libraryDir)) {
    emitLibrarySourceIndex(libraryDir);
  }
}

function emitShaderSourceIndex(rootDir: string): void {
  const srcDir = path.dirname(rootDir);
  const files = findFiles(rootDir, ".shader").sort();
  const importPaths = files.map((f) => normalizePath(path.relative(rootDir, f)));
  const paths = files.map((f) => normalizePath(path.relative(srcDir, f)));
  const ids = importPaths.map((p) => pathToIdentifier(p, ".shader"));

  const lines: string[] = [];
  lines.push("// Auto-generated by shader-compiler-precompile --emit-sources — do not edit.");
  lines.push("");
  importPaths.forEach((rel, i) => lines.push(`import ${ids[i]} from "./${rel}";`));
  lines.push("");
  lines.push("export interface IShaderSource {");
  lines.push("  path: string;");
  lines.push("  source: string;");
  lines.push("}");
  lines.push("");
  lines.push("// prettier-ignore");
  lines.push("export const shaders: IShaderSource[] = [");
  paths.forEach((p, i) => lines.push(`  { source: ${ids[i]}, path: ${JSON.stringify(p)} },`));
  lines.push("];");
  lines.push("");

  const out = path.join(rootDir, "index.ts");
  fs.writeFileSync(out, lines.join("\n"), "utf-8");
  console.log(`  Emitted shaders index ${path.relative(process.cwd(), out)} (${files.length})`);
}

function emitLibrarySourceIndex(rootDir: string): void {
  const srcDir = path.dirname(rootDir);
  const files = findFiles(rootDir, ".glsl").sort();
  const importPaths = files.map((f) => normalizePath(path.relative(rootDir, f)));
  const paths = files.map((f) => normalizePath(path.relative(srcDir, f)));
  const ids = importPaths.map((p) => pathToIdentifier(p, ".glsl"));

  const lines: string[] = [];
  lines.push("// Auto-generated by shader-compiler-precompile --emit-sources — do not edit.");
  lines.push("");
  lines.push(`import type { IShaderSource } from "../Shaders";`);
  importPaths.forEach((rel, i) => lines.push(`import ${ids[i]} from "./${rel}";`));
  lines.push("");
  lines.push("// prettier-ignore");
  lines.push("export const shaderLibrary: IShaderSource[] = [");
  paths.forEach((p, i) => lines.push(`  { source: ${ids[i]}, path: ${JSON.stringify(p)} },`));
  lines.push("];");
  lines.push("");

  const out = path.join(rootDir, "index.ts");
  fs.writeFileSync(out, lines.join("\n"), "utf-8");
  console.log(`  Emitted library index ${path.relative(process.cwd(), out)} (${files.length})`);
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
