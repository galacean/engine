import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { workspaceEngine } from "../../packages/project/build/vite.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const load = createRequire(path.join(root, "packages/shader-compiler/package.json"));
const { createWebGPUShaderCompiler, compileWebGPUShaderPass } = load("./dist/webgpu.main.js");
const { ShaderPrecompiler } = load("./dist/precompile.main.js");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");

function shaderFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? shaderFiles(file) : entry.name.endsWith(".shaderc") ? [file] : [];
  });
}

function collectIncludeMap(shaderLibrary) {
  const includes = Object.fromEntries(shaderLibrary.map(({ path: p, source }) => [p, source]));
  includes["Masonry/SceneLighting.glsl"] = fs.readFileSync(
    path.join(root, "packages/building/src/building/runtime/ConstructionSceneLighting.glsl"),
    "utf8"
  );
  // Add terrain & water local `.glsl` chunks
  for (const dir of [
    path.join(root, "packages/terrain/src/shaders"),
    path.join(root, "packages/terrain/src/data/seed-world/source/Shader/Water")
  ]) {
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".glsl")) {
          const rel = path.relative(dir, full).split(path.sep).join("/");
          includes[rel] = fs.readFileSync(full, "utf8");
        }
      }
    };
    walk(dir);
  }
  return includes;
}

/** Resolve the authoritative `.shader` ShaderLab source file for every Seed `.shaderc` asset. */
function resolveShaderSourcePath(shadercFile, shaderName) {
  const rel = path.relative(root, shadercFile).split(path.sep).join("/");
  if (rel.startsWith("packages/building/src/building/assets/native/Shaders/")) {
    const base = path.basename(shadercFile, ".shaderc");
    return path.join(root, "packages/building/src/building/shaders/native", `${base}.shader`);
  }
  if (shaderName.startsWith("Terrain/")) {
    const base = shaderName.slice("Terrain/".length);
    return path.join(root, "packages/terrain/src/shaders", `${base}.shader`);
  }
  if (shaderName === "AIWorld/OceanFar") {
    return path.join(root, "packages/terrain/src/data/seed-world/source/Shader/Water/OceanFarGraded.shader");
  }
  if (shaderName === "AIWorld/Ocean") {
    return path.join(root, "packages/terrain/src/data/seed-world/source/Shader/Water/OceanNearDetailed.shader");
  }
  if (shaderName.startsWith("AIWorld/HeightfieldWater")) {
    return path.join(root, "packages/terrain/src/data/seed-world/source/Shader/Water/LakeHeightfieldHighHybrid.shader");
  }
  throw new Error(`No ShaderLab .shader source mapped for ${rel} (${shaderName}).`);
}

