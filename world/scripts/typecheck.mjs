import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config = ts.readConfigFile(path.join(root, "world/tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.join(root, "world"));
parsed.options.baseUrl = root;
parsed.options.strictNullChecks = true;
parsed.options.types = [];
parsed.options.typeRoots = [path.join(root, "world/node_modules/@types"), path.join(root, "node_modules/@types")];
parsed.options.paths = {
  "@galacean/engine": ["packages/galacean/src/index.ts"],
  "dat.gui": ["world/node_modules/@types/dat.gui/index.d.ts"],
  "@galacean/engine-shader": ["packages/shader/src/index.ts"],
  "@galacean/engine-shader/sources": ["packages/shader/src/sources.ts"]
};
for (const directory of fs.readdirSync(path.join(root, "packages"))) {
  const manifest = path.join(root, "packages", directory, "package.json");
  if (!fs.existsSync(manifest) || directory === "galacean" || directory === "shader") continue;
  const { name } = JSON.parse(fs.readFileSync(manifest, "utf8"));
  parsed.options.paths[name] = [`packages/${directory}/src/index.ts`];
  parsed.options.paths[`${name}/types/*`] = [`packages/${directory}/src/*`];
  parsed.options.paths[`${name}/*`] = [`packages/${directory}/src/*`];
}
const nativeNames = new Set([
  "core",
  "loader",
  "rhi-webgl",
  "rhi-null",
  "galacean",
  "math",
  "shader",
  "shader-compiler",
  "ui",
  "physics-physx",
  "design"
]);
const isNative = (diagnostic) =>
  diagnostic.file && nativeNames.has(path.relative(root, diagnostic.file.fileName).split(path.sep)[1]);

function compilerHost(options) {
  const host = ts.createCompilerHost(options);
  host.resolveModuleNames = (names, containingFile) =>
    names.map((name) => ts.resolveModuleName(name, containingFile, options, host).resolvedModule);
  host.resolveTypeReferenceDirectives = (names, containingFile) =>
    names.map((item) => {
      const name = typeof item === "string" ? item : item.fileName;
      if (name === "vite/client") {
        return { resolvedFileName: path.join(root, "world/node_modules/vite/client.d.ts"), primary: true };
      }
      return ts.resolveTypeReferenceDirective(name, containingFile, options, host).resolvedTypeReferenceDirective;
    });
  return host;
}

const declarations = [
  "world/assets.d.ts",
  "world/node_modules/vite/client.d.ts",
  "node_modules/@types/node/ts5.6/index.d.ts",
  "node_modules/@types/webxr/index.d.ts"
].map((file) => path.join(root, file));

const program = ts.createProgram([...parsed.fileNames, ...declarations], parsed.options, compilerHost(parsed.options));
const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => !isNative(diagnostic));

if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n"
    })
  );
  process.exitCode = 1;
} else {
  console.log("World source types match the Engine implementation.");
}
