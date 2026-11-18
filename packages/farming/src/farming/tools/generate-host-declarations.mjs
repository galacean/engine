import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const native = path.join(root, "packages/farming/src/farming/native");
const names = ["FarmingResources", "FarmingSystem", "FarmingAreaComponent", "FarmingSceneData", "FarmingMethodDocs", "FarmingSkill", "index"];
const config = ts.readConfigFile(path.join(root, "world/tsconfig.json"), ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, path.join(root, "world")).options;
Object.assign(options, {
  declaration: true,
  emitDeclarationOnly: true,
  noEmit: false,
  allowImportingTsExtensions: true,
  rootDir: root,
  outDir: "/farming-host-declarations",
  baseUrl: root,
  paths: {}
});
for (const directory of fs.readdirSync(path.join(root, "packages"))) {
  const manifest = path.join(root, "packages", directory, "package.json");
  if (!fs.existsSync(manifest)) continue;
  const { name } = JSON.parse(fs.readFileSync(manifest, "utf8"));
  options.paths[name] = [`packages/${directory}/src/index.ts`];
  options.paths[`${name}/*`] = [`packages/${directory}/src/*`];
}
const program = ts.createProgram(
  [...names.map((name) => path.join(native, `${name}.ts`)), path.join(root, "world/node_modules/vite/client.d.ts")],
  options
);
const destinations = ["world/demos/seed-world/systems/runtime-declarations.json"].map((file) => path.join(root, file));
const originals = destinations.map((file) => fs.readFileSync(file, "utf8"));
const declarations = originals.map((text) => JSON.parse(text));
for (const name of names) {
  const source = program.getSourceFile(path.join(native, `${name}.ts`));
  const diagnostics = program.getDeclarationDiagnostics(source);
  if (diagnostics.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (p) => p,
        getNewLine: () => "\n"
      })
    );
  program.emit(source, (file, text) => {
    if (file.endsWith(`/native/${name}.d.ts`))
      for (const consumer of declarations) consumer[`packages/farming/src/farming/native/${name}.d.ts`] = text;
  });
}
destinations.forEach((destination, index) => {
  const original = originals[index];
  const indentation = original.startsWith("{\n") ? 2 : undefined;
  const newline = original.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(destination, JSON.stringify(declarations[index], null, indentation) + newline);
});
console.log(`Updated ${names.length} farming host declaration modules`);
