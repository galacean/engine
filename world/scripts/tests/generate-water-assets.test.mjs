import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { engineModify } from "../../../packages/modify/build/vite.mjs";
import { cleanWaterShaderSource } from "../water-shader-cleanup.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = process.env.WATER_ASSET_TEST_OUTPUT ?? await mkdtemp(path.join(tmpdir(), "water-assets-test-"));
const json = async name => JSON.parse(await readFile(path.join(output, name), "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
let server, manifest, prefab, authoring;
before(async () => {
  execFileSync(process.execPath, [path.join(root, "world/scripts/generate-water-assets.mjs")], {
    cwd: root, env: { ...process.env, WATER_ASSET_OUTPUT: output }, stdio: "pipe"
  });
  manifest = await json("project.json");
  prefab = await json("Water/Presets/lake.prefab");
  authoring = prefab.components[0].props.authoring;
  server = await createServer({ root, configFile: false, cacheDir: `${output}-vite-cache`, plugins: [
    { name: "water-generator-test-source-paths", enforce: "pre", resolveId(source) {
      if (source.startsWith("/packages/")) return path.join(root, source);
    } }, engineModify()],
    server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] } });
});
after(async () => server?.close());

test("source cleanup removes unused helpers and repeated includes without changing GPU programs", async () => {
  const { ShaderCompiler } = await server.ssrLoadModule("@galacean/engine-shader-compiler");
  const { ShaderMacroProcessor } = await server.ssrLoadModule("/packages/core/src/shader/ShaderMacroProcessor.ts");
  const compiler = new ShaderCompiler();
  const library = `#ifndef WATER_TEST_NORMAL_INCLUDED
#define WATER_TEST_NORMAL_INCLUDED
float testNormal(float value) { return value * 0.5; }
#endif\n`;
  const shader = (prefix) => `Shader "cleanup" { SubShader "Default" { Pass "Forward" {
    VertexShader = vert; FragmentShader = frag;
    ${prefix}
    ${library}
    float unusedHelper(float value) { return value * 100.0; }
    void vert() { gl_Position = vec4(0.0); }
    void frag() { gl_FragColor = vec4(testNormal(1.0)); }
  } } }`;
  const normalized = value => value.replace(/\s+/g, "");
  const comment = `/*\n${library}*/\n`;
  for (const prefix of [library, `#ifdef FIRST_COPY\n${library}#endif\n`, comment + library]) {
    const conditional = prefix.startsWith("#ifdef");
    const original = shader(prefix);
    const cleaned = cleanWaterShaderSource(original, compiler);
    assert.ok(!cleaned.includes("unusedHelper"));
    assert.equal((cleaned.replace(/\/\*[\s\S]*?\*\//g, "").match(/float testNormal\(/g) ?? []).length, conditional ? 2 : 1);
    if (prefix.startsWith(comment)) assert.ok(cleaned.includes(comment));
    assert.equal(cleanWaterShaderSource(cleaned, compiler), cleaned);
    const before = compiler._parseShaderSource(original).subShaders[0].passes[0];
    const after = compiler._parseShaderSource(cleaned).subShaders[0].passes[0];
    for (const backend of [0, 1]) {
      const a = compiler._parseShaderPass(before.contents, "vert", "frag", backend, "shaders://root/");
      const b = compiler._parseShaderPass(after.contents, "vert", "frag", backend, "shaders://root/");
      assert.ok(a && b);
      for (const macros of [new Map(), new Map([["FIRST_COPY", "1"]])])
        for (const stage of ["vertex", "fragment"])
          assert.equal(normalized(ShaderMacroProcessor.evaluate(a[`${stage}ShaderInstructions`], macros)),
            normalized(ShaderMacroProcessor.evaluate(b[`${stage}ShaderInstructions`], macros)));
    }
  }
});

test("complete generated project uses native types and closes every author asset reference", async () => {
  const entries = new Map(manifest.files.map(file => [file.virtualPath, file]));
  assert.equal(entries.size, manifest.files.length);
  assert.ok(entries.has(manifest.scene));
  const references = value => {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, child]) =>
      (key === "$ref" || key === "url") && typeof child === "string" ? [child] : references(child));
  };
  for (const file of manifest.files) {
    assert.notEqual(file.type, "WaterResource");
    assert.ok(!file.path.endsWith(".water"));
    const bytes = await readFile(path.join(output, file.path));
    if (["Scene", "Prefab", "Material", "JSON"].includes(file.type))
      for (const ref of references(JSON.parse(bytes))) assert.ok(entries.has(ref), `${file.path} -> ${ref}`);
  }
  assert.equal(entries.get(authoring.terrain.description.$ref).type, "JSON");
  assert.equal(entries.get(authoring.terrain.heights.$ref).type, "Buffer");
});

