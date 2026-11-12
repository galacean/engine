import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const own = path.join(root, "packages/modify");
const cache = path.join(own, ".cache");
const source = path.join(cache, "shader-src");
fs.rmSync(source, { recursive: true, force: true });
fs.mkdirSync(source, { recursive: true });
// Only shader inputs are staged; no Engine checkout or Gallery is materialized.
fs.cpSync(path.join(root, "packages/shader/src"), source, { recursive: true });
for (const { original, replacement } of JSON.parse(fs.readFileSync(path.join(own, "native-overrides.json"), "utf8"))) {
  if (!original.startsWith("packages/shader/src/")) continue;
  const destination = path.join(source, original.slice("packages/shader/src/".length));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, replacement), destination);
}
// The native CLI prefers the installed @galacean/engine-shader/sources library.
// Compile explicitly against our staged replacements so native dist cannot mask them.
// The bootstrap runtime also supports a cold workspace before parser dist exists.
const { ShaderPrecompiler } = createRequire(import.meta.url)(
  path.join(root, "packages/shader-compiler/.bootstrap/main.js")
);
const compiler = new ShaderPrecompiler();
const includes = Object.create(null);
function files(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file, extension) : entry.name.endsWith(extension) ? [file] : [];
  });
}
for (const file of files(source, ".glsl")) {
  includes[path.relative(source, file).split(path.sep).join("/")] = fs.readFileSync(file, "utf8");
}
compiler.setIncludeMap(includes);
const compiled = path.join(cache, "compiled");
fs.rmSync(compiled, { recursive: true, force: true });
fs.mkdirSync(compiled, { recursive: true });
const entries = [];
const identifiers = new Set();
for (const file of files(path.join(source, "Shaders"), ".shader")) {
  const relative = path.relative(path.join(source, "Shaders"), file).split(path.sep).join("/");
  const output = relative.replace(/\.shader$/, ".shaderc");
  const base = path.basename(relative, ".shader").replace(/[^A-Za-z0-9]/g, "");
  const name = `${base[0].toUpperCase()}${base.slice(1)}Source`;
  if (identifiers.has(name)) throw new Error(`Duplicate compiled shader export: ${name}`);
  identifiers.add(name);
  const data = compiler.precompile(fs.readFileSync(file, "utf8"), 0, relative);
  fs.mkdirSync(path.dirname(path.join(compiled, output)), { recursive: true });
  fs.writeFileSync(path.join(compiled, output), JSON.stringify(data));
  entries.push({ name, output });
}
entries.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(
  path.join(compiled, "index.ts"),
  'import type { IPrecompiledShader } from "@galacean/engine-design";\n' +
    entries.map(({ name, output }) => `import ${name}Data from "./${output}";`).join("\n") +
    "\n" +
    entries.map(({ name }) => `export const ${name}: IPrecompiledShader = ${name}Data;`).join("\n") +
    "\n"
);
console.log(`Compiled ${entries.length} World shaders against ${Object.keys(includes).length} staged includes.`);
fs.writeFileSync(
  path.join(cache, "shaders.ts"),
  'export { shaderLibrary } from "../../shader/src/ShaderLibrary";\nexport * from "./compiled/index";\n'
);

// Raw editor/compiler sources must describe the same opted-in shader set.
const rawShaders = [];
function collectShaders(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collectShaders(file);
    else if (entry.name.endsWith(".shader"))
      rawShaders.push({
        path: path.relative(source, file).split(path.sep).join("/"),
        source: fs.readFileSync(file, "utf8")
      });
  }
}
collectShaders(path.join(source, "Shaders"));
fs.writeFileSync(
  path.join(cache, "sources.ts"),
  'export { shaderLibrary } from "../../shader/src/ShaderLibrary";\nexport type { IShaderSource } from "../../shader/src/Shaders";\nexport const shaders = ' +
    JSON.stringify(rawShaders) +
    ";\n"
);
