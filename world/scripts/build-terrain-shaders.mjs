import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ShaderCompiler } from "../../packages/shader-compiler/dist/main.js";

// Run world prepare:engine first so these assets use the same modified library as World.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const terrain = path.join(root, "packages/terrain/src");
const shaderRoot = path.join(terrain, "shaders");
const includes = {};
function collect(directory, prefix = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const key = prefix + entry.name;
    if (entry.isDirectory()) collect(file, key + "/");
    else if (entry.name.endsWith(".glsl")) includes[key] = fs.readFileSync(file, "utf8");
  }
}
collect(shaderRoot);
collect(path.join(root, "packages/modify/.cache/shader-src/ShaderLibrary"), "ShaderLibrary/");
const compiler = new ShaderCompiler();
compiler._setIncludeMap(includes);
for (const name of ["Terrain", "Grass", "Vegetation", "debug/Core/Terrain", "debug/Core/Vegetation"]) {
  const source = fs.readFileSync(path.join(shaderRoot, `${name}.shader`), "utf8");
  const output = JSON.stringify(compiler._precompile(source, 0, `shaders://root/${name}.shader`));
  for (const directory of ["data/seed-world/public", "data/grasslands/public", "data/grasslands/source/public"]) {
    const destination = path.join(terrain, directory, "Shader", `${name}.shaderc`);
    if (fs.existsSync(destination)) fs.writeFileSync(destination, output);
  }
  console.log(`Updated all existing ${name}.shaderc assets`);
}
