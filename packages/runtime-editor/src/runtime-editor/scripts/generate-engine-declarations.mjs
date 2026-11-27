import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const destination = fileURLToPath(new URL("../generated/", import.meta.url));
const prefix = "declare/engine/node_modules/";
const native = ["galacean", "galacean-webgpu", "core", "loader", "math", "rhi-webgl", "rhi-webgpu", "design"];
const packages = new Map(native.map(directory => {
  const { name, version, types } = JSON.parse(readFileSync(path.join(root, "packages", directory, "package.json")));
  return [directory, { name, version, types: types.replace(/^\.\//, "") }];
}));
const paths = Object.fromEntries([...packages].map(([dir, pkg]) => [pkg.name, [path.join(root, "packages", dir, "src/index.ts")]]));
const options = {
  target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Node10,
  experimentalDecorators: true, declaration: true, emitDeclarationOnly: true, skipLibCheck: true,
  rootDir: path.join(root, "packages"), outDir: "/runtime-declarations", paths, noCheck: true, strictNullChecks: true
};
const host = ts.createCompilerHost(options);
const files = {};
const roots = Object.values(paths).flat();
const program = ts.createProgram(roots, options, host);
const result = program.emit(undefined, (file, text) => {
  const [dir, source, ...parts] = path.relative(options.outDir, file).split(path.sep);
  if (source === "src" && packages.has(dir)) files[prefix + packages.get(dir).name + "/types/" + parts.join("/")] = text;
});
if (result.emitSkipped || result.diagnostics.length) throw new Error(ts.formatDiagnostics(result.diagnostics, {
  getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => "\n"
}));
for (const pkg of packages.values()) {
  if (!files[prefix + pkg.name + "/" + pkg.types]) throw new Error("No declaration emitted for " + pkg.name);
  files[prefix + pkg.name + "/package.json"] = JSON.stringify(pkg, null, 2) + "\n";
}
// The RHI's public types use GPUDevice and related WebGPU DOM interfaces in
// the script worker's virtual filesystem. The worker cannot read node_modules.
const gpu = path.join(root, "packages/rhi-webgpu/node_modules/@webgpu/types");
const { name, version, types } = JSON.parse(readFileSync(path.join(gpu, "package.json")));
files[prefix + name + "/package.json"] = JSON.stringify({ name, version, types }, null, 2) + "\n";
files[prefix + name + "/" + types] = readFileSync(path.join(gpu, types), "utf8");
const entries = Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const contents = JSON.stringify(Object.fromEntries(entries));
const index = { packages: [...packages.values()], digest: createHash("sha256").update(contents).digest("hex"), paths: entries.map(([file]) => file) };
for (const [name, data] of [["engine-runtime-files.json", contents], ["engine-runtime-index.json", JSON.stringify(index)]]) {
  const output = path.join(destination, name);
  if (process.argv.includes("--check")) {
    if (readFileSync(output, "utf8") !== data + "\n") throw new Error(name + " is stale");
  } else writeFileSync(output, data + "\n");
}
console.log("Runtime Engine declarations: " + entries.length + " files");
