import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const own = path.join(root, "packages/modify");
const cache = path.join(own, ".cache");
const overrides = JSON.parse(fs.readFileSync(path.join(own, "native-overrides.json"), "utf8"));
const prefix = "packages/shader/src/";

function rawSources(directory, source, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return rawSources(file, source, extension);
    if (!entry.name.endsWith(extension)) return [];
    return [{ path: path.relative(source, file).split(path.sep).join("/"), source: fs.readFileSync(file, "utf8") }];
  });
}

for (const [target, output] of [
  ["gles300", cache],
  ["wgsl", path.join(cache, "webgpu")]
]) {
  // The published engine sources and both product catalogs have independent module identities.
  const source = path.join(output, "shader-src");
  fs.rmSync(source, { recursive: true, force: true });
  fs.cpSync(path.join(root, prefix), source, { recursive: true });
  for (const { original, replacement, webgpuReplacement } of overrides) {
    if (!original.startsWith(prefix)) continue;
    const destination = path.join(source, original.slice(prefix.length));
    const selected = target === "wgsl" && webgpuReplacement ? webgpuReplacement : replacement;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, selected), destination);
  }
  const shaders = path.join(source, "Shaders");
  execFileSync(
    process.execPath,
    [
      path.join(root, "packages/shader-compiler/bundler/cli.js"),
      shaders,
      path.join(output, "compiled"),
      "--target",
      target,
      "--clean",
      "--emit-index"
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, GALACEAN_SHADER_COMPILER_BOOTSTRAP: "true" } }
  );
  const includes = rawSources(path.join(source, "ShaderLibrary"), source, ".glsl");
  fs.writeFileSync(path.join(output, "library.ts"), "export const shaderLibrary = " + JSON.stringify(includes) + ";\n");
  const library = 'export { shaderLibrary } from "./library";\n';
  fs.writeFileSync(path.join(output, "shaders.ts"), library + 'export * from "./compiled/index";\n');
  fs.writeFileSync(
    path.join(output, "sources.ts"),
    library +
      'export type { IShaderSource } from "./shader-src/Shaders";\nexport const shaders = ' +
      JSON.stringify(rawSources(shaders, source, ".shader")) +
      ";\n"
  );
}
