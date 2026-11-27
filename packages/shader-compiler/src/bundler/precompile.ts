import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { IWebGPUShaderCompiler } from "@galacean/engine-design";

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
  for (
    let dir = startDir;
    dir !== stopDir && fs.existsSync(dir) && fs.readdirSync(dir).length === 0;
    dir = path.dirname(dir)
  ) {
    fs.rmdirSync(dir);
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
  /** Explicit GLSL library root for a staged shader tree. */
  includeLibrary?: string;
  /** Optional shader platform target passed through to `precompile`. Defaults to GLSL ES 3.00. */
  platformTarget?: number;
}

interface ShaderPrecompilerInstance {
  precompile: (source: string, target?: number, sourceFile?: string) => unknown;
  precompileAny?: (source: string, target?: number, sourceFile?: string) => unknown;
  setIncludeMap: (includeMap: Record<string, string>) => void;
}

/**
 * Precompiles shaders once or starts incremental watch mode.
 * @param options - Source, output, cleanup, watch, and artifact-generation options.
 * @returns After a one-shot compile finishes or a watch has been installed.
 * @throws Error when a one-shot compile has failures or the source tree is invalid.
 */
export function precompile(options: PrecompileOptions): Promise<void> {
  return runFull(options).then(({ failed }) => {
    if (options.watch) return startWatcher(options);
    console.log("[shader-compiler-bundler] Done.");
    if (failed > 0) throw new Error(`${failed} shader(s) failed to precompile.`);
  });
}

/**
 * Precompiles the current shader source tree once.
 * @param options - Source, output, cleanup, and artifact-generation options.
 * @returns An object containing the number of shader sources that failed to compile.
 * @throws Error when the input tree or an explicitly selected source is invalid.
 */
export function runFull(options: Omit<PrecompileOptions, "watch">): Promise<{ failed: number }> {
  const inputDir = path.resolve(options.input);
  const outputDir = path.resolve(options.output);
  const target = options.platformTarget;
  return prepareCompiler(inputDir, outputDir, target, options.emitSources, options.includeLibrary)
    .then((compiler) =>
      options.only
        ? compileSingle(compiler, path.resolve(options.only), inputDir, outputDir, target).then((ok) => (ok ? 0 : 1))
        : compileAll(compiler, inputDir, outputDir, target, options.clean)
    )
    .then((failed) => {
      if (options.emitIndex) emitIndex(outputDir);
      return { failed };
    });
}

/**
 * Watches one shader source tree and serializes incremental rebuilds.
 * @param options - Source, output, cleanup, and artifact-generation options.
 * @returns Once the filesystem watcher has been installed.
 * @throws Error when the initial include registry cannot be loaded.
 */
export function startWatcher(options: Omit<PrecompileOptions, "watch" | "only">): Promise<void> {
  const inputDir = path.resolve(options.input);
  const outputDir = path.resolve(options.output);
  const target = options.platformTarget;
  return prepareCompiler(inputDir, outputDir, target, false, options.includeLibrary).then((compiler) => {
    function handleInputChange(filename: string | null): Promise<void> | void {
      if (!filename) return;
      const norm = normalizePath(filename);
      const fullPath = path.join(inputDir, filename);
      if (norm.endsWith(".glsl")) {
        console.log(`[shader-compiler-bundler] Include changed (${norm}), full recompile...`);
        if (options.emitSources) emitSources(inputDir);
        return collectIncludeMap(inputDir, options.includeLibrary)
          .then((includes) => {
            compiler.setIncludeMap(includes);
            return compileAll(compiler, inputDir, outputDir, target, options.clean);
          })
          .then((failed) => {
            if (options.emitIndex) emitIndex(outputDir);
            if (failed > 0) console.error(`[shader-compiler-bundler] ${failed} shader(s) failed to precompile.`);
          });
      }

      if (!norm.endsWith(".shader")) return;
      const updateIndexes = () => {
        if (options.emitSources) emitSources(inputDir);
        if (options.emitIndex) emitIndex(outputDir);
      };
      if (fs.existsSync(fullPath))
        return compileSingle(compiler, fullPath, inputDir, outputDir, target).then(updateIndexes);
      removeBundleFor(fullPath, inputDir, outputDir);
      updateIndexes();
    }

    console.log(`[shader-compiler-bundler] Watching ${inputDir} ...`);
    let changeQueue = Promise.resolve();
    fs.watch(inputDir, { recursive: true }, (_event, filename) => {
      changeQueue = changeQueue.then(() => handleInputChange(filename)).catch((e) => console.error(e));
    });
  });
}

