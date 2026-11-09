import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createHash } from "node:crypto";
import { engineModify } from "../../packages/modify/build/vite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = process.env.WATER_ASSET_OUTPUT ?? path.join(root, "packages/water/src/water/native/assets");
// A format-only migration keeps authored Shader behavior independent of newer
// compiler features. Full generation remains the default for Shader updates.
const texturesOnly = process.argv.includes("--textures-only");
const server = await createServer({ root, configFile: false, plugins: [
  { name: "water-offline-source-paths", enforce: "pre", resolveId(source) {
    if (source.startsWith("/packages/")) return path.join(root, source);
  } }, engineModify()], server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, entries: [] } });
try {
  const load = file => server.ssrLoadModule(`/packages/water/src/water/${file}.ts`);
  const { WaterBodyAssetRegistry } = await load("runtime/body/WaterBodyAssetRegistry");
  const { registerLakeWaterLook, LAKE_WATER_LOOK_PRESET_ID } = await load("presets/lake/LakeWaterLook");
  const { createWaterQualitySettings } = await load("native/WaterQualitySettings");
  const { encodeWaterTerrainAssets } = await load("native/WaterTerrainAssets");
  const registry = new WaterBodyAssetRegistry(); registerLakeWaterLook(registry);
  const { registerRiverWaterBodyPresets, registerFarmlandsRiverLook, FARMLANDS_RIVER_LOOK_ID, riverQualityPlanIdForQuality } = await load("presets/river/index");
  const { registerOceanLook } = await load("authoring/ocean/OceanAuthoring");
  const { OCEAN_LOOK_ID } = await load("presets/ocean/index");
  const { createWaterMaterialFile, waterMaterialShaderSource } = await load("native/WaterMaterial");
  const { LAKE_NORMAL_RESOURCE } = await load("resources/lake/LakeNormalAssetIdentity");
  const { FARMLANDS_WAVE_RESOURCE, FARMLANDS_CAUSTICS_RESOURCE } = await load("resources/river/FarmlandsWaterAssets");
  const { FARMLANDS_DROP_ASSETS } = await load("resources/river/FarmlandsDropAssets");
  registerRiverWaterBodyPresets(registry); registerFarmlandsRiverLook(registry);
  registerOceanLook(registry);
  const shape = { kind: "lake", referenceLevel: 0.5, levelOffsetM: 0,
    shoreline: [[1, 1], [7, 1], [7, 7], [1, 7]].map(([x, z], index) => ({ id: `shore-${index}`, ring: "shore", x, z })) };
  const terrain = encodeWaterTerrainAssets({ id: "manual-bed", revision: 1,
    origin: [0, 0], spacing: 1, columns: 9, rows: 9, heights: Array(81).fill(-1) });
  const authoring = { shape, terrain: { mode: "asset",
    description: { $ref: "Water/Terrain/manual-bed.json" }, heights: { $ref: "Water/Terrain/manual-bed.bin" } },
    quality: createWaterQualitySettings("lake"), material: { $ref: "Water/Materials/lake.mat" }, visible: true, priority: 10 };
  const files = {
    "Water/Terrain/manual-bed.json": terrain.description,
    "Water/Terrain/manual-bed.bin": terrain.heights,
    "Water/Presets/lake.prefab": { asset: { version: "2.0" }, root: "lake-root",
      entities: [{ id: "lake-root", name: "Lake", components: ["lake-body"] }],
      components: [{ id: "lake-body", type: "WaterBodyComponent", props: { authoring } }] },
    "Water/Scenes/lake.scene": { asset: { version: "2.0" }, scene: {
      rootEntities: ["lake-instance"], background: { mode: 0, color: { r: 0.12, g: 0.17, b: 0.19, a: 1 } }
    }, entities: [{ id: "lake-instance", instance: { asset: { $ref: "Water/Presets/lake.prefab" } } }], components: [] }
  };
  const nativeFiles = [], conversion = [], texturePaths = new Map();
  const copy = async (source, target, type, params, expectedHash) => {
    const bytes = await fs.readFile(path.join(root, source));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (expectedHash && hash !== expectedHash) throw new Error(`Water conversion source hash mismatch: ${source}`);
    const destination = path.join(output, target);
    await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, bytes);
    nativeFiles.push({ virtualPath: target, path: target, type, ...(params ? { params } : {}) });
    const dimensions = type === "KTX2" ? { width: bytes.readUInt32LE(20), height: bytes.readUInt32LE(24) }
      : type === "Texture" ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : {};
    conversion.push({ source, target, sha256: hash, byteLength: bytes.byteLength, type, ...dimensions, ...(params ? { params } : {}) });
  };
  const resourceRoot = "packages/water/src/water/resources/";
  const textures = [
    [LAKE_NORMAL_RESOURCE.id, "lake/assets/grasslands-water-normal-512.ktx2", false, 1],
    [FARMLANDS_WAVE_RESOURCE.id, "river/assets/ktx2/farmlands-wave-large.ktx2", false, 1, FARMLANDS_WAVE_RESOURCE.contentHash],
    [FARMLANDS_CAUSTICS_RESOURCE.id, "river/assets/ktx2/farmlands-caustics.ktx2", true, 1, FARMLANDS_CAUSTICS_RESOURCE.contentHash],
    ...Object.entries(FARMLANDS_DROP_ASSETS).map(([slot, asset]) => [asset.descriptor.id,
      `river/assets/ktx2/drops/${slot === "cloud" ? "cloud-linear" : slot}.ktx2`, asset.srgb, 1, asset.descriptor.contentHash]),
    ...[["smoothWaves", "Normals/SmoothWaves.ktx2", false, 4], ["roughWaves", "Normals/RoughWaves.ktx2", false, 4],
      ["caustics", "Caustics/Caustics_1.ktx2", true, 2], ["foam", "Foam/Foam1.ktx2", true, 2],
      ["intersectionNoise", "IntersectionNoise.ktx2", true, 2]].map(([slot, file, srgb, aniso]) => [`ocean-${slot}`, `ocean/textures/${file}`, srgb, aniso])
  ];
  for (const [id, source, srgb, aniso, hash] of textures) {
    const target = `Water/Textures/${id}${path.extname(source)}`;
    texturePaths.set(id, target);
    await copy(resourceRoot + source, target, source.endsWith(".ktx2") ? "KTX2" : "Texture", {
      isSRGBColorSpace: srgb, mipmap: true, wrapModeU: 1, wrapModeV: 1,
      filterMode: id.startsWith("ocean-") ? 2 : 1, anisoLevel: aniso
    }, hash);
  }
  const terrainRoot = "packages/terrain/src/data/seed-world/";
  const terrainManifest = JSON.parse(await fs.readFile(path.join(root, terrainRoot, "project.json"), "utf8"));
  const shaders = new Map();
  for (const [kind, profile, name] of [["lake", "lake-heightfield-high-hybrid-v2", "AIWorld/HeightfieldWaterSurfaceAppearanceV2ed93d4a81a01602dHybridHigh0"],
    ["ocean", "ocean-near-detailed", "AIWorld/Ocean"]]) {
    const original = terrainManifest.files.find(file => file.virtualPath === `Shader/Water/${profile}.shaderc`);
    const target = `Water/Shaders/${profile}.shaderc`;
    await copy(terrainRoot + original.path, target, "Shader");
    shaders.set(kind, { name, path: target });
  }
  // River is structurally generated in the current backend. Export its actual standalone source.
  const riverLook = registry.getLookAuthoringSnapshot(FARMLANDS_RIVER_LOOK_ID);
  const { WaterRenderContractCompiler } = await load("compiler/surface/WaterRenderContractCompiler");
  const resourceDescriptors = [FARMLANDS_WAVE_RESOURCE, FARMLANDS_CAUSTICS_RESOURCE, ...Object.values(FARMLANDS_DROP_ASSETS).map(asset => asset.descriptor)];
  const contract = WaterRenderContractCompiler.compile({ sourceId: riverLook.look.id, look: riverLook.look,
    appearance: riverLook.appearance.appearance, fieldDependencies: riverLook.appearance.fieldDependencies,
    optics: { id: riverLook.optics.id, profile: riverLook.optics.profile }, reflectionIntent: riverLook.reflectionPolicy,
    renderState: riverLook.renderState, resources: resourceDescriptors, qualityPlan: registry.getQualityPlan(riverQualityPlanIdForQuality("high")) });
  if (!contract.valid) throw new Error(JSON.stringify(contract.diagnostics));
  const { createRiverSurfaceAppearanceV2ShaderSource } = await load("runtime/river/RiverSurfaceShader");
  const { createWaterShaderModule, materializeWaterShaderModuleSource } = await load("runtime/material/WaterShaderModule");
  const riverSource = createRiverSurfaceAppearanceV2ShaderSource(contract.data, true);
  const riverName = riverSource.match(/Shader\s+"([^"]+)"/)[1];
  const nativeRiverSource = materializeWaterShaderModuleSource(createWaterShaderModule(riverName, riverSource, {}, []));
  shaders.set("river", { name: riverName });
  const { createSeedWorldWaterShaderAotProfiles } = await server.ssrLoadModule("/packages/water/src/world/SeedWorldWaterShaderAotProfiles.ts");
  const modules = createSeedWorldWaterShaderAotProfiles();
  for (const kind of ["lake", "river", "river-drops", "ocean"]) {
    const profile = kind === "river-drops" ? "river" : kind;
    const original = registry.getLookAuthoringSnapshot(profile === "lake" ? LAKE_WATER_LOOK_PRESET_ID : profile === "river" ? FARMLANDS_RIVER_LOOK_ID : OCEAN_LOOK_ID);
    const { riverDrops: _drops, ...surface } = original.look;
    const look = kind === "river-drops" ? original : { ...original, look: surface };
    const shader = shaders.get(profile), shaderPath = `Water/Shaders/${profile}.shader`;
    const material = createWaterMaterialFile(look, profile, { name: shader.name, path: shaderPath }, texturePaths);
    if (profile === "ocean") for (const slot of ["smoothWaves", "roughWaves", "caustics", "foam", "intersectionNoise"])
      material.shaderData[`material_Ocean_${slot}`] = { type: "Texture", value: { url: texturePaths.get(`ocean-${slot}`) } };
    let source = profile === "river" ? nativeRiverSource : materializeWaterShaderModuleSource(modules.find(module => module.id === (profile === "lake" ? "lake-heightfield-high-hybrid-v2" : "ocean-near-detailed")).module);
    if (profile === "ocean") {
      const far = materializeWaterShaderModuleSource(modules.find(module => module.id === "ocean-far-graded").module);
      const farSubShader = far.slice(far.indexOf('SubShader '), far.lastIndexOf('}')).replace(/SubShader\s+"[^"]+"/, 'SubShader "WaterFar"');
      source = source.slice(0, source.lastIndexOf('}')) + farSubShader + "\n}";
    }
    // The river Shader declares both surface and drop controls. Plain rivers do not acquire drop textures.
    if (kind !== "river") files[shaderPath] = texturesOnly
      ? await fs.readFile(path.join(root, "packages/water/src/water/native/assets", shaderPath), "utf8")
      : waterMaterialShaderSource(source, material);
    files[`Water/Materials/${kind}.mat`] = material;
  }
  const nativeTypes = { ".scene": "Scene", ".prefab": "Prefab", ".mat": "Material", ".shader": "Shader", ".json": "JSON", ".bin": "Buffer" };
  const manifest = { scene: "Water/Scenes/lake.scene", files: [...nativeFiles, ...Object.keys(files).map(virtualPath => {
    const type = nativeTypes[path.extname(virtualPath)];
    if (!type) throw new Error(`Unsupported generated native Water asset '${virtualPath}'.`);
    return { virtualPath, path: virtualPath, type };
  })] };
  for (const [name, value] of Object.entries({ ...files, "project.json": manifest })) {
    const target = path.join(output, name); await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, value instanceof Uint8Array || typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
  }
  await fs.writeFile(path.join(output, "conversion.json"), JSON.stringify(conversion, null, 2) + "\n");
  console.log(`Wrote ${manifest.files.length} native Water assets, project manifest and verified source hashes.`);
} finally { await server.close(); }
