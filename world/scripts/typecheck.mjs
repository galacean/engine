import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const overrides = new Map(JSON.parse(fs.readFileSync(path.join(root, "packages/modify/native-overrides.json"), "utf8"))
  .map(entry => [path.join(root, entry.original), path.join(root, entry.replacement)]));
const config = ts.readConfigFile(path.join(root, "world/tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.join(root, "world"));
parsed.options.baseUrl = root;
parsed.options.strictNullChecks = true;
parsed.options.types = [];
parsed.options.typeRoots = [path.join(root, "world/node_modules/@types"), path.join(root, "node_modules/@types")];
parsed.options.paths = {
  "@galacean/engine": ["packages/galacean/src/index.ts"],
  "dat.gui": ["world/node_modules/@types/dat.gui/index.d.ts"],
  "@galacean/engine-shader": ["packages/modify/.cache/shaders.ts"]
};
for (const directory of fs.readdirSync(path.join(root, "packages"))) {
  const manifest = path.join(root, "packages", directory, "package.json");
  if (!fs.existsSync(manifest) || directory === "galacean" || directory === "shader") continue;
  const { name } = JSON.parse(fs.readFileSync(manifest, "utf8"));
  parsed.options.paths[name] = [`packages/${directory}/src/index.ts`];
  parsed.options.paths[`${name}/types/*`] = [`packages/${directory}/src/*`];
  parsed.options.paths[`${name}/*`] = [`packages/${directory}/src/*`];
}
const nativeNames = new Set(["core", "loader", "rhi-webgl", "galacean", "math", "shader", "shader-compiler", "ui", "physics-physx", "design"]);
const isNative = diagnostic => diagnostic.file && nativeNames.has(path.relative(root, diagnostic.file.fileName).split(path.sep)[1]);
function compilerHost(options, modified) {
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host), exists = host.fileExists.bind(host);
  const directories = new Set();
  if (modified) for (const file of overrides.keys()) {
    for (let directory = path.dirname(file); directory.startsWith(root); directory = path.dirname(directory)) directories.add(directory);
  }
  const directoryExists = host.directoryExists.bind(host);
  host.directoryExists = directory => directories.has(directory) || directoryExists(directory);
  host.readFile = file => read(modified && overrides.get(file) || file);
  host.fileExists = file => modified && overrides.has(file) || exists(file);
  host.getSourceFile = (file, languageVersion) => {
    const source = host.readFile(file);
    return source === undefined ? undefined : ts.createSourceFile(file, source, languageVersion, true);
  };
  host.resolveModuleNames = (names, containingFile) => names.map(name =>
    ts.resolveModuleName(name, containingFile, options, host).resolvedModule);
  host.resolveTypeReferenceDirectives = (names, containingFile) => names.map(item => {
    const name = typeof item === "string" ? item : item.fileName;
    if (name === "vite/client") return { resolvedFileName: path.join(root, "world/node_modules/vite/client.d.ts"), primary: true };
    return ts.resolveTypeReferenceDirective(name, containingFile, options, host).resolvedTypeReferenceDirective;
  });
  return host;
}
const declarations = ["world/assets.d.ts", "world/node_modules/vite/client.d.ts", "node_modules/@types/node/ts5.6/index.d.ts", "node_modules/@types/webxr/index.d.ts"].map(file => path.join(root, file));
// Demo code has its own stricter configuration. Check Engine internals separately
// using the upstream package's strictness, rather than changing its public sources.
const program = ts.createProgram([...parsed.fileNames, ...declarations], parsed.options, compilerHost(parsed.options, true));
const diagnostics = ts.getPreEmitDiagnostics(program).filter(diagnostic => !isNative(diagnostic));
const nativeOptions = { ...parsed.options, noImplicitAny: false, noImplicitOverride: true, strict: false, target: ts.ScriptTarget.ESNext };
const nativeRoots = ["core", "loader", "rhi-webgl", "galacean"].map(name => path.join(root, "packages", name, "src/index.ts"));
const nativeDiagnostics = modified => ts.getPreEmitDiagnostics(ts.createProgram([...nativeRoots, ...declarations], nativeOptions, compilerHost(nativeOptions, modified)));
const key = diagnostic => `${diagnostic.file?.fileName}:${diagnostic.code}:${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
const baseline = new Set(nativeDiagnostics(false).map(key));
const modifiedDiagnostics = nativeDiagnostics(true);
diagnostics.push(...modifiedDiagnostics.filter(diagnostic => !baseline.has(key(diagnostic))));
console.log(`Engine type baseline: ${baseline.size} existing diagnostics; checking modifications for new diagnostics.`);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n"
  }));
  process.exitCode = 1;
} else console.log("World source types match the opted-in Engine implementation.");
