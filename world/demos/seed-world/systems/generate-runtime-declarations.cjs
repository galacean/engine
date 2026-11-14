// Regenerates world/demos/seed-world/systems/runtime-declarations.json from the runtime entry.
const path = require("path"), fs = require("fs");
const repo = path.resolve(__dirname, "../../../..");
const ts = require(path.join(repo, "node_modules/typescript"));
const configPath = path.join(repo, "world/tsconfig.json");
const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, path.dirname(configPath));
const options = { ...parsed.options, declaration: true, emitDeclarationOnly: true, noEmit: false, noEmitOnError: false, skipLibCheck: true, declarationMap: false, composite: false, incremental: false, outDir: "/__out", rootDir: repo, sourceMap: false, stripInternal: false };
delete options.tsBuildInfoFile;
const entry = path.join(repo, "world/demos/seed-world/systems/runtime.ts");
const first = ts.createProgram([entry], options);
const host = ts.createCompilerHost(options);
// Engine packages stay external: the host environment declares them.
const included = (file) => {
  if (file.includes("/node_modules/") || !file.startsWith(repo + "/")) return false;
  const rel = file.slice(repo.length + 1);
  // The script host declares the engine itself.
  return rel.startsWith("world/") || (rel.startsWith("packages/") && !/^packages\/(core|math|loader|galacean|design|rhi-webgl)\//.test(rel));
};
// Workspace packages resolve through node_modules; only root files of a program are emitted.
const program = ts.createProgram(
  first.getSourceFiles().filter((f) => included(f.fileName) && !f.isDeclarationFile).map((f) => f.fileName),
  options
);
const files = new Map();
const bySource = new Map(program.getSourceFiles().map((f) => [f.fileName, f]));
const emitted = program.emit(undefined, (name, text) => {
  // /__out/<repo-relative path>.d.ts
  const rel = name.replace(/^\/__out\//, "").replace(/\.d\.ts$/, "");
  const candidates = [".ts", ".tsx", ".js"].map((e) => path.join(repo, rel + e));
  const source = candidates.find((f) => bySource.has(f));
  if (!source || !included(source)) return;
  files.set(source, text);
});
const keyOf = (file) => file.slice(repo.length + 1).replace(/\.tsx?$/, "").replace(/\.js$/, "") + ".d.ts";
const out = {};
const rewrite = (file, text) => {
  const replace = (spec) => {
    if (!spec.startsWith(".") && !spec.startsWith("@galacean/")) return spec;
    const hit = ts.resolveModuleName(spec, file, options, host).resolvedModule;
    if (!hit || !files.has(hit.resolvedFileName)) return spec.replace(/\.tsx?$/, "");
    let rel = path.relative(path.dirname(file), hit.resolvedFileName).replace(/\.(tsx?|js)$/, "");
    if (!rel.startsWith(".")) rel = "./" + rel;
    return rel;
  };
  return text
    .replace(/(from\s+|import\s+|import\()"([^"]+)"/g, (m, head, spec) => `${head}"${replace(spec)}"`);
};
for (const [file, text] of files) out[keyOf(file)] = rewrite(file, text);
const runtimeKey = "world/demos/seed-world/systems/runtime";
// Publish only what the runtime entry reaches.
const reached = new Set();
const pending = [runtimeKey + ".d.ts"];
while (pending.length) {
  const key = pending.pop();
  if (reached.has(key) || !out[key]) continue;
  reached.add(key);
  for (const m of out[key].matchAll(/(?:from\s+|import\s+|import\()"(\.[^"]+)"/g)) {
    const next = path.join(path.dirname(key), m[1]);
    pending.push(next + ".d.ts", path.join(next, "index.d.ts"));
  }
}
for (const key of Object.keys(out)) if (!reached.has(key)) delete out[key];
// Declarations list only .d.ts files: a JSON module a declaration imports becomes one.
for (const key of Object.keys(out))
  out[key] = out[key].replace(/"(\.[^"]+)\.json"/g, (_m, spec) => {
    const data = path.normalize(path.join(path.dirname(key), spec + ".json"));
    const value = JSON.parse(fs.readFileSync(path.join(repo, data), "utf8"));
    out[data.replace(/\.json$/, ".data.d.ts")] = `declare const value: ${JSON.stringify(value)};\nexport default value;\n`;
    return `"${spec}.data"`;
  });
out["index.d.ts"] = `export * from "./${runtimeKey}";\n`;
const target = path.join(repo, "world/demos/seed-world/systems/runtime-declarations.json");
fs.writeFileSync(target, JSON.stringify(out, null, 0));
console.log(Object.keys(out).length, "files");
