import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { engineModify } from "../../packages/modify/build/vite.mjs";
import { buildingTranslator } from "./webgpu/building-translator.mjs";
import { vertexES3, fragmentES3, textureES3, nativeBuilding } from "./webgpu/shader-stages.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tools = process.argv[2] ?? process.env.SEED_WGSL_TOOLS;
if (!tools) throw Error("Supply the glslang 16.6.0 and TWGSL directory as an argument or SEED_WGSL_TOOLS.");
const load = createRequire(path.join(root, "packages/shader-compiler/package.json"));
const { createWebGPUShaderCompiler, compileWebGPUShaderPass } = load("./dist/webgpu.main.js");
const { ShaderPrecompiler } = load("./dist/precompile.main.js");
const compiler = await createWebGPUShaderCompiler(fs.readFileSync(load.resolve("web-naga/web_naga_bg.wasm")));
const { ShaderMacroProcessor } = load("@galacean/engine-core");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "world-webgpu-shaders-"));
const server = await createServer({
  root,
  cacheDir: path.join(scratch, "vite"),
  configFile: false,
  plugins: [engineModify()],
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, entries: [] }
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");

function shaderFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? shaderFiles(file) : entry.name.endsWith(".shaderc") ? [file] : [];
  });
}

try {
  const modu = (file) => server.ssrLoadModule("/packages/" + file);
  const { engineShaderSource } = await modu("building/src/building/runtime/EngineShaderSource.ts");
  const { constructionLightingBridgeSource, constructionLightingHelpers } = await modu(
    "building/src/building/runtime/ConstructionSceneLighting.ts"
  );
  const { shaderLibrary } = await modu("modify/.cache/webgpu/sources.ts");
  const { productFragmentInstructions } = await modu("core/src/shader/WorldShaderInstructions.ts");
  const { WGSLBackend } = await modu("shader-compiler/src/webgpu/WGSLBackend.ts");
  const buildingBackend = new WGSLBackend(await buildingTranslator(path.resolve(tools), scratch));
  const includes = Object.fromEntries(shaderLibrary.map(({ path, source }) => [path, source]));
  includes["Masonry/SceneLighting.glsl"] = fs.readFileSync(
    path.join(root, "packages/building/src/building/runtime/ConstructionSceneLighting.glsl"),
    "utf8"
  );
  const precompiler = new ShaderPrecompiler();
  precompiler.setIncludeMap(includes);
  const lighting = precompiler.precompile(constructionLightingBridgeSource, 0).subShaders[0].passes[0];
  const helpers = ShaderMacroProcessor.evaluate(
    constructionLightingHelpers(lighting.fragmentShaderInstructions),
    new Map(ShaderMacroProcessor._defaultWebGPUMacros)
  );
  const es2Backend = {
    compileWebGPUVariant(vertex, fragment, options) {
      return compiler.compileWebGPUVariant(textureES3(vertexES3(vertex)), textureES3(fragmentES3(fragment)), options);
    }
  };

  const records = new Map();
  const writes = new Map();
  const renamed = [];
  let passes = 0;
  const cached = new Map();
  for (const directory of [
    "terrain/src/data/seed-world/public/Shader",
    "water/src/water/native/assets/Water/Shaders",
    "building/src/building/assets/native/Shaders"
  ]) {
    for (const file of shaderFiles(path.join(root, "packages", directory))) {
      const bytes = fs.readFileSync(file);
      const sha = hash(bytes);
      const data = JSON.parse(bytes);
      if (!cached.has(sha)) {
        for (const group of data.subShaders)
          for (const pass of group.passes) {
            if (pass.isUsePass) continue;
            const source = {
              ...pass,
              fragmentShaderInstructions: productFragmentInstructions(data.name, pass.fragmentShaderInstructions)
            };
            try {
              if (data.name.startsWith("BuildingUnit/")) {
                if (
                  source.fragmentShaderInstructions.some(
                    ([op, text]) => op === 0 && text.includes("masonryResidentSceneLight")
                  )
                ) {
                  source.uniformBlocks = lighting.uniformBlocks;
                }
                for (const [key, vertex] of [
                  ["vertexShaderInstructions", true],
                  ["fragmentShaderInstructions", false]
                ]) {
                  const instructions = source[key];
                  assert.equal(instructions.length, 1);
                  assert.equal(instructions[0][0], 0);
                  source[key] = [[0, nativeBuilding(instructions[0][1], vertex, engineShaderSource, helpers)]];
                }
                pass.wgsl = compileWebGPUShaderPass(buildingBackend, source);
              } else {
                pass.wgsl = compileWebGPUShaderPass(data.platformTarget === 0 ? es2Backend : compiler, source);
              }
              for (const stage of ["vertex", "fragment"]) {
                let wgsl = pass.wgsl[stage].replaceAll("340282350000000000000000000000000000000f", "0x1.fffffep+127f");
                if (wgsl.includes("0x1.fffffep+128f")) {
                  assert.match(pass.vertexShaderInstructions[0][1], /uintBitsToFloat\s*\(\s*0x7fbfffffu\b/);
                  wgsl =
                    wgsl.replaceAll("0x1.fffffep+128f", "seedBitsToFloat(0x7fbfffffu)") +
                    "\nfn seedBitsToFloat(bits: u32) -> f32 { return bitcast<f32>(bits); }\n";
                }
                assert.ok(wgsl.includes("@" + stage) && wgsl.includes("fn " + pass.wgsl[stage + "EntryPoint"] + "("));
                pass.wgsl[stage] = wgsl;
              }
              passes++;
            } catch (error) {
              throw Error(`Cannot export ${path.relative(root, file)} (${data.name}, ${pass.name})`, { cause: error });
            }
          }
        cached.set(sha, Buffer.from(JSON.stringify(data)));
      }
      const result = cached.get(sha);
      const newSha = hash(result);
      const target = file.replace(sha + ".shaderc", newSha + ".shaderc");
      records.set(sha, { sha: newSha, size: result.length });
      writes.set(target, result);
      if (target !== file) renamed.push(file);
    }
  }
  const terrain = path.join(root, "packages/terrain/src/data/seed-world");
  const water = path.join(terrain, "public/Shader/Water");
  const manifests = fs.readdirSync(water).filter((name) => /^WaterAotManifest\..+\.json$/.test(name));
  assert.equal(manifests.length, 1);
  const manifestFile = path.join(water, manifests[0]);
  const manifestBytes = fs.readFileSync(manifestFile);
  const oldManifestHash = hash(manifestBytes);
  assert.ok(manifestFile.endsWith(oldManifestHash + ".json"));
  const manifest = JSON.parse(manifestBytes);
  for (const profile of manifest.profiles) {
    const old = profile.artifactSha256;
    const current = records.get(old);
    assert.ok(current, "Missing water profile " + profile.path);
    profile.path = profile.path.replace(old, current.sha);
    profile.cacheKey = profile.artifactSha256 = current.sha;
    profile.artifactBytes = current.size;
  }
  manifest.budgets.actualTotalArtifactBytes = manifest.profiles.reduce(
    (sum, profile) => sum + profile.artifactBytes,
    0
  );
  manifest.additionalCompiledTargets = ["wgsl"];
  const nextManifest = json(manifest);
  const newManifestHash = hash(nextManifest);
  writes.set(manifestFile.replace(oldManifestHash, newManifestHash), nextManifest);
  if (newManifestHash !== oldManifestHash) renamed.push(manifestFile);
  const project = path.join(terrain, "project.json");
  let projectData = fs.readFileSync(project, "utf8").replaceAll(oldManifestHash, newManifestHash);
  for (const [old, current] of records) projectData = projectData.replaceAll(old, current.sha);
  writes.set(project, projectData);
  const receipt = path.join(root, "packages/water/src/water/native/assets/conversion.json");
  const entries = JSON.parse(fs.readFileSync(receipt));
  for (const entry of entries) {
    const old = entry.sha256;
    const current = records.get(old);
    if (!current) continue;
    entry.source = entry.source.replaceAll(old, current.sha);
    entry.sha256 = current.sha;
    entry.byteLength = current.size;
  }
  writes.set(receipt, json(entries));
  for (const [file, content] of writes) {
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(Buffer.from(content))) fs.writeFileSync(file, content);
  }
  for (const file of renamed) if (!writes.has(file)) fs.unlinkSync(file);
  console.log(`Exported ${passes} distinct WGSL passes across ${writes.size - 3} product shader assets.`);
} finally {
  await server.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