function exportShaders(compiler, server) {
  const modu = (file) => server.ssrLoadModule("/packages/" + file);
  return Promise.all([
    modu("shader/src/ShaderLibrary/index.ts"),
    modu("core/src/shader/WorldShaderInstructions.ts")
  ]).then(([{ shaderLibrary }, { productFragmentInstructions }]) => {
    const includes = collectIncludeMap(shaderLibrary);
    const glslPrecompiler = new ShaderPrecompiler();
    glslPrecompiler.setIncludeMap(includes);
    const wgslPrecompiler = new ShaderPrecompiler(compiler);
    wgslPrecompiler.setIncludeMap(includes);

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

      const sourcePath = resolveShaderSourcePath(file, data.name);
      assert.ok(fs.existsSync(sourcePath), `Missing ShaderLab source: ${sourcePath}`);
      const shaderSource = fs.readFileSync(sourcePath, "utf8");
      const sourceRel = path.relative(root, sourcePath).split(path.sep).join("/");

      // Compile the single ShaderLab source through BOTH backends (GLES300Visitor + WGSLVisitor)
      const glslCompiled = glslPrecompiler.precompile(shaderSource, 0, sourceRel);
      const wgslCompiled = wgslPrecompiler.precompile(shaderSource, 1, sourceRel);

      const isBuilding = data.name.startsWith("BuildingUnit/");
      const existingPasses = data.subShaders.flatMap((g) => g.passes);
      const wgslPasses = wgslCompiled.subShaders.flatMap((g) => g.passes);
      const glslPasses = glslCompiled.subShaders.flatMap((g) => g.passes);
      assert.equal(existingPasses.length, wgslPasses.length, `Pass count mismatch for ${sourceRel}`);

      for (let i = 0; i < existingPasses.length; i++) {
        const pass = existingPasses[i];
        const wPass = wgslPasses[i];
        const gPass = glslPasses[i];
        if (pass.isUsePass) continue;

        // Apply Seed clip-Y orientation to WGSL fragment instructions (Terrain/Water) before baking default `wgsl`
        const orientedWGSLFS = productFragmentInstructions(data.name, wPass.wgslFragmentInstructions);
        const baked = compileWebGPUShaderPass(compiler, {
          uniformBlocks: wPass.uniformBlocks,
          wgslVertexInstructions: wPass.wgslVertexInstructions,
          wgslFragmentInstructions: orientedWGSLFS
        });

        for (const stage of ["vertex", "fragment"]) {
          const wgsl = baked[stage];
          assert.ok(wgsl.includes("@" + stage) && wgsl.includes("fn " + baked[stage + "EntryPoint"] + "("));
        }

        pass.wgsl = baked;
        pass.wgslVertexInstructions = wPass.wgslVertexInstructions;
        pass.wgslFragmentInstructions = wPass.wgslFragmentInstructions;
        if (wPass.uniformBlocks?.length) pass.uniformBlocks = wPass.uniformBlocks;
        if (wPass.vertexOutputNames) pass.vertexOutputNames = wPass.vertexOutputNames;

        // Keep GLSL instructions synchronized from the same ShaderLab source for Terrain & Water;
        // for Building native assets, retain the original unoptimized GLSL instruction payload
        // inspected by SPIR-V optimizer unit tests while shipping dual-verified ShaderLab sources.
        if (!isBuilding) {
          pass.vertexShaderInstructions = gPass.vertexShaderInstructions;
          pass.fragmentShaderInstructions = gPass.fragmentShaderInstructions;
          if (gPass.uniformPlan) pass.uniformPlan = gPass.uniformPlan;
        }
        passes++;
      }

      const result = Buffer.from(JSON.stringify(data));
      cached.set(sha, result);
      record(result);
    }

    for (const file of files) {
      try {
        exportFile(file);
      } catch (error) {
        throw Error(`Cannot export ${path.relative(root, file)}`, { cause: error });
      }
    }
    // Also export dual GLSL + single-AST WGSL for Water built-in JSON shader assets (`lake`, `river`, `ocean`)
    const waterBuiltinDir = path.join(root, "packages/water/src/water/native/assets/Water/Shaders/builtin");
    const waterShaderDir = path.join(root, "packages/water/src/water/native/assets/Water/Shaders");
    for (const [profile, name] of [
      ["lake", "Water/Lake.v1"],
      ["river", "Water/River.v1"],
      ["ocean", "Water/Ocean.v1"]
    ]) {
      const srcFile = path.join(waterShaderDir, `${profile}.shader`);
      const outFile = path.join(waterBuiltinDir, `${profile}.json`);
      if (!fs.existsSync(srcFile) || !fs.existsSync(outFile)) continue;
      const shaderSource = fs
        .readFileSync(srcFile, "utf8")
        .replace(/\bShader\s+"[^"\n]+"/, `Shader "${name}"`);
      const rel = path.relative(root, srcFile).split(path.sep).join("/");
      const data = glslPrecompiler.precompile(shaderSource, 0, rel);
      const wgslData = wgslPrecompiler.precompile(shaderSource, 1, rel);
      const glslPasses = data.subShaders.flatMap((g) => g.passes);
      const wgslPasses = wgslData.subShaders.flatMap((g) => g.passes);
      assert.equal(glslPasses.length, wgslPasses.length, `Pass count mismatch for ${rel}`);
      for (let i = 0; i < glslPasses.length; i++) {
        const gPass = glslPasses[i];
        const wPass = wgslPasses[i];
        if (gPass.isUsePass) continue;
        const baked = compileWebGPUShaderPass(compiler, {
          uniformBlocks: wPass.uniformBlocks,
          wgslVertexInstructions: wPass.wgslVertexInstructions,
          wgslFragmentInstructions: productFragmentInstructions(data.name, wPass.wgslFragmentInstructions)
        });
        gPass.wgsl = baked;
        gPass.wgslVertexInstructions = wPass.wgslVertexInstructions;
        gPass.wgslFragmentInstructions = wPass.wgslFragmentInstructions;
        if (wPass.uniformBlocks?.length) gPass.uniformBlocks = wPass.uniformBlocks;
        if (wPass.vertexOutputNames) gPass.vertexOutputNames = wPass.vertexOutputNames;
        passes++;
      }
      writes.set(outFile, Buffer.from(JSON.stringify(data) + "\n"));
    }
    writeProductAssets(records, writes, renamed);
    console.log(`Exported ${passes} distinct single-AST WGSL passes across ${writes.size - 3} product shader assets.`);
  });
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
          .then(() => exportShaders(compiler, server))
          .finally(() => server.close())
      )
      .finally(() => fs.rmSync(scratch, { recursive: true, force: true }));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