function prepareCompiler(
  inputDir: string,
  outputDir: string,
  target?: number,
  writeSources?: boolean,
  includeLibrary?: string
): Promise<ShaderPrecompilerInstance> {
  return Promise.resolve()
    .then(() => {
      if (!fs.existsSync(inputDir)) throw new Error(`Input directory does not exist: ${inputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
      // Refresh source indexes before resolving the include registry.
      if (writeSources) emitSources(inputDir);
      return loadShaderCompiler(target);
    })
    .then((compiler) =>
      collectIncludeMap(inputDir, includeLibrary).then((includes) => {
        compiler.setIncludeMap(includes);
        return compiler;
      })
    );
}

function compileAll(
  shaderCompiler: ShaderPrecompilerInstance,
  inputDir: string,
  outputDir: string,
  platformTarget: number | undefined,
  clean: boolean | undefined
): Promise<number> {
  const shaderFiles = findFiles(inputDir, ".shader");
  console.log(`[shader-compiler-bundler] Precompiling ${shaderFiles.length} shader(s)...`);
  let count = Promise.resolve(0);
  for (const file of shaderFiles) {
    count = count.then((failed) =>
      compileSingle(shaderCompiler, file, inputDir, outputDir, platformTarget).then((ok) => (ok ? failed : failed + 1))
    );
  }
  return count.then((failed) => {
    if (clean) {
      const removed = cleanOrphanedBundles(shaderFiles, inputDir, outputDir);
      if (removed > 0) console.log(`[shader-compiler-bundler] Cleaned ${removed} orphaned .shaderc file(s).`);
    }
    if (failed > 0) console.warn(`[shader-compiler-bundler] ${failed} shader(s) failed to precompile.`);
    return failed;
  });
}

function loadShaderCompiler(platformTarget?: number): Promise<ShaderPrecompilerInstance> {
  const bootstrap = process.env.GALACEAN_SHADER_COMPILER_BOOTSTRAP === "true";
  type CompilerModule = { ShaderPrecompiler: new (webgpu?: IWebGPUShaderCompiler) => ShaderPrecompilerInstance };
  const runtime = bootstrap ? "../.bootstrap/main.js" : "../dist/precompile.main.js";
  const module: Promise<CompilerModule> = import(runtime);
  return module.then(({ ShaderPrecompiler }) => {
    function create(webgpu?: IWebGPUShaderCompiler): ShaderPrecompilerInstance {
      const compiler = new ShaderPrecompiler(webgpu);
      if (typeof compiler.precompile !== "function")
        throw new Error("ShaderPrecompiler is unavailable; rebuild @galacean/engine-shader-compiler first.");
      return compiler;
    }
    if (platformTarget !== 1) return create();
    const localRequire = createRequire(import.meta.url);
    const { createWebGPUShaderCompiler }: typeof import("../webgpu") = localRequire(
      bootstrap ? "../.bootstrap/webgpu.js" : "../dist/webgpu.main.js"
    );
    return createWebGPUShaderCompiler().then(create);
  });
}

// Local .glsl come from inputDir; standard library comes from
// `@galacean/engine-shader/sources` with a sibling-dir fallback for engine self-build cold-start.
async function collectIncludeMap(inputDir: string, includeLibrary?: string): Promise<Record<string, string>> {
  const map = Object.create(null) as Record<string, string>;

  for (const file of findFiles(inputDir, ".glsl")) {
    const relPath = normalizePath(path.relative(inputDir, file));
    addIncludeSource(map, relPath, fs.readFileSync(file, "utf-8"));
  }

  if (includeLibrary) {
    const library = path.resolve(includeLibrary);
    if (!fs.statSync(library).isDirectory()) {
      throw new Error(`Shader include library is not a directory: ${library}`);
    }
    addLibrarySources(map, library);
    return map;
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
      addLibrarySources(map, siblingLibrary);
    }
  }

  return map;
}

function addLibrarySources(map: Record<string, string>, library: string): void {
  for (const file of findFiles(library, ".glsl")) {
    const rel = normalizePath(path.relative(library, file));
    addIncludeSource(map, `ShaderLibrary/${rel}`, fs.readFileSync(file, "utf-8"));
  }
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
  platformTarget: number | undefined
): Promise<boolean> {
  const relativePath = shaderSourceRelativePath(shaderPath, inputDir);
  const source = fs.readFileSync(shaderPath, "utf-8");
  const bundleRelative = relativePath.replace(/\.shader$/, ".shaderc");
  const bundlePath = path.join(outputDir, bundleRelative);

  fs.mkdirSync(path.dirname(bundlePath), { recursive: true });

  return Promise.resolve()
    .then(() => {
      const precompiled = shaderCompiler.precompileAny
        ? shaderCompiler.precompileAny(source, platformTarget, relativePath)
        : shaderCompiler.precompile(source, platformTarget, relativePath);
      if (precompiled === null) {
        if (fs.existsSync(bundlePath)) {
          fs.unlinkSync(bundlePath);
          pruneEmptyDirs(path.dirname(bundlePath), outputDir);
        }
        console.log(`  Skipped (compute, non-WGSL target): ${relativePath}`);
        return true;
      }
      fs.writeFileSync(bundlePath, JSON.stringify(precompiled));
      console.log(`  ${relativePath} -> ${bundleRelative}`);
      return true;
    })
    .catch((e) => {
      console.error(`  FAILED: ${relativePath}`);
      console.error(e);
      return false;
    });
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
      let isCompute = false;
      try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as { kind?: string };
        isCompute = parsed.kind === "compute";
      } catch {
        // Treat malformed/legacy payloads as graphics shaders; compilation catches invalid files earlier.
      }
      return { varName: shadercPathToVarName(rel), importPath: `./${rel}`, isCompute };
    })
    .sort((a, b) => a.varName.localeCompare(b.varName));
  assertUniqueIdentifiers(entries.map(({ varName, importPath }) => ({ identifier: varName, path: importPath })));

  const hasCompute = entries.some((e) => e.isCompute);
  const hasGraphics = entries.some((e) => !e.isCompute);
  const typeNames: string[] = [];
  if (hasGraphics || !hasCompute) typeNames.push("IPrecompiledShader");
  if (hasCompute) typeNames.push("IPrecompiledComputeShader");

  const imports = entries.map((e) => `import ${e.varName}Data from "${e.importPath}";`).join("\n");
  const exports = entries
    .map((e) =>
      e.isCompute
        ? `export const ${e.varName}: IPrecompiledComputeShader = ${e.varName}Data as unknown as IPrecompiledComputeShader;`
        : `export const ${e.varName}: IPrecompiledShader = ${e.varName}Data as unknown as IPrecompiledShader;`
    )
    .join("\n");
  const content = `// Auto-generated by shader-compiler-precompile --emit-index — do not edit.\nimport type { ${typeNames.join(", ")} } from "@galacean/engine-design";\n${imports}\n\n${exports}\n`;

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
