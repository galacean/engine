import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

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
execFileSync(
  process.execPath,
  [
    path.join(root, "packages/shader-compiler/bundler/cli.js"),
    path.join(source, "Shaders"),
    path.join(cache, "compiled"),
    "--clean",
    "--emit-index"
  ],
  { cwd: root, stdio: "inherit" }
);
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
