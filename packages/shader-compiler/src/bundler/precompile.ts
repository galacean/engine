import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * Converts a filesystem path to the slash-separated form used by shader asset keys.
 * @param p - Filesystem path.
 * @returns Slash-separated path.
 */
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

/** Controls CLI and programmatic `.shaderc` generation for one source tree. */
export interface PrecompileOptions {
  /** Absolute or relative path to the directory containing `.shader` sources. */
  input: string;
  /** Absolute or relative path to the directory where `.shaderc` outputs are written. */
  output: string;
  /** Remove `.shaderc` files whose `.shader` source no longer exists, and prune empty dirs. */
  clean?: boolean;
  /** Watch the input dir and re-run incrementally on `.shader` / `.glsl` changes. */
  watch?: boolean;
  /** Compile only this `.shader` file inside `input` (path may be relative to cwd). Skips full scan + cleanup. */
  only?: string;
  /** Generate `<output>/index.ts` aggregating every `.shaderc` file. */
  emitIndex?: boolean;
  /** Generate raw-source indexes: `<input>/index.ts` (.shader) + sibling `ShaderLibrary/index.ts` (.glsl). */
  emitSources?: boolean;
  /** Optional shader platform target passed through to `precompile`. Defaults to `0`. */
  platformTarget?: number;
}

interface ShaderPrecompilerInstance {
  precompile: (source: string, target: number, sourceFile?: string) => unknown;
  setIncludeMap: (includeMap: Record<string, string>) => void;
}

/**
 * Precompiles shaders once or starts incremental watch mode.
 * @param options - Source, output, cleanup, watch, and artifact-generation options.
 * @returns After a one-shot compile finishes or a watch has been installed.
 * @throws Error when a one-shot compile has failures or the source tree is invalid.
 */
export async function precompile(options: PrecompileOptions): Promise<void> {
  const { failed } = await runFull(options);

  if (options.watch) {
    await startWatcher(options);
    return;
  }

  console.log("[shader-compiler-bundler] Done.");
  if (failed > 0) {
    throw new Error(`${failed} shader(s) failed to precompile.`);
  }
}

/**
 * Precompiles the current shader source tree once.
 * @param options - Source, output, cleanup, and artifact-generation options.
 * @returns An object containing the number of shader sources that failed to compile.
 * @throws Error when the input tree or an explicitly selected source is invalid.
 */
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
  shaderCompiler.setIncludeMap(await collectIncludeMap(inputDir));

  let failed = 0;
  if (options.only) {
    const target = path.resolve(options.only);
    if (!compileSingle(shaderCompiler, target, inputDir, outputDir, platformTarget)) failed++;
  } else {
    failed = compileAll(shaderCompiler, inputDir, outputDir, platformTarget, options.clean);
  }

  if (options.emitIndex) {
    emitIndex(outputDir);
  }

  return { failed };
}

/**
 * Watches one shader source tree and serializes incremental rebuilds.
 * @param options - Source, output, cleanup, and artifact-generation options.
 * @returns Once the filesystem watcher has been installed.
 * @throws Error when the initial include registry cannot be loaded.
 */
