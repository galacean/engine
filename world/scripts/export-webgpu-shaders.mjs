import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { workspaceEngine } from "../../packages/project/build/vite.mjs";
import { buildingTranslator } from "./webgpu/building-translator.mjs";
import { vertexES3, fragmentES3, textureES3, nativeBuilding } from "./webgpu/shader-stages.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tools = process.argv[2] ?? process.env.SEED_WGSL_TOOLS;
const load = createRequire(path.join(root, "packages/shader-compiler/package.json"));
const { createWebGPUShaderCompiler, compileWebGPUShaderPass } = load("./dist/webgpu.main.js");
const { ShaderPrecompiler } = load("./dist/precompile.main.js");
const { ShaderMacroProcessor } = load("@galacean/engine-core");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");

function shaderFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? shaderFiles(file) : entry.name.endsWith(".shaderc") ? [file] : [];
  });
}

function exportShaders(compiler, server, scratch) {
  const modu = (file) => server.ssrLoadModule("/packages/" + file);
  return Promise.all([
    modu("building/src/building/runtime/EngineShaderSource.ts"),
    modu("building/src/building/runtime/ConstructionSceneLighting.ts"),
    modu("shader/src/ShaderLibrary/index.ts"),
    modu("core/src/shader/WorldShaderInstructions.ts"),
    modu("shader-compiler/src/webgpu/WGSLBackend.ts"),
    tools ? buildingTranslator(path.resolve(tools), scratch) : Promise.resolve(null)
  ]).then(
    ([
      { engineShaderSource },
      { constructionLightingBridgeSource, constructionLightingHelpers },
      { shaderLibrary },
      { productFragmentInstructions },
      { WGSLBackend },
      translator
    ]) => {
      const buildingBackend = translator ? new WGSLBackend(translator) : compiler;
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
          return compiler.compileWebGPUVariant(
            textureES3(vertexES3(vertex)),
            textureES3(fragmentES3(fragment)),
            options
          );
        }
      };

      const records = new Map();
      const writes = new Map();
      const renamed = [];
      let passes = 0;
      const cached = new Map();
      const files = [
        "terrain/src/data/seed-world/public/Shader",
        "water/src/water/native/assets/Water/Shaders",
        "building/src/building/assets/native/Shaders"
      ].flatMap((directory) => shaderFiles(path.join(root, "packages", directory)));

      function compilePass(pass, data) {
        const source = {
          ...pass,
          fragmentShaderInstructions: productFragmentInstructions(data.name, pass.fragmentShaderInstructions)
        };
        if (data.name.startsWith("BuildingUnit/")) {
          if (!translator && pass.wgsl?.vertex && pass.wgsl?.fragment) {
            passes++;
            return;
          }
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
      }

      function exportFile(file) {
        const bytes = fs.readFileSync(file);
        const sha = hash(bytes);
        const data = JSON.parse(bytes);
        const record = (result) => {
          const newSha = hash(result);
          const target = file.replace(sha + ".shaderc", newSha + ".shaderc");
          records.set(sha, { sha: newSha, size: result.length });
          writes.set(target, result);
          if (target !== file) renamed.push(file);
        };
        if (cached.has(sha)) return record(cached.get(sha));

        const shaders = data.subShaders.flatMap((group) => group.passes).filter((pass) => !pass.isUsePass);
        const compile = (pass) =>
          Promise.resolve()
            .then(() => compilePass(pass, data))
            .catch((error) => {
              throw Error(`Cannot export ${path.relative(root, file)} (${data.name}, ${pass.name})`, { cause: error });
            });
        return shaders
          .reduce((pending, pass) => pending.then(() => compile(pass)), Promise.resolve())
          .then(() => {
            const result = Buffer.from(JSON.stringify(data));
            cached.set(sha, result);
            record(result);
          });
      }
      return files
        .reduce((pending, file) => pending.then(() => exportFile(file)), Promise.resolve())
        .then(() => {
          writeProductAssets(records, writes, renamed);
          console.log(`Exported ${passes} distinct WGSL passes across ${writes.size - 3} product shader assets.`);
        });
    }
  );
}

function writeProductAssets(records, writes, renamed) {
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
}

createWebGPUShaderCompiler()
  .then((compiler) => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "world-webgpu-shaders-"));
    return Promise.resolve()
      .then(() =>
        createServer({
          root,
          cacheDir: path.join(scratch, "vite"),
          configFile: false,
          plugins: [workspaceEngine()],
          server: { middlewareMode: true, hmr: false },
          optimizeDeps: { noDiscovery: true, entries: [] }
        })
      )
      .then((server) =>
        Promise.resolve()
          .then(() => exportShaders(compiler, server, scratch))
          .finally(() => server.close())
      )
      .finally(() => fs.rmSync(scratch, { recursive: true, force: true }));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