test("native CPU decoder accepts unchanged lake/bed semantics and rejects corrupt bytes", async () => {
  const { decodeWaterTerrainAssets, encodeWaterTerrainAssets } = await server.ssrLoadModule("/packages/water/src/water/native/WaterTerrainAssets.ts");
  const { validateWaterAuthoringSettings, compileWaterShape } = await server.ssrLoadModule("/packages/water/src/water/native/WaterAuthoring.ts");
  validateWaterAuthoringSettings(authoring);
  assert.equal(authoring.terrain.mode, "asset");
  const description = await json(authoring.terrain.description.$ref);
  const bytes = new Uint8Array(await readFile(path.join(output, authoring.terrain.heights.$ref)));
  assert.equal(description.sha256, sha(bytes));
  assert.equal(description.byteLength, bytes.byteLength);
  const expected = { id: "manual-bed", revision: 1, origin: [0, 0], spacing: 1, columns: 9, rows: 9, heights: Array(81).fill(-1) };
  const decoded = decodeWaterTerrainAssets(description, bytes);
  assert.deepEqual(decoded.snapshot, expected);
  assert.deepEqual(description, encodeWaterTerrainAssets(expected).description);
  assert.deepEqual(bytes, encodeWaterTerrainAssets(expected).heights);
  assert.equal(authoring.shape.referenceLevel, 0.5);
  assert.equal(authoring.shape.levelOffsetM, 0);
  assert.deepEqual(authoring.shape.shoreline.map(({ x, z }) => [x, z]), [[1, 1], [7, 1], [7, 7], [1, 7]]);
  assert.doesNotThrow(() => compileWaterShape(authoring.shape, decoded.snapshot, "generated-lake"));
  const corrupt = bytes.slice(); corrupt[0] ^= 1;
  assert.throws(() => decodeWaterTerrainAssets(description, corrupt), /checksum/);
});

test("copied texture and Shader bytes retain their source hashes", async () => {
  for (const entry of await json("conversion.json")) {
    const bytes = await readFile(path.join(output, entry.target));
    assert.equal(sha(bytes), entry.sha256, entry.target);
    assert.equal(bytes.length, entry.byteLength, entry.target);
  }
});

test("all sixteen native textures use KTX2 and river metadata preserves source and color identity", async () => {
  const textures = manifest.files.filter(file => file.virtualPath.startsWith("Water/Textures/"));
  assert.equal(textures.length, 16);
  const recipe = JSON.parse(await readFile(path.join(root, "packages/water/src/water/resources/river/assets/ktx2-manifest.json")));
  for (const file of textures) {
    assert.equal(file.type, "KTX2");
    assert.ok(file.path.endsWith(".ktx2"));
    const bytes = await readFile(path.join(output, file.path));
    assert.equal(bytes.subarray(0, 12).toString("hex"), "ab4b5458203230bb0d0a1a0a");
    const width = bytes.readUInt32LE(20), height = bytes.readUInt32LE(24);
    assert.ok(Math.max(width, height) <= 512, file.path);
    assert.equal(bytes.readUInt32LE(40), Math.floor(Math.log2(Math.max(width, height))) + 1);
    const dfd = bytes.readUInt32LE(48);
    assert.equal(bytes[dfd + 14], file.params.isSRGBColorSpace ? 2 : 1);
    const entry = Object.values(recipe.textures).find(entry => file.virtualPath === `Water/Textures/${entry.id}.ktx2`);
    if (!entry) continue; // Six previously compressed Lake/Ocean assets retain their own recipes.
    assert.deepEqual([width, height], [entry.width, entry.height]);
    assert.equal(sha(bytes), entry.sha256);
    const source = await readFile(path.join(root, "packages/water/src/water/resources/river/assets", entry.source));
    assert.equal(sha(source), entry.sourceSha256);
    const sourceWidth = source.readUInt32BE(16), sourceHeight = source.readUInt32BE(20);
    const scale = Math.min(1, 512 / Math.max(sourceWidth, sourceHeight));
    assert.deepEqual([width, height], [sourceWidth * scale, sourceHeight * scale]);
    if (["farmlands-drop-cloud", "farmlands-drop-mist", "farmlands-drop-splash"].includes(entry.id))
      assert.equal(bytes[dfd + 31], 3, "UASTC RGBA must retain the non-opaque alpha channel");
  }
});

test("texture-only generation preserves all authored Shader and near/far AOT bytes", async () => {
  const isolated = await mkdtemp(path.join(tmpdir(), "water-texture-only-"));
  execFileSync(process.execPath, [path.join(root, "world/scripts/generate-water-assets.mjs"), "--textures-only"], {
    cwd: root, env: { ...process.env, WATER_ASSET_OUTPUT: isolated }, stdio: "pipe"
  });
  for (const file of manifest.files.filter(file => file.type === "Shader")) {
    assert.deepEqual(await readFile(path.join(isolated, file.path)),
      await readFile(path.join(root, "packages/water/src/water/native/assets", file.path)), file.path);
  }
});
