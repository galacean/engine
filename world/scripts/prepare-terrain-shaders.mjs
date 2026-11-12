/** Rebuild shipped Seed shaders from the terrain sources and opted-in Engine include library. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const { ShaderPrecompiler } = require(path.join(root, "packages/shader-compiler/dist/precompile.main.js"));
const includeMap = {};
function collect(directory, prefix = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name),
      key = prefix + entry.name;
    if (entry.isDirectory()) collect(file, key + "/");
    else if (entry.name.endsWith(".glsl")) includeMap[key] = fs.readFileSync(file, "utf8");
  }
}
collect(path.join(root, "packages/shader/src/ShaderLibrary"), "ShaderLibrary/");
for (const { original, replacement } of JSON.parse(
  fs.readFileSync(path.join(root, "packages/modify/native-overrides.json"), "utf8")
)) {
  if (original.startsWith("packages/shader/src/ShaderLibrary/") && original.endsWith(".glsl"))
    includeMap[original.slice("packages/shader/src/".length)] = fs.readFileSync(path.join(root, replacement), "utf8");
}
const source = path.join(root, "packages/terrain/src/shaders");
collect(source);
const compiler = new ShaderPrecompiler();
compiler.setIncludeMap(includeMap);
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ["Terrain"]) {
  const result = compiler.precompile(fs.readFileSync(path.join(source, name + ".shader"), "utf8"), 0);
  fs.writeFileSync(
    path.join(root, "packages/terrain/src/data/seed-world/public/Shader", name + ".shaderc"),
    JSON.stringify(result)
  );
  console.log(`Compiled ${name}`);
}
