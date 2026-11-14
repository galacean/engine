import ts from "typescript";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const entry = resolve(root, "shared/runtime-editor/scripts/project-assets.ts");
const files = {};
const prefix = "declare/engine/node_modules/";
const program = ts.createProgram([entry], {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true,
  skipLibCheck: true, declaration: true, emitDeclarationOnly: true,
  rootDir: dirname(entry), outDir: "/runtime-host-declarations"
});
const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => d.category === ts.DiagnosticCategory.Error);
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => root, getCanonicalFileName: p => p, getNewLine: () => "\n"
}));
program.emit(undefined, (path, text) => {
  if (path === "/runtime-host-declarations/project-assets.d.ts") files[`${prefix}@galacean/editor-assets/index.d.ts`] = text;
});
if (!files[`${prefix}@galacean/editor-assets/index.d.ts`]) throw new Error("Project asset declarations were not emitted");
const require = createRequire(import.meta.url);
const zodRoot = dirname(require.resolve("zod/package.json"));
const visit = directory => {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) visit(path);
    else if (item.name.endsWith(".d.ts")) files[`${prefix}zod/${relative(zodRoot, path)}`] = readFileSync(path, "utf8");
  }
};
visit(zodRoot);
const content = JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n";
const relativeOutput = "shared/runtime-editor/generated/host-runtime-files.json";
const output = resolve(root, relativeOutput);
if (process.argv.includes("--check")) {
  if (!existsSync(output) || readFileSync(output, "utf8") !== content) throw new Error("Runtime host declarations are stale");
} else {
  writeFileSync(output, content);
  if (process.env.WORLD_GALLERY_SOURCE_ROOT) writeFileSync(resolve(process.env.WORLD_GALLERY_SOURCE_ROOT, relativeOutput), content);
}
console.log(`Runtime host declarations: ${Object.keys(files).length} files`);