export async function startWatcher(options: Omit<PrecompileOptions, "watch" | "only">): Promise<void> {
  const inputDir = path.resolve(options.input);
  const outputDir = path.resolve(options.output);
  const platformTarget = options.platformTarget ?? 0;
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory does not exist: ${inputDir}`);
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const shaderCompiler = await loadShaderCompiler();
  shaderCompiler.setIncludeMap(await collectIncludeMap(inputDir));

  // .glsl change → full recompile (can't cheaply track include graphs).
  // .shader change → single-file recompile.
  const handleInputChange = async (filename: string | null): Promise<void> => {
    if (!filename) return;
    const norm = normalizePath(filename);
    const fullPath = path.join(inputDir, filename);

    if (norm.endsWith(".glsl")) {
      console.log(`[shader-compiler-bundler] Include changed (${norm}), full recompile...`);
      if (options.emitSources) emitSources(inputDir);
      shaderCompiler.setIncludeMap(await collectIncludeMap(inputDir));
      const failed = compileAll(shaderCompiler, inputDir, outputDir, platformTarget, options.clean);
      if (options.emitIndex) emitIndex(outputDir);
      if (failed > 0) console.error(`[shader-compiler-bundler] ${failed} shader(s) failed to precompile.`);
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
  let changeQueue = Promise.resolve();
  fs.watch(inputDir, { recursive: true }, (_event, filename) => {
    changeQueue = changeQueue.then(() => handleInputChange(filename)).catch((e) => console.error(e));
  });
}

function compileAll(
  shaderCompiler: ShaderPrecompilerInstance,
  inputDir: string,
  outputDir: string,
  platformTarget: number,
  clean: boolean | undefined
): number {
  const shaderFiles = findFiles(inputDir, ".shader");
  console.log(`[shader-compiler-bundler] Precompiling ${shaderFiles.length} shader(s)...`);
  let failed = 0;
  for (const file of shaderFiles) {
    if (!compileSingle(shaderCompiler, file, inputDir, outputDir, platformTarget)) failed++;
  }
  if (clean) {
    const removed = cleanOrphanedBundles(shaderFiles, inputDir, outputDir);
    if (removed > 0) console.log(`[shader-compiler-bundler] Cleaned ${removed} orphaned .shaderc file(s).`);
  }
  if (failed > 0) console.warn(`[shader-compiler-bundler] ${failed} shader(s) failed to precompile.`);
  return failed;
}

async function loadShaderCompiler(): Promise<ShaderPrecompilerInstance> {
  const mod = (await (process.env.GALACEAN_SHADER_COMPILER_BOOTSTRAP === "true"
    ? importBootstrapPrecompiler()
    : importReleasePrecompiler())) as { ShaderPrecompiler: new () => ShaderPrecompilerInstance };
  const instance = new mod.ShaderPrecompiler();
  if (typeof instance.precompile !== "function") {
    throw new Error("ShaderPrecompiler is unavailable; rebuild @galacean/engine-shader-compiler first.");
  }
  return instance;
}

async function importBootstrapPrecompiler(): Promise<unknown> {
  // @ts-expect-error generated repo-local runtime has no declaration file
  return import("../.bootstrap/main.js");
}

async function importReleasePrecompiler(): Promise<unknown> {
  // @ts-expect-error generated Node-only runtime has no declaration file
  return import("../dist/offline.main.js");
}

// Local .glsl come from inputDir; standard library comes from
// `@galacean/engine-shader/sources` with a sibling-dir fallback for engine self-build cold-start.
async function collectIncludeMap(inputDir: string): Promise<Record<string, string>> {
  const map = Object.create(null) as Record<string, string>;

  for (const file of findFiles(inputDir, ".glsl")) {
    const relPath = normalizePath(path.relative(inputDir, file));
    addIncludeSource(map, relPath, fs.readFileSync(file, "utf-8"));
  }

  // Resolve from inputDir's node_modules so consumers without transitive linkage to shader-compiler can still find it.
  const requireFromInput = createRequire(path.join(inputDir, "package.json"));
  let sourcesPath: string | undefined;
  try {
    sourcesPath = requireFromInput.resolve("@galacean/engine-shader/sources");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
  }
  if (sourcesPath) {
    const { shaderLibrary } = requireFromInput(sourcesPath) as {
      shaderLibrary: { source: string; path: string }[];
    };
    for (const { source, path: chunkPath } of shaderLibrary) {
      addIncludeSource(map, chunkPath, source);
    }
  } else {
    // Engine self-build cold-start has no generated sources entry yet.
    const siblingLibrary = path.join(path.dirname(inputDir), "ShaderLibrary");
    if (fs.existsSync(siblingLibrary)) {
      for (const file of findFiles(siblingLibrary, ".glsl")) {
        const rel = normalizePath(path.relative(siblingLibrary, file));
        addIncludeSource(map, `ShaderLibrary/${rel}`, fs.readFileSync(file, "utf-8"));
      }
    }
  }

  return map;
}

function addIncludeSource(map: Record<string, string>, key: string, source: string): void {
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    throw new Error(`Shader include "${key}" is registered more than once.`);
  }
  map[key] = source;
}

function compileSingle(
  shaderCompiler: ShaderPrecompilerInstance,
  shaderPath: string,
  inputDir: string,
  outputDir: string,
  platformTarget: number
): boolean {
  const relativePath = shaderSourceRelativePath(shaderPath, inputDir);
  const source = fs.readFileSync(shaderPath, "utf-8");
  const bundleRelative = relativePath.replace(/\.shader$/, ".shaderc");
  const bundlePath = path.join(outputDir, bundleRelative);

  fs.mkdirSync(path.dirname(bundlePath), { recursive: true });

  try {
    const precompiled = shaderCompiler.precompile(source, platformTarget, relativePath);
    fs.writeFileSync(bundlePath, JSON.stringify(precompiled));
    console.log(`  ${relativePath} -> ${bundleRelative}`);
    return true;
  } catch (e) {
    console.error(`  FAILED: ${relativePath}`);
    console.error(e);
    return false;
  }
}

function shaderSourceRelativePath(shaderPath: string, inputDir: string): string {
  const relativePath = path.relative(inputDir, shaderPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    path.extname(relativePath) !== ".shader"
  ) {
    throw new Error(`Shader source must be a .shader file inside the input directory: ${shaderPath}`);
  }
  return normalizePath(relativePath);
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
  assertUniqueIdentifiers(entries.map(({ varName, importPath }) => ({ identifier: varName, path: importPath })));

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
  assertUniqueIdentifiers(ids.map((identifier, index) => ({ identifier, path: importPaths[index] })));

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
  assertUniqueIdentifiers(ids.map((identifier, index) => ({ identifier, path: importPaths[index] })));

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

function assertUniqueIdentifiers(entries: readonly { identifier: string; path: string }[]): void {
  const pathsByIdentifier = new Map<string, string>();
  for (const { identifier, path: sourcePath } of entries) {
    const existingPath = pathsByIdentifier.get(identifier);
    if (existingPath !== undefined) {
      throw new Error(`Shader asset paths "${existingPath}" and "${sourcePath}" both emit identifier "${identifier}".`);
    }
    pathsByIdentifier.set(identifier, sourcePath);
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
