import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bakeGroundWindWeights,
  buildGlb as buildGroundWindGlb,
  calibrateGroundWindMaterial,
  seedWorldFlowerCalibration
} from "../../wind-vegetation/offline/generate-ground-vegetation-wind-weights.mjs";
import { optimizeSeedWorldGroundDetail } from "./optimize-seed-world-ground-details.mjs";

const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const FOLIAGE_PRIMITIVE_INDEX = 1;
const TREE_LOD_MESH_INDICES = [2, 0, 1];
const UNSIGNED_SHORT = 5123;
const LEAF_TRANSMISSION_REFERENCE = Object.freeze({
  backlightThreshold: 0.2,
  normalWrap: 1,
  energyScale: 0.5,
  shadowStrength: 1
});

const treeSources = [
  {
    id: "cartoon/tree/broadleaf-large/v1",
    slug: "broadleaf-large",
    label: "Broadleaf large",
    model: "1adfe9392d9a2aac.glb",
    trunkMaterial: "Surface/broadleaf-bark.mat",
    leafMaterial: "Vegetation/broadleaf-leaves.mat",
    leafMask: "leaf",
    proceduralProfile: "small-maple",
    size: 19.745579,
    sourcePrefab: "tree-broadleaf-large-1.prefab"
  },
  {
    id: "cartoon/tree/broadleaf-medium/v1",
    slug: "broadleaf-medium",
    label: "Broadleaf medium",
    model: "d166cc5e0e841bb6.glb",
    trunkMaterial: "Surface/broadleaf-bark.mat",
    leafMaterial: "Vegetation/broadleaf-leaves.mat",
    leafMask: "leaf",
    proceduralProfile: "small-maple",
    size: 16.330677,
    sourcePrefab: "tree-broadleaf-medium-2.prefab"
  },
  {
    id: "cartoon/tree/birch-large/v1",
    slug: "birch-large",
    label: "Birch large",
    model: "8fcd8b5a84cbb2a1.glb",
    trunkMaterial: "Surface/birch-bark.mat",
    leafMaterial: "Vegetation/birch-leaves.mat",
    leafMask: "leaf",
    proceduralProfile: "white-birch",
    size: 19.114738,
    sourcePrefab: "tree-birch-large-1.prefab"
  },
  {
    id: "cartoon/tree/birch-medium/v1",
    slug: "birch-medium",
    label: "Birch medium",
    model: "90fa81dde0531841.glb",
    trunkMaterial: "Surface/birch-bark.mat",
    leafMaterial: "Vegetation/birch-leaves.mat",
    leafMask: "leaf",
    proceduralProfile: "white-birch",
    size: 15.353751,
    sourcePrefab: "tree-birch-medium-2.prefab"
  }
];

const shrubSource = {
  assetId: "cartoon/shrub/bush-large/v1",
  model: "4dc38aab723d12e3.glb",
  material: "Vegetation/bush.mat",
  meshIndex: 1,
  primitiveIndex: 0,
  label: "Bush leaf card",
  lodMeshIndices: [1, 0]
};

const grassClusterSource = {
  id: "cartoon/grass/cluster/v1",
  slug: "grass",
  label: "Grass Cluster",
  material: "Vegetation/grass.mat",
  scale: 3.6409901,
  defaultColorRgb: [24, 128, 45],
  selectionWeight: 1
};

const treeLeafMaskSources = [
  { id: "leaf", label: "Leaf 1 · broad", fileName: "procedural-leaf-mask-1.png" },
  { id: "leaf2", label: "Leaf 2 · sparse", fileName: "procedural-leaf-mask-2.png" },
  { id: "leaf3", label: "Leaf 3 · pointed", fileName: "procedural-leaf-mask-3.png" },
  { id: "leaf4", label: "Leaf 4 · small dense", fileName: "procedural-leaf-mask-4.png" },
  { id: "leaf5", label: "Leaf 5 · full dense", fileName: "procedural-leaf-mask-5.png" }
];

const encodedCatalogTextureNames = [
  "mushroom-atlas.ktx2",
  "mushroom-normal.ktx2",
  "terrain-grass-2-normal.ktx2",
  "terrain-mud-2-normal.ktx2",
  ...treeLeafMaskSources.map((source) => source.fileName.replace(/\.png$/u, ".ktx2")),
  "lotus-albedo.ktx2",
  "lotus-normal.ktx2"
];

const primitiveSources = [
  {
    category: "grass",
    atomId: "cartoon/grass/grass-3/v1",
    slug: "grass-3",
    model: "9a13664c54fb244a.glb",
    material: "Vegetation/grass-3.mat",
    meshIndex: 0,
    label: "Grass 3",
    selectionWeight: 8881
  },
  {
    category: "grass",
    atomId: "cartoon/grass/grass-2/v1",
    slug: "grass-2",
    model: "43bc5a810f9d97d9.glb",
    material: "Vegetation/grass-2.mat",
    meshIndex: 0,
    label: "Grass 2",
    selectionWeight: 230284
  },
  {
    category: "grass",
    atomId: "cartoon/grass/grass-2-small/v1",
    slug: "grass-2-small",
    model: "73ca16df2dc8cfc1.glb",
    material: "Vegetation/grass-2.mat",
    meshIndex: 0,
    label: "Grass 2 small",
    selectionWeight: 15353
  },
  {
    category: "flower",
    atomId: "cartoon/flower/flowers-1/v1",
    slug: "flowers-1",
    model: "6c6934f5fbae9763.glb",
    material: "Vegetation/flowers-1.mat",
    meshIndex: 0,
    label: "Flowers 1",
    selectionWeight: 8967
  },
  {
    category: "flower",
    atomId: "cartoon/flower/flowers-2/v1",
    slug: "flowers-2",
    model: "30567eb3a6cc9260.glb",
    material: "Vegetation/flowers-2.mat",
    meshIndex: 0,
    label: "Flowers 2",
    selectionWeight: 9085
  }
];

const rockSource = {
  atomId: "cartoon/rock/small-stone-6/v1",
  slug: "small-stone-6",
  model: "b69315d265e09394.glb",
  material: "Surface/small-stones.mat",
  meshIndex: 1,
  label: "Small stone 6",
  lodMeshIndices: [1, 0]
};

const cliffAccentSource = {
  atomId: "cartoon/rock/rock-clif-1/v1",
  slug: "rock-clif-1",
  model: "clif-1-smooth.glb",
  material: "Surface/clif-1.mat",
  label: "Clif 1",
  lodMeshIndices: [2, 0, 1],
  sourcePrefab: "rock-clif-1.prefab",
  textures: {
    base: "48f1a2bb394eb4ae.ktx2",
    metallic: "56426dc113dce1cd.ktx2",
    occlusion: "a47da8db5502f4aa.ktx2"
  }
};

const billboardSource = {
  atomId: "cartoon/tree/cartoon-impostor/v1",
  model: "5b2a34d504fdb3f9.glb",
  material: "Billboard/tree.mat"
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const dataDirectory = dirname(dirname(fileURLToPath(import.meta.resolve("@galacean/engine-terrain/data/grasslands/project.json"))));
const grasslandsPublicDirectory = resolve(dataDirectory, "grasslands/public");
const sourceModelDirectory = join(grasslandsPublicDirectory, "Models");
const sourceMaterialDirectory = join(grasslandsPublicDirectory, "Material");
const sourcePrototypeDirectory = join(grasslandsPublicDirectory, "Prefab", "Prototype");
const sourceTextureDirectory = join(grasslandsPublicDirectory, "Texture");
const sourceAuthoringDirectory = resolve(dataDirectory, "seed-world/source");
const grassSourceDirectory = join(sourceAuthoringDirectory, "grass");
const sourceTerrainDirectory = join(sourceAuthoringDirectory, "terrain");
const stylizedSourceDirectory = join(sourceAuthoringDirectory, "stylized-environment");
const stylizedModelDirectory = join(stylizedSourceDirectory, "models");
const stylizedTextureDirectory = join(stylizedSourceDirectory, "textures");
const stylizedCatalog = JSON.parse(await readFile(join(stylizedSourceDirectory, "catalog.json"), "utf8"));
const lotusSourceDirectory = join(sourceAuthoringDirectory, "grasslands-stylized-nature-lotus");
const lotusModelDirectory = join(lotusSourceDirectory, "models");
const lotusTextureDirectory = join(lotusSourceDirectory, "textures");
const lotusCatalog = JSON.parse(await readFile(join(lotusSourceDirectory, "catalog.json"), "utf8"));
const smoothCliffModelDirectory = resolve(dataDirectory, "unity-cliffs-smooth/models");
const outputDirectory = resolve(dataDirectory, "seed-world/public");

if (dirname(outputDirectory) !== resolve(dataDirectory, "seed-world")) {
  throw new Error("Generated Seed World assets must remain inside data/seed-world/public");
}

const encodedCatalogTextures = new Map(
  await Promise.all(
    encodedCatalogTextureNames.map(async (fileName) => {
      try {
        return [fileName, await readFile(join(outputDirectory, "textures", fileName))];
      } catch (error) {
        throw new Error(
          `Seed World encoded texture ${fileName} is unavailable; run terrain:seed-world-textures:generate before regenerating the catalog.`,
          { cause: error }
        );
      }
    })
  )
);

await Promise.all(
  [
    "trees",
    "layouts",
    "atoms",
    "prefabs",
    "materials",
    "textures",
    "height-brushes",
    "Material/Debug",
    "Shader/debug"
  ].map((directory) => rm(join(outputDirectory, directory), { recursive: true, force: true }))
);
const productionCatalogPath = join(outputDirectory, "production-catalog.json");
const productionCatalogTemporaryPath = `${productionCatalogPath}.tmp`;
await rm(productionCatalogTemporaryPath, { force: true });
await mkdir(join(outputDirectory, "trees"), { recursive: true });
await mkdir(join(outputDirectory, "atoms"), { recursive: true });
await mkdir(join(outputDirectory, "prefabs"), { recursive: true });
await mkdir(join(outputDirectory, "materials"), { recursive: true });
await mkdir(join(outputDirectory, "textures"), { recursive: true });
await mkdir(join(outputDirectory, "height-brushes"), { recursive: true });
await writeFile(
  join(outputDirectory, "height-brushes/terrain3d-height-brushes-v1.r16"),
  await readFile(join(sourceTerrainDirectory, "terrain3d-height-brushes-v1.r16"))
);
await writeFile(
  join(outputDirectory, "textures", "grass-color-field.r8"),
  await readFile(join(grassSourceDirectory, "grass-color-field.r8"))
);

const generatedResources = [];

const stylizedTextureUrls = {};
for (const [key, sourceFileName, srgb, encoded] of [
  ["mushroom-atlas", "mushroom-atlas.png", true, true],
  ["mushroom-normal", "mushroom-normal.png", false, true],
  ["terrain-grass-2", "terrain-grass-2.png", true, false],
  ["terrain-grass-2-normal", "terrain-grass-2-normal.png", false, true],
  ["terrain-mud-2", "terrain-mud-2.png", true, false],
  ["terrain-mud-2-normal", "terrain-mud-2-normal.png", false, true],
  ...treeLeafMaskSources.map((source) => [source.id, source.fileName, false, true])
]) {
  const outputFileName = encoded ? sourceFileName.replace(/\.png$/u, ".ktx2") : sourceFileName;
  stylizedTextureUrls[key] = await writeGeneratedResource(
    `textures/${outputFileName}`,
    encoded ? "KTX2" : "Texture",
    encoded
      ? requireEncodedCatalogTexture(outputFileName)
      : await readFile(join(stylizedTextureDirectory, sourceFileName)),
    encoded ? undefined : textureParams(srgb)
  );
}
const treeLeafMasks = treeLeafMaskSources.map((source) => ({
  id: source.id,
  label: source.label,
  texture: stylizedTextureUrls[source.id]
}));
const lotusTextureUrls = {
  albedo: await writeGeneratedResource(
    "textures/lotus-albedo.ktx2",
    "KTX2",
    requireEncodedCatalogTexture("lotus-albedo.ktx2")
  ),
  normal: await writeGeneratedResource(
    "textures/lotus-normal.ktx2",
    "KTX2",
    requireEncodedCatalogTexture("lotus-normal.ktx2")
  )
};
const cliffTextureUrls = {};
for (const [role, sourceFileName] of Object.entries(cliffAccentSource.textures)) {
  if (role === "base") continue;
  cliffTextureUrls[role] = await writeGeneratedResource(
    `textures/${cliffAccentSource.slug}-${role}.ktx2`,
    "KTX2",
    await readFile(join(sourceTextureDirectory, sourceFileName))
  );
}

const stylizedRockGrassMaterialUrl = await writeGeneratedResource(
  "materials/stylized-rock-grass.mat",
  "Material",
  `${JSON.stringify(
    createStylizedRockCoverageMaterial("Stylized rock · Grass 2", stylizedTextureUrls["terrain-grass-2"], true)
  )}\n`
);
const stylizedRockMaterialUrl = await writeGeneratedResource(
  "materials/stylized-rock.mat",
  "Material",
  `${JSON.stringify(createStylizedRockMaterial("Stylized rock"))}\n`
);
const stylizedRockMudMaterialUrl = await writeGeneratedResource(
  "materials/stylized-rock-mud.mat",
  "Material",
  `${JSON.stringify(
    createStylizedRockCoverageMaterial("Stylized rock · Mud 2", stylizedTextureUrls["terrain-mud-2"], false)
  )}\n`
);
const cliffRockGrassMaterialUrl = await writeGeneratedResource(
  "materials/clif-1-grass.mat",
  "Material",
  `${JSON.stringify(
    createCliffRockCoverageMaterial("Clif 1 · Grass 2", cliffTextureUrls, stylizedTextureUrls["terrain-grass-2"], true)
  )}\n`
);
const cliffRockMaterialUrl = await writeGeneratedResource(
  "materials/clif-1.mat",
  "Material",
  `${JSON.stringify(createCliffRockMaterial("Clif 1", cliffTextureUrls))}\n`
);
const cliffRockMudMaterialUrl = await writeGeneratedResource(
  "materials/clif-1-mud.mat",
  "Material",
  `${JSON.stringify(
    createCliffRockCoverageMaterial("Clif 1 · Mud 2", cliffTextureUrls, stylizedTextureUrls["terrain-mud-2"], false)
  )}\n`
);
const stylizedStoneMaterialUrl = await writeGeneratedResource(
  "materials/stylized-stone.mat",
  "Material",
  `${JSON.stringify(createStylizedRockMaterial("Stylized stone"))}\n`
);
const stylizedFlowerMaterial = createStylizedVegetationMaterial(
  "Stylized Flower 1",
  stylizedTextureUrls["mushroom-atlas"],
  stylizedTextureUrls["mushroom-normal"],
  {
    baseColor: [1, 1, 1, 1],
    alphaCutoff: 0.4,
    lightingFlatness: 0.15,
    translucencyIntensity: 0.4,
    smoothness: 0.2,
    normalScale: 1
  }
);
calibrateGroundWindMaterial(stylizedFlowerMaterial, seedWorldFlowerCalibration);
const stylizedFlowerMaterialUrl = await writeGeneratedResource(
  "materials/stylized-flower-1.mat",
  "Material",
  `${JSON.stringify(stylizedFlowerMaterial)}\n`
);
const stylizedMushroomMaterialUrl = await writeGeneratedResource(
  "materials/stylized-mushroom-1.mat",
  "Material",
  `${JSON.stringify(
    createStylizedVegetationMaterial(
      "Stylized Mushroom 1",
      stylizedTextureUrls["mushroom-atlas"],
      stylizedTextureUrls["mushroom-normal"],
      {
        baseColor: [1, 1, 1, 1],
        alphaCutoff: 0.4,
        lightingFlatness: 0.15,
        translucencyIntensity: 0.4,
        smoothness: 1,
        normalScale: 1,
        distanceFadeEnabled: false,
        windEnabled: false
      }
    )
  )}\n`
);
const lotusLeafMaterialUrl = await writeGeneratedResource(
  "materials/lotus-leaf.mat",
  "Material",
  `${JSON.stringify(
    createLotusMaterial("Authorized lotus leaves", lotusTextureUrls, lotusCatalog.materials.leaf, {
      secondColorOffset: -0.6,
      secondColorFade: 0.15
    })
  )}\n`
);
const lotusFlowerMaterialUrl = await writeGeneratedResource(
  "materials/lotus-flower.mat",
  "Material",
  `${JSON.stringify(
    createLotusMaterial("Authorized lotus flowers", lotusTextureUrls, lotusCatalog.materials.flower, {
      secondColorOffset: 1.4,
      secondColorFade: -1
    })
  )}\n`
);

const generatedSources = [];
for (const source of treeSources) {
  const input = parseGlb(await readFile(join(sourceModelDirectory, source.model)));
  await validateSourceMaterial(source.trunkMaterial, "Terrain/Surface");
  const defaultColorRgb = await validateSourceMaterial(source.leafMaterial, "Terrain/Vegetation");
  const authoredLayouts = [];
  for (let lodIndex = 0; lodIndex < TREE_LOD_MESH_INDICES.length; lodIndex++) {
    const meshIndex = TREE_LOD_MESH_INDICES[lodIndex];
    const layout = extractCardLayout(input, `${source.slug}-lod${lodIndex}`, meshIndex, FOLIAGE_PRIMITIVE_INDEX);
    authoredLayouts.push(layout);
  }
  const proceduralGate = evaluateProceduralTreeCandidate(source, authoredLayouts);
  if (proceduralGate.status !== "failed") {
    throw new Error(`${source.label} procedural candidate passed; select and package one production path explicitly`);
  }
  generatedSources.push({
    id: source.id,
    label: source.label,
    size: source.size,
    defaultColorRgb,
    proceduralProfile: source.proceduralProfile,
    defaultLodProfile: { metric: "instance-count", values: TREE_LOD_MESH_INDICES.map(() => 1) },
    trunkMaterial: `Material/${source.trunkMaterial}`,
    leafMaterial: `Material/${source.leafMaterial}`,
    leafMask: requireTreeLeafMask(source.leafMask).texture,
    lodGroup: await loadSourceLodGroup(source.sourcePrefab, TREE_LOD_MESH_INDICES.length),
    sourceKind: "grasslands-modular",
    proceduralGate
  });
}

const generatedAtoms = {};
const generatedPrimitiveFamilies = { grass: [], flower: [] };
const shrubInput = parseGlb(await readFile(join(sourceModelDirectory, shrubSource.model)));
const shrubDefaultColorRgb = await validateSourceMaterial(shrubSource.material, "Terrain/Vegetation");
const shrubLods = [];
for (let lodIndex = 0; lodIndex < shrubSource.lodMeshIndices.length; lodIndex++) {
  requireGroundWindWeights(
    shrubInput,
    shrubSource.lodMeshIndices[lodIndex],
    shrubSource.primitiveIndex,
    `bush-large-lod${lodIndex}`,
    "shrub"
  );
  const layout = extractCardLayout(shrubInput, `bush-large-lod${lodIndex}`, shrubSource.lodMeshIndices[lodIndex], 0);
  const modelPath = `atoms/bush-large-lod${lodIndex}.glb`;
  const modelUrl = generatedVirtualPath("Models", modelPath);
  await writeGeneratedResource(
    modelPath,
    "GLTF",
    extractPrimitiveGlb(
      shrubInput,
      shrubSource.lodMeshIndices[lodIndex],
      shrubSource.primitiveIndex,
      `Bush large LOD${lodIndex}`
    ),
    { keepMeshData: true }
  );
  const prefabUrl = await writeAtomPrefab(`bush-large-lod${lodIndex}`, modelUrl, `Material/${shrubSource.material}`, {
    castShadows: true,
    receiveShadows: true,
    enableVertexColor: true
  });
  shrubLods.push({ prefabUrl, leafCount: layout.centers.length });
}
const shrubLodGroup = await loadSourceLodGroup("shrub-bush-large.prefab", shrubLods.length);
generatedAtoms.shrub = {
  id: shrubSource.assetId,
  label: "Bush large",
  defaultColorRgb: shrubDefaultColorRgb,
  defaultLodProfile: { metric: "instance-count", values: shrubLods.map(() => 1) },
  lods: shrubLods,
  lodGroup: shrubLodGroup
};

const grassClusterModelPath = `atoms/${grassClusterSource.slug}.glb`;
const grassClusterModelUrl = generatedVirtualPath("Models", grassClusterModelPath);
const grassClusterGlb = buildGroundWindGlb(
  parseGlb(await readFile(join(grassSourceDirectory, "grass.glb")))
);
await writeGeneratedResource(grassClusterModelPath, "GLTF", grassClusterGlb, { keepMeshData: true });
const grassClusterPrefabUrl = await writeStaticAtomPrefab(
  grassClusterSource.slug,
  grassClusterModelUrl,
  [
    {
      entityName: "grass-renderer",
      primitiveIndex: 0,
      materialUrl: `Material/${grassClusterSource.material}`,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [grassClusterSource.scale, grassClusterSource.scale, grassClusterSource.scale]
      },
      enableVertexColor: false
    }
  ],
  { castShadows: false, receiveShadows: true }
);
const grassCluster = {
  id: grassClusterSource.id,
  label: grassClusterSource.label,
  prefabUrl: grassClusterPrefabUrl,
  defaultColorRgb: grassClusterSource.defaultColorRgb,
  defaultLodProfile: { metric: "count-per-cell", values: [5] },
  selectionWeight: grassClusterSource.selectionWeight
};

for (const source of primitiveSources) {
  const sourceInput = parseGlb(await readFile(join(sourceModelDirectory, source.model)));
  requireGroundWindWeights(sourceInput, source.meshIndex, 0, source.slug, source.category);
  const input = source.slug.startsWith("flowers-")
    ? bakeGroundWindWeights(optimizeSeedWorldGroundDetail(sourceInput, source.slug), source.model, source.category)
    : sourceInput;
  const defaultColorRgb = await validateSourceMaterial(source.material, "Terrain/Vegetation");
  const modelPath = `atoms/${source.slug}.glb`;
  const modelUrl = generatedVirtualPath("Models", modelPath);
  await writeGeneratedResource(
    modelPath,
    "GLTF",
    extractPrimitiveGlb(input, source.meshIndex, 0, `${source.label} atom`),
    { keepMeshData: true }
  );
  const prefabUrl = await writeAtomPrefab(source.slug, modelUrl, `Material/${source.material}`, {
    castShadows: false,
    receiveShadows: true,
    enableVertexColor: true
  });
  generatedPrimitiveFamilies[source.category].push({
    id: source.atomId,
    label: source.label,
    prefabUrl,
    defaultColorRgb,
    defaultLodProfile: { metric: "count-per-cell", values: [source.category === "grass" ? 5 : 2] },
    selectionWeight: source.selectionWeight
  });
}

const rockInput = parseGlb(await readFile(join(sourceModelDirectory, rockSource.model)));
const rockDefaultColorRgb = await validateSourceMaterial(rockSource.material, "Terrain/Surface");
const rockLodGroup = await loadSourceLodGroup("rock-small-stone-6.prefab", rockSource.lodMeshIndices.length);
const rockLods = [];
for (let lodIndex = 0; lodIndex < rockSource.lodMeshIndices.length; lodIndex++) {
  const modelPath = `atoms/${rockSource.slug}-lod${lodIndex}.glb`;
  const modelUrl = generatedVirtualPath("Models", modelPath);
  await writeGeneratedResource(
    modelPath,
    "GLTF",
    extractPrimitiveGlb(rockInput, rockSource.lodMeshIndices[lodIndex], 0, `${rockSource.label} LOD${lodIndex}`),
    { keepMeshData: true }
  );
  const prefabUrl = await writeAtomPrefab(
    `${rockSource.slug}-lod${lodIndex}`,
    modelUrl,
    `Material/${rockSource.material}`,
    { castShadows: true, receiveShadows: true }
  );
  rockLods.push({ prefabUrl });
}

const stylizedLargeRockGrassVariants = [];
const stylizedLargeRockMudVariants = [];
const featureRockVariants = [];
const cliffAccentSurfaceVariants = await writeGrasslandsCliffSurfaceVariants(
  cliffAccentSource,
  cliffRockGrassMaterialUrl,
  cliffRockMudMaterialUrl,
  cliffRockMaterialUrl
);
stylizedLargeRockGrassVariants.push(cliffAccentSurfaceVariants.grass);
stylizedLargeRockMudVariants.push(cliffAccentSurfaceVariants.mud);
featureRockVariants.push(cliffAccentSurfaceVariants.plain);

const stylizedStoneVariants = [];
for (const sourceId of ["stone-1", "stone-2", "stone-3", "stone-4"]) {
  stylizedStoneVariants.push(await writeStylizedAtomicLodSource(sourceId, stylizedStoneMaterialUrl, sourceId));
}

const stylizedDebris = await writeStylizedAtomicLodSource("stones", stylizedStoneMaterialUrl, "stones");
const stylizedFlower = await writeStylizedAtomicLodSource("flower-1", stylizedFlowerMaterialUrl, "flower-1", {
  publishedLodIndices: [1]
});
const stylizedMushroom = await writeStylizedAtomicLodSource("mushroom-1", stylizedMushroomMaterialUrl, "mushroom-1");
const lotusVariants = [];
for (const source of lotusCatalog.variants) {
  const lods = [];
  for (let lodIndex = 0; lodIndex < source.lods.length; lodIndex++) {
    const sourceLod = source.lods[lodIndex];
    if (typeof sourceLod.castShadows !== "boolean") {
      throw new Error(`Authorized lotus source ${source.id} LOD${lodIndex} has no authored shadow policy`);
    }
    const input = parseGlb(await readFile(join(lotusModelDirectory, sourceLod.fileName)));
    const primitiveCount = input.json.meshes?.[0]?.primitives?.length ?? 0;
    if (primitiveCount !== sourceLod.primitiveCount || primitiveCount < 1 || primitiveCount > 2) {
      throw new Error(
        `Authorized lotus source ${source.id} LOD${lodIndex} has an invalid material-slot primitive count`
      );
    }
    const modelPath = `atoms/${source.id}-lod${lodIndex}.glb`;
    const modelUrl = await writeGeneratedResource(
      modelPath,
      "GLTF",
      stripUnusedGlbMaterials(await readFile(join(lotusModelDirectory, sourceLod.fileName))),
      { keepMeshData: true }
    );
    lods.push({
      prefabUrl: await writeMultiMaterialAtomPrefab(
        `${source.id}-lod${lodIndex}`,
        modelUrl,
        primitiveCount === 1 ? [lotusLeafMaterialUrl] : [lotusLeafMaterialUrl, lotusFlowerMaterialUrl],
        { castShadows: sourceLod.castShadows, receiveShadows: true }
      )
    });
  }
  lotusVariants.push({
    id: `cartoon/lotus/${source.id}/v1`,
    label: source.id === "lotus" ? "Lotus" : source.id === "lotus-group-1" ? "Lotus group 1" : "Lotus group 2",
    lods,
    defaultColorRgb: [255, 255, 255],
    defaultLodProfile: { metric: "instance-count", values: lods.map(() => 1) },
    lodGroup: {
      localReferencePoint: source.localReferencePoint,
      size: source.size,
      screenRelativeTransitionHeights: source.lods.map((lod) => lod.screenRelativeHeight)
    }
  });
}

const billboardInput = parseGlb(await readFile(join(sourceModelDirectory, billboardSource.model)));
await validateSourceMaterial(billboardSource.material, "Terrain/Billboard");
const billboardModelPath = "atoms/cartoon-tree-impostor.glb";
const billboardModelUrl = generatedVirtualPath("Models", billboardModelPath);
await writeGeneratedResource(
  billboardModelPath,
  "GLTF",
  extractPrimitiveGlb(billboardInput, 0, 0, "Cartoon whole-tree impostor"),
  { keepMeshData: true }
);
const billboardPrefabUrl = await writeAtomPrefab(
  "cartoon-tree-impostor",
  billboardModelUrl,
  `Material/${billboardSource.material}`,
  { castShadows: false, receiveShadows: true }
);
const cartoonPackage = {
  version: 5,
  id: "cartoon",
  label: "Cartoon",
  generatedResources,
  worldBounds: await loadGrasslandsWorldBounds(),
  treeRecipes: generatedSources,
  treeLeafMasks,
  treeImpostor: {
    id: billboardSource.atomId,
    prefabUrl: billboardPrefabUrl
  },
  ...generatedAtoms,
  grass: grassCluster,
  grassVariants: [grassCluster],
  flower: generatedPrimitiveFamilies.flower[0],
  flowerVariants: [...generatedPrimitiveFamilies.flower, atomicLodAsAtomic(stylizedFlower)],
  largeRockGrassVariants: stylizedLargeRockGrassVariants,
  largeRockMudVariants: stylizedLargeRockMudVariants,
  featureRockVariants,
  stoneVariants: stylizedStoneVariants,
  debris: stylizedDebris,
  mushroom: stylizedMushroom,
  lotusVariants,
  rock: {
    id: rockSource.atomId,
    label: rockSource.label,
    lods: rockLods,
    defaultLodProfile: { metric: "instance-count", values: rockLods.map(() => 12) },
    lodGroup: rockLodGroup,
    defaultColorRgb: rockDefaultColorRgb
  }
};
await writeFile(productionCatalogTemporaryPath, `${JSON.stringify(cartoonPackage, null, 2)}\n`);
await rename(productionCatalogTemporaryPath, productionCatalogPath);

process.stdout.write(
  `Generated Cartoon production catalog from Grasslands sources with ${generatedSources.length} procedural tree recipes and seven asset families\n`
);

function textureParams(isSRGBColorSpace) {
  return { isSRGBColorSpace, mipmap: true, filterMode: 2, wrapModeU: 1, wrapModeV: 1, anisoLevel: 8 };
}

function requireEncodedCatalogTexture(fileName) {
  const texture = encodedCatalogTextures.get(fileName);
  if (!texture) throw new Error(`Seed World encoded texture ${fileName} was not retained for catalog generation`);
  return texture;
}

function requireTreeLeafMask(id) {
  const source = treeLeafMasks.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`Tree recipe references unknown leaf mask ${id}`);
  return source;
}

function atomicLodAsAtomic(source) {
  if (source.lods.length === 0) throw new Error(`${source.id} requires at least one authored LOD`);
  return {
    id: source.id,
    label: source.label,
    prefabUrl: source.lods[0].prefabUrl,
    defaultColorRgb: source.defaultColorRgb,
    defaultLodProfile: {
      metric: "count-per-cell",
      values: [source.id.includes("/grass/") ? 5 : 2]
    },
    selectionWeight: source.selectionWeight
  };
}

async function writeStylizedAtomicLodSource(sourceId, materialUrl, outputSlug, options = {}) {
  const source = requireStylizedSource(sourceId);
  const publishedLodIndices = options.publishedLodIndices ?? source.lods.map((_lod, index) => index);
  if (
    publishedLodIndices.length === 0 ||
    publishedLodIndices.some(
      (lodIndex, index) =>
        !Number.isInteger(lodIndex) ||
        lodIndex < 0 ||
        lodIndex >= source.lods.length ||
        publishedLodIndices.indexOf(lodIndex) !== index
    )
  ) {
    throw new Error(`Stylized source ${sourceId} has invalid published LOD indices`);
  }
  const lods = [];
  for (const lodIndex of publishedLodIndices) {
    const sourceLod = source.lods[lodIndex];
    const sourceGlb = await readFile(join(stylizedModelDirectory, sourceLod.fileName));
    const optimizedSourceGlb =
      sourceId === "flower-1"
        ? buildGroundWindGlb(optimizeSeedWorldGroundDetail(parseGlb(sourceGlb), "flower-1"))
        : sourceGlb;
    let bakedGlb = bakeStylizedSourceTransform(optimizedSourceGlb);
    if (source.category === "flower") {
      bakedGlb = buildGroundWindGlb(bakeGroundWindWeights(parseGlb(bakedGlb), sourceLod.fileName, "flower"));
      requireGroundWindWeights(parseGlb(bakedGlb), 0, 0, `${sourceId}-lod${lodIndex}`, "flower");
    }
    const modelPath = `atoms/${outputSlug}-lod${lodIndex}.glb`;
    const modelUrl = await writeGeneratedResource(modelPath, "GLTF", bakedGlb, { keepMeshData: true });
    lods.push({
      prefabUrl: await writeAtomPrefab(`${outputSlug}-lod${lodIndex}`, modelUrl, materialUrl, {
        castShadows: source.category !== "grass" && source.category !== "flower",
        receiveShadows: true,
        enableVertexColor: sourceLod.vertexColorMode === "authored",
        primitiveIndex: 0
      })
    });
  }
  const bounds = stylizedEngineBounds(source.lods[0].bounds);
  const catalogCategory =
    source.category === "grass"
      ? "grass"
      : source.category === "flower"
        ? "flower"
        : source.category === "mushroom"
          ? "mushroom"
          : "rock";
  return {
    id: `cartoon/${catalogCategory}/${sourceId}/v1`,
    label: source.label,
    selectionWeight: 1,
    lods,
    defaultColorRgb: source.materials[0].baseColorFactor.slice(0, 3).map(linearChannelToSrgb8),
    defaultLodProfile: { metric: "instance-count", values: lods.map(() => 1) },
    lodGroup: {
      localReferencePoint: bounds.center,
      size: bounds.size,
      screenRelativeTransitionHeights: publishedLodIndices.map((lodIndex) => source.lods[lodIndex].screenRelativeHeight)
    }
  };
}

async function writeGrasslandsCliffSurfaceVariants(source, grassMaterialUrl, mudMaterialUrl, plainMaterialUrl) {
  const input = parseGlb(await readFile(join(smoothCliffModelDirectory, source.model)));
  const grassLods = [];
  const mudLods = [];
  const plainLods = [];
  for (let lodIndex = 0; lodIndex < source.lodMeshIndices.length; lodIndex++) {
    const modelPath = `atoms/${source.slug}-lod${lodIndex}.glb`;
    const modelUrl = await writeGeneratedResource(
      modelPath,
      "GLTF",
      extractPrimitiveGlb(input, source.lodMeshIndices[lodIndex], 0, `${source.label} LOD${lodIndex}`),
      { keepMeshData: true }
    );
    grassLods.push({
      prefabUrl: await writeAtomPrefab(`${source.slug}-grass-lod${lodIndex}`, modelUrl, grassMaterialUrl, {
        castShadows: true,
        receiveShadows: true
      })
    });
    mudLods.push({
      prefabUrl: await writeAtomPrefab(`${source.slug}-mud-lod${lodIndex}`, modelUrl, mudMaterialUrl, {
        castShadows: true,
        receiveShadows: true
      })
    });
    plainLods.push({
      prefabUrl: await writeAtomPrefab(`${source.slug}-plain-lod${lodIndex}`, modelUrl, plainMaterialUrl, {
        castShadows: true,
        receiveShadows: true
      })
    });
  }
  const shared = {
    id: source.atomId,
    label: source.label,
    selectionWeight: 1,
    defaultColorRgb: await validateSourceMaterial(source.material, "Terrain/Surface"),
    defaultLodProfile: { metric: "instance-count", values: grassLods.map(() => 1) },
    lodGroup: await loadSourceLodGroup(source.sourcePrefab, source.lodMeshIndices.length)
  };
  return {
    grass: { ...shared, lods: grassLods },
    mud: { ...shared, lods: mudLods },
    plain: { ...shared, lods: plainLods }
  };
}

function createSurfaceMaterial(name, baseTextureUrl, normalTextureUrl, metallicSmoothnessTextureUrl) {
  return {
    name,
    shader: "Terrain/Surface",
    shaderRef: { url: "Shader/Surface.shaderc" },
    shaderData: {
      material_BaseColor: { type: "Color", value: { r: 1, g: 1, b: 1, a: 0 } },
      material_Tiling: { type: "Float", value: 1 },
      material_Smoothness: { type: "Float", value: 1 },
      material_NormalScale: { type: "Float", value: 1 },
      material_BaseTexture: { type: "Texture", value: { url: baseTextureUrl } },
      material_NormalTexture: { type: "Texture", value: { url: normalTextureUrl } },
      material_Metallic: { type: "Float", value: 1 },
      material_SmoothnessSource: { type: "Float", value: 0 },
      material_OcclusionStrength: { type: "Float", value: 1 },
      material_MetallicSmoothnessTexture: { type: "Texture", value: { url: metallicSmoothnessTextureUrl } },
      material_LodDitherTexture: { type: "Texture", value: { url: "Texture/140c55bd97c21b9b.ktx2" } },
      material_LodDitherTextureInvSize: { type: "Float", value: 0.015625 }
    },
    macros: [
      { name: "MATERIAL_HAS_BASETEXTURE" },
      { name: "MATERIAL_HAS_METALLIC_SMOOTHNESS_TEXTURE" },
      { name: "MATERIAL_HAS_NORMALTEXTURE" }
    ]
  };
}

function createCliffRockMaterial(name, textureUrls) {
  return {
    name,
    shader: "Terrain/Surface",
    shaderRef: { url: "Shader/Surface.shaderc" },
    shaderData: {
      material_BaseColor: { type: "Color", value: { r: 1, g: 1, b: 1, a: 1 } },
      material_Tiling: { type: "Float", value: 1 },
      material_Metallic: { type: "Float", value: 0 },
      material_Smoothness: { type: "Float", value: 1 },
      material_SmoothnessSource: { type: "Float", value: 0 },
      material_OcclusionStrength: { type: "Float", value: 0.4 },
      material_MetallicSmoothnessTexture: { type: "Texture", value: { url: textureUrls.metallic } },
      material_OcclusionTexture: { type: "Texture", value: { url: textureUrls.occlusion } },
      material_LodDitherTexture: { type: "Texture", value: { url: "Texture/140c55bd97c21b9b.ktx2" } },
      material_LodDitherTextureInvSize: { type: "Float", value: 0.015625 }
    },
    macros: [{ name: "MATERIAL_HAS_METALLIC_SMOOTHNESS_TEXTURE" }, { name: "MATERIAL_HAS_OCCLUSION_TEXTURE" }]
  };
}

function createCliffRockCoverageMaterial(name, textureUrls, coverageBaseUrl, grassCoverage) {
  return {
    name,
    shader: "Terrain/Surface",
    shaderRef: { url: "Shader/Surface.shaderc" },
    shaderData: {
      material_BaseColor: { type: "Color", value: { r: 1, g: 1, b: 1, a: 1 } },
      material_Tiling: { type: "Float", value: 1 },
      material_Metallic: { type: "Float", value: 0 },
      material_Smoothness: { type: "Float", value: 1 },
      material_SmoothnessSource: { type: "Float", value: 0 },
      material_OcclusionStrength: { type: "Float", value: 0.4 },
      material_MetallicSmoothnessTexture: { type: "Texture", value: { url: textureUrls.metallic } },
      material_OcclusionTexture: { type: "Texture", value: { url: textureUrls.occlusion } },
      material_CoverageBaseTexture: { type: "Texture", value: { url: coverageBaseUrl } },
      material_CoverageColor: { type: "Color", value: { r: 1, g: 1, b: 1, a: 0 } },
      material_CoverageTiling: { type: "Float", value: 0.5 },
      material_CoverageNormalScale: { type: "Float", value: 0 },
      material_CoverageMetallic: { type: "Float", value: 0 },
      material_CoverageSmoothness: { type: "Float", value: 1 },
      material_CoverageSmoothnessSource: { type: "Float", value: 1 },
      material_CoverageOverlayMethod: { type: "Float", value: 0 },
      material_CoverageOffset: { type: "Float", value: 1.2 },
      material_CoverageBalance: { type: "Float", value: -2 },
      material_CoverageMaskContrast: { type: "Float", value: 1 },
      material_CoverageNormalBlending: { type: "Float", value: 1 },
      material_CoverageMaskTiling: { type: "Vector2", value: { x: 1, y: 1 } },
      material_LodDitherTexture: { type: "Texture", value: { url: "Texture/140c55bd97c21b9b.ktx2" } },
      material_LodDitherTextureInvSize: { type: "Float", value: 0.015625 }
    },
    macros: [
      { name: "MATERIAL_HAS_METALLIC_SMOOTHNESS_TEXTURE" },
      { name: "MATERIAL_HAS_OCCLUSION_TEXTURE" },
      { name: "MATERIAL_ENABLE_COVERAGE" },
      ...(grassCoverage
        ? [{ name: "MATERIAL_COVERAGE_SEASON_SPECIES", value: "TERRAIN_PROJECT_SEASON_SPECIES_GRASS" }]
        : []),
      { name: "MATERIAL_COVERAGE_USE_LOCAL_NORMAL" }
    ]
  };
}

function createStylizedVegetationMaterial(name, baseTextureUrl, normalTextureUrl, options) {
  const windEnabled = options.windEnabled !== false;
  return {
    name,
    shader: "Terrain/Vegetation",
    shaderRef: { url: "Shader/Vegetation.shaderc" },
    shaderData: {
      material_BaseColor: {
        type: "Color",
        value: { r: options.baseColor[0], g: options.baseColor[1], b: options.baseColor[2], a: options.baseColor[3] }
      },
      material_Tiling: { type: "Float", value: 1 },
      material_Smoothness: { type: "Float", value: options.smoothness },
      material_NormalScale: { type: "Float", value: options.normalScale },
      material_BaseTexture: { type: "Texture", value: { url: baseTextureUrl } },
      ...(normalTextureUrl ? { material_NormalTexture: { type: "Texture", value: { url: normalTextureUrl } } } : {}),
      material_AlphaCutoff: { type: "Float", value: options.alphaCutoff },
      material_LightingFlatness: { type: "Float", value: options.lightingFlatness },
      material_TranslucencyColor: { type: "Color", value: { r: 1, g: 1, b: 1, a: 1 } },
      material_TranslucencyIntensity: { type: "Float", value: options.translucencyIntensity },
      material_TranslucencyBacklightThreshold: {
        type: "Float",
        value: LEAF_TRANSMISSION_REFERENCE.backlightThreshold
      },
      material_TranslucencyNormalWrap: { type: "Float", value: LEAF_TRANSMISSION_REFERENCE.normalWrap },
      material_TranslucencyEnergyScale: { type: "Float", value: LEAF_TRANSMISSION_REFERENCE.energyScale },
      material_TranslucencyShadowStrength: {
        type: "Float",
        value: LEAF_TRANSMISSION_REFERENCE.shadowStrength
      },
      ...(windEnabled
        ? {
            material_WindForce: { type: "Float", value: 0.2 },
            material_WindWavesScale: { type: "Float", value: 0.75 },
            material_WindFlowDensity: { type: "Float", value: 1 },
            material_UVBaseLock: { type: "Float", value: 0 }
          }
        : {}),
      material_GrassDistanceFadeEnable: { type: "Float", value: options.distanceFadeEnabled === false ? 0 : 1 },
      material_GrassFadeDistance: { type: "Float", value: 90 },
      material_GrassFalloff: { type: "Float", value: 0.8 },
      material_LodDitherTexture: { type: "Texture", value: { url: "Texture/140c55bd97c21b9b.ktx2" } },
      material_LodDitherTextureInvSize: { type: "Float", value: 0.015625 }
    },
    macros: [
      ...(windEnabled ? [{ name: "MATERIAL_ENABLE_WIND" }] : []),
      { name: "MATERIAL_HAS_BASETEXTURE" },
      ...(normalTextureUrl ? [{ name: "MATERIAL_HAS_NORMALTEXTURE" }] : []),
      ...(options.translucencyIntensity > 0 ? [{ name: "MATERIAL_ENABLE_TRANSLUCENCY" }] : [])
    ]
  };
}

function createLotusMaterial(name, textureUrls, source, secondColor) {
  const material = createStylizedVegetationMaterial(name, textureUrls.albedo, textureUrls.normal, {
    baseColor: source.mainColorSrgb.map(srgbChannelToLinear).concat(1),
    alphaCutoff: source.alphaCutoff,
    lightingFlatness: 0,
    translucencyIntensity: 0,
    smoothness: source.smoothness,
    normalScale: source.normalScale,
    distanceFadeEnabled: false,
    windEnabled: false
  });
  material.shaderData.material_SecondColor = {
    type: "Color",
    value: colorValue(source.secondColorSrgb.map(srgbChannelToLinear).concat(1))
  };
  material.shaderData.material_SecondColorOffset = { type: "Float", value: secondColor.secondColorOffset };
  material.shaderData.material_SecondColorFade = { type: "Float", value: secondColor.secondColorFade };
  material.shaderData.material_SecondColorWorldNoiseScale = { type: "Float", value: 1 };
  material.macros.push({ name: "MATERIAL_ENABLE_SECOND_COLOR" });
  return material;
}

function colorValue([r, g, b, a]) {
  return { r, g, b, a };
}

function srgbChannelToLinear(channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function createStylizedRockCoverageMaterial(name, coverageBaseUrl, grassCoverage) {
  return {
    name,
    shader: "Terrain/Surface",
    shaderRef: { url: "Shader/Surface.shaderc" },
    shaderData: {
      material_BaseColor: {
        type: "Color",
        value: { r: 0.2702231281276218, g: 0.2702231281276218, b: 0.2702231281276218, a: 1 }
      },
      material_Tiling: { type: "Float", value: 1 },
      material_Metallic: { type: "Float", value: 0 },
      material_Smoothness: { type: "Float", value: 0.5 },
      material_SmoothnessSource: { type: "Float", value: 0 },
      material_OcclusionStrength: { type: "Float", value: 1 },
      material_CoverageBaseTexture: { type: "Texture", value: { url: coverageBaseUrl } },
      material_CoverageColor: { type: "Color", value: { r: 1, g: 1, b: 1, a: 1 } },
      material_CoverageTiling: { type: "Float", value: 0.5 },
      material_CoverageNormalScale: { type: "Float", value: 0 },
      material_CoverageMetallic: { type: "Float", value: 0 },
      material_CoverageSmoothness: { type: "Float", value: 0 },
      material_CoverageSmoothnessSource: { type: "Float", value: 0 },
      material_CoverageOverlayMethod: { type: "Float", value: 0 },
      material_CoverageOffset: { type: "Float", value: 1.2 },
      material_CoverageBalance: { type: "Float", value: -2 },
      material_CoverageMaskContrast: { type: "Float", value: 1 },
      material_CoverageNormalBlending: { type: "Float", value: 0 },
      material_CoverageMaskTiling: { type: "Vector2", value: { x: 1, y: 1 } },
      material_LodDitherTexture: { type: "Texture", value: { url: "Texture/140c55bd97c21b9b.ktx2" } },
      material_LodDitherTextureInvSize: { type: "Float", value: 0.015625 }
    },
    macros: [
      { name: "MATERIAL_ENABLE_COVERAGE" },
      ...(grassCoverage
        ? [{ name: "MATERIAL_COVERAGE_SEASON_SPECIES", value: "TERRAIN_PROJECT_SEASON_SPECIES_GRASS" }]
        : []),
      { name: "MATERIAL_ENABLE_COVERAGE_DETILING" }
    ]
  };
}

function createStylizedRockMaterial(name) {
  return {
    name,
    shader: "Terrain/Surface",
    shaderRef: { url: "Shader/Surface.shaderc" },
    shaderData: {
      material_BaseColor: {
        type: "Color",
        value: { r: 0.2702231281276218, g: 0.2702231281276218, b: 0.2702231281276218, a: 1 }
      },
      material_Tiling: { type: "Float", value: 1 },
      material_Metallic: { type: "Float", value: 0 },
      material_Smoothness: { type: "Float", value: 0.5 },
      material_SmoothnessSource: { type: "Float", value: 0 },
      material_OcclusionStrength: { type: "Float", value: 1 },
      material_LodDitherTexture: { type: "Texture", value: { url: "Texture/140c55bd97c21b9b.ktx2" } },
      material_LodDitherTextureInvSize: { type: "Float", value: 0.015625 }
    },
    macros: []
  };
}

async function validateSourceMaterial(relativePath, expectedShader) {
  const material = JSON.parse(await readFile(join(sourceMaterialDirectory, relativePath), "utf8"));
  if (material.shader !== expectedShader || typeof material.shaderRef?.url !== "string") {
    throw new Error(`Grasslands material "${relativePath}" must bind ${expectedShader} through a Project Shader ref`);
  }
  const color = material.shaderData?.material_BaseColor?.value;
  if (![color?.r, color?.g, color?.b].every((channel) => Number.isFinite(channel) && channel >= 0)) {
    throw new Error(`Grasslands material "${relativePath}" must declare a finite material_BaseColor`);
  }
  return [linearChannelToSrgb8(color.r), linearChannelToSrgb8(color.g), linearChannelToSrgb8(color.b)];
}

async function loadSourceLodGroup(prefabName, expectedLodCount) {
  const prefab = JSON.parse(await readFile(join(sourcePrototypeDirectory, prefabName), "utf8"));
  const lodGroup = prefab.components
    ?.map((component) => component?.props?.geometry)
    .find((geometry) => geometry?.kind === "lod-group")?.lodGroup;
  const heights = lodGroup?.lods?.map((lod) => lod.screenRelativeTransitionHeight);
  if (
    lodGroup?.fadeMode !== "CrossFade" ||
    lodGroup.animateCrossFading !== true ||
    !Array.isArray(lodGroup.localReferencePoint) ||
    lodGroup.localReferencePoint.length !== 3 ||
    !lodGroup.localReferencePoint.every(Number.isFinite) ||
    !Number.isFinite(lodGroup.size) ||
    lodGroup.size <= 0 ||
    !Array.isArray(heights) ||
    heights.length !== expectedLodCount ||
    !heights.every(
      (height, index) =>
        Number.isFinite(height) && height >= 0 && height <= 1 && (index === 0 || height < heights[index - 1])
    )
  ) {
    throw new Error(`Grasslands source Prefab "${prefabName}" has an invalid LODGroup`);
  }
  return {
    localReferencePoint: lodGroup.localReferencePoint,
    size: lodGroup.size,
    screenRelativeTransitionHeights: heights
  };
}

function linearChannelToSrgb8(channel) {
  const clamped = Math.min(1, channel);
  const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

function generatedVirtualPath(kind, relativePath) {
  return `AssetAssembly/Cartoon/${kind}/${relativePath}`;
}

async function writeGeneratedResource(relativePath, type, contents, params) {
  const virtualKinds = {
    GLTF: "Models",
    Prefab: "Prefabs",
    Texture: "Textures",
    KTX2: "Textures",
    Material: "Materials"
  };
  const virtualPrefixes = {
    GLTF: /$^/u,
    Prefab: /^prefabs\//u,
    Texture: /^textures\//u,
    KTX2: /^textures\//u,
    Material: /^materials\//u
  };
  const virtualPath = generatedVirtualPath(virtualKinds[type], relativePath.replace(virtualPrefixes[type], ""));
  if (generatedResources.some((resource) => resource.virtualPath === virtualPath)) {
    throw new Error(`Duplicate generated resource "${virtualPath}"`);
  }
  await writeFile(join(outputDirectory, relativePath), contents);
  generatedResources.push({ virtualPath, path: relativePath, type, ...(params ? { params } : {}) });
  return virtualPath;
}

async function writeAtomPrefab(slug, modelUrl, materialUrl, renderer) {
  const primitiveIndex = renderer.primitiveIndex ?? 0;
  const sourceTransform = renderer.sourceTransform ?? {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
  return writeStaticAtomPrefab(
    slug,
    modelUrl,
    [
      {
        entityName: `${slug}-renderer`,
        primitiveIndex,
        materialUrl,
        transform: sourceTransform,
        enableVertexColor: renderer.enableVertexColor === true
      }
    ],
    renderer
  );
}

async function writeMultiMaterialAtomPrefab(slug, modelUrl, materialUrls, renderer) {
  if (!Array.isArray(materialUrls) || materialUrls.length === 0) {
    throw new Error(`Multi-material atom ${slug} requires at least one material slot`);
  }
  return writeStaticAtomPrefab(
    slug,
    modelUrl,
    materialUrls.map((materialUrl, primitiveIndex) => ({
      entityName: `${slug}-renderer-${primitiveIndex}`,
      primitiveIndex,
      materialUrl,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      enableVertexColor: false
    })),
    renderer
  );
}

async function writeStaticAtomPrefab(slug, modelUrl, bindings, renderer) {
  const rendererCount = bindings.length;
  const refs = [
    ...bindings.map((binding) => ({ url: modelUrl, key: `meshes[0][${binding.primitiveIndex}]` })),
    ...bindings.map((binding) => ({ url: binding.materialUrl })),
    { url: "/Script/TerrainPrototypeMetadata.ts" }
  ];
  const entities = [
    {
      name: slug,
      children: bindings.map((_binding, index) => index + 1),
      components: [rendererCount]
    },
    ...bindings.map((binding, index) => ({
      name: binding.entityName,
      position: binding.transform.position,
      rotation: binding.transform.rotation,
      scale: binding.transform.scale,
      components: [index]
    }))
  ];
  const components = [
    ...bindings.map((binding, index) => ({
      type: "MeshRenderer",
      props: {
        mesh: { $ref: index },
        castShadows: renderer.castShadows,
        receiveShadows: renderer.receiveShadows,
        ...(binding.enableVertexColor ? { enableVertexColor: true } : {})
      },
      calls: [{ method: "setMaterial", args: [{ $ref: rendererCount + index }] }]
    })),
    {
      type: "Script",
      script: rendererCount * 2,
      props: {
        geometry: {
          kind: "renderers",
          renderers: bindings.map((_binding, index) => ({
            entityPath: [index],
            componentIndex: 0
          }))
        }
      }
    }
  ];
  return writeGeneratedResource(
    `prefabs/${slug}.prefab`,
    "Prefab",
    `${JSON.stringify({ version: "2.0", refs, entities, components, root: 0 })}\n`
  );
}

function requireStylizedSource(id) {
  const source = stylizedCatalog.sources.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`Stylized Environment catalog is missing source "${id}"`);
  return source;
}

function stylizedEngineBounds(bounds) {
  const minimum = [bounds.minimum[0], bounds.minimum[2], -bounds.maximum[1]];
  const maximum = [bounds.maximum[0], bounds.maximum[2], -bounds.minimum[1]];
  const center = minimum.map((value, index) => (value + maximum[index]) * 0.5);
  const size = Math.max(...minimum.map((value, index) => maximum[index] - value));
  return { minimum, maximum, center, size };
}

function bakeStylizedSourceTransform(glb) {
  const input = parseGlb(glb);
  const transformedAccessors = new Set();
  for (const mesh of input.json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const positionAccessorIndex = primitive.attributes?.POSITION;
      if (positionAccessorIndex !== undefined && !transformedAccessors.has(positionAccessorIndex)) {
        transformedAccessors.add(positionAccessorIndex);
        const outputBounds = {
          min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
          max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
        };
        transformFloatAccessor(input, positionAccessorIndex, (position) => {
          const transformed = [position[0] * 0.01, -position[2] * 0.01, position[1] * 0.01];
          expandBounds(outputBounds, transformed);
          return transformed;
        });
        input.json.accessors[positionAccessorIndex].min = outputBounds.min;
        input.json.accessors[positionAccessorIndex].max = outputBounds.max;
      }
      for (const attribute of ["NORMAL", "TANGENT"]) {
        const accessorIndex = primitive.attributes?.[attribute];
        if (accessorIndex === undefined || transformedAccessors.has(accessorIndex)) continue;
        transformedAccessors.add(accessorIndex);
        transformFloatAccessor(input, accessorIndex, (vector) => {
          const transformed = [vector[0], -vector[2], vector[1]];
          const length = Math.hypot(transformed[0], transformed[1], transformed[2]) || 1;
          const normalized = transformed.map((component) => component / length);
          return vector.length === 4 ? [...normalized, vector[3]] : normalized;
        });
        delete input.json.accessors[accessorIndex].min;
        delete input.json.accessors[accessorIndex].max;
      }
    }
  }
  for (const node of input.json.nodes ?? []) {
    delete node.matrix;
    delete node.translation;
    delete node.rotation;
    delete node.scale;
  }
  stripUnusedMaterialJson(input.json);
  return createGlb(input.json, Buffer.from(input.binary));
}

function stripUnusedGlbMaterials(glb) {
  const input = parseGlb(glb);
  stripUnusedMaterialJson(input.json);
  return createGlb(input.json, Buffer.from(input.binary));
}

function stripUnusedMaterialJson(json) {
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) delete primitive.material;
  }
  delete json.materials;
  delete json.textures;
  delete json.images;
  delete json.samplers;
  if (Array.isArray(json.extensionsUsed)) {
    json.extensionsUsed = json.extensionsUsed.filter((extension) => extension !== "KHR_texture_transform");
    if (json.extensionsUsed.length === 0) delete json.extensionsUsed;
  }
  if (Array.isArray(json.extensionsRequired)) {
    json.extensionsRequired = json.extensionsRequired.filter((extension) => extension !== "KHR_texture_transform");
    if (json.extensionsRequired.length === 0) delete json.extensionsRequired;
  }
}

async function loadGrasslandsWorldBounds() {
  const world = JSON.parse(await readFile(join(grasslandsPublicDirectory, "World/Terrain.world.json"), "utf8"));
  if (!Array.isArray(world.regions) || world.regions.length === 0) {
    throw new Error("Grasslands World does not define any physical Regions");
  }
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  let minimumAltitude = Number.POSITIVE_INFINITY;
  let maximumAltitude = Number.NEGATIVE_INFINITY;
  for (const region of world.regions) {
    const manifest = JSON.parse(await readFile(join(grasslandsPublicDirectory, region.manifest.url), "utf8"));
    const [x, y, z] = region.worldPosition;
    const [width, , depth] = region.worldSize;
    minimumX = Math.min(minimumX, x);
    maximumX = Math.max(maximumX, x + width);
    minimumZ = Math.min(minimumZ, z);
    maximumZ = Math.max(maximumZ, z + depth);
    minimumAltitude = Math.min(minimumAltitude, y + manifest.heightmap.minMetres);
    maximumAltitude = Math.max(maximumAltitude, y + manifest.heightmap.maxMetres);
  }
  return {
    width: maximumX - minimumX,
    depth: maximumZ - minimumZ,
    minimumAltitude,
    maximumAltitude
  };
}

function parseGlb(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "glTF" || buffer.readUInt32LE(4) !== 2) {
    throw new Error("Tree source must be a glTF 2.0 binary");
  }
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) throw new Error("Tree source GLB length is invalid");
  let json = null;
  let binary = null;
  for (let offset = 12; offset < buffer.length; ) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === GLB_JSON_CHUNK) json = JSON.parse(chunk.toString("utf8").replace(/[\0 ]+$/u, ""));
    if (type === GLB_BIN_CHUNK) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error("Tree source GLB must contain JSON and BIN chunks");
  return { json, binary };
}

function extractPrimitiveGlb(input, meshIndex, primitiveIndex, name) {
  const primitive = input.json.meshes?.[meshIndex]?.primitives?.[primitiveIndex];
  if (!primitive) throw new Error(`Tree source does not contain mesh ${meshIndex} primitive ${primitiveIndex}`);
  const sourceAccessorIndices = [...Object.values(primitive.attributes), primitive.indices].filter(Number.isInteger);
  const sourceBufferViewIndices = [
    ...new Set(sourceAccessorIndices.map((index) => input.json.accessors[index].bufferView))
  ];
  const chunks = [];
  const bufferViewMap = new Map();
  let byteOffset = 0;
  const bufferViews = sourceBufferViewIndices.map((sourceIndex, outputIndex) => {
    const source = input.json.bufferViews[sourceIndex];
    const bytes = input.binary.subarray(source.byteOffset ?? 0, (source.byteOffset ?? 0) + source.byteLength);
    const alignedOffset = align4(byteOffset);
    if (alignedOffset > byteOffset) chunks.push(Buffer.alloc(alignedOffset - byteOffset));
    chunks.push(bytes);
    byteOffset = alignedOffset + bytes.length;
    bufferViewMap.set(sourceIndex, outputIndex);
    return { ...source, buffer: 0, byteOffset: alignedOffset };
  });
  const accessorMap = new Map();
  const accessors = sourceAccessorIndices.map((sourceIndex, outputIndex) => {
    const source = input.json.accessors[sourceIndex];
    accessorMap.set(sourceIndex, outputIndex);
    return { ...source, bufferView: bufferViewMap.get(source.bufferView) };
  });
  const outputPrimitive = {
    attributes: Object.fromEntries(
      Object.entries(primitive.attributes).map(([attribute, accessor]) => [attribute, accessorMap.get(accessor)])
    ),
    indices: accessorMap.get(primitive.indices),
    ...(primitive.mode === undefined ? {} : { mode: primitive.mode })
  };
  const binary = Buffer.concat(chunks);
  return createGlb(
    {
      asset: { version: "2.0", generator: "Galacean Tree Assembly offline extractor" },
      buffers: [{ byteLength: binary.length }],
      bufferViews,
      accessors,
      meshes: [{ name, primitives: [outputPrimitive] }],
      nodes: [{ name, mesh: 0 }],
      scenes: [{ name: "Scene", nodes: [0] }],
      scene: 0
    },
    binary
  );
}

/**
 * Asset Assembly is a derived-asset boundary: a ground receiver is invalid unless both the
 * mechanical coordinate and the renderer-side vertex-color capability survive extraction.
 * Failing generation here prevents Seed World from silently falling back to a rigid whole-atom
 * rotation when the source pipeline is run in the wrong order.
 */
function requireGroundWindWeights(input, meshIndex, primitiveIndex, name, kind) {
  const primitive = input.json.meshes?.[meshIndex]?.primitives?.[primitiveIndex];
  const positionAccessor = input.json.accessors?.[primitive?.attributes?.POSITION];
  const colorAccessorIndex = primitive?.attributes?.COLOR_0;
  const colorAccessor = input.json.accessors?.[colorAccessorIndex];
  if (
    !positionAccessor ||
    !Number.isInteger(colorAccessorIndex) ||
    !colorAccessor ||
    colorAccessor.componentType !== UNSIGNED_SHORT ||
    colorAccessor.normalized !== true ||
    colorAccessor.type !== "VEC4" ||
    colorAccessor.count !== positionAccessor.count ||
    colorAccessor.sparse
  ) {
    throw new Error(`Ground vegetation "${name}" requires normalized UNSIGNED_SHORT VEC4 COLOR_0 wind weights`);
  }
  const red = readAccessor(input, colorAccessorIndex).map((value) => value[0]);
  if (kind === "flower" && red.some((weight) => weight !== 65535)) {
    throw new Error(`Ground flower "${name}" must use one rigid instance-root wind weight`);
  }
  if (kind !== "flower" && (Math.min(...red) !== 0 || Math.max(...red) !== 65535)) {
    throw new Error(`Ground vegetation "${name}" wind weights must span a pinned root and fully compliant tip`);
  }
}

function transformFloatAccessor(input, accessorIndex, transform) {
  const accessor = input.json.accessors[accessorIndex];
  const view = input.json.bufferViews[accessor.bufferView];
  if (accessor.sparse || accessor.componentType !== 5126) {
    throw new Error("Asset transforms require dense Float32 accessors");
  }
  const components = accessorComponents(accessor.type);
  const stride = view.byteStride ?? Float32Array.BYTES_PER_ELEMENT * components;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let index = 0; index < accessor.count; index++) {
    const offset = base + index * stride;
    const source = Array.from({ length: components }, (_, component) =>
      input.binary.readFloatLE(offset + component * Float32Array.BYTES_PER_ELEMENT)
    );
    const output = transform(source);
    if (output.length !== components) throw new Error("Asset transform changed accessor arity");
    output.forEach((component, componentIndex) =>
      input.binary.writeFloatLE(component, offset + componentIndex * Float32Array.BYTES_PER_ELEMENT)
    );
  }
}

function extractCardLayout(input, sourceId, meshIndex, primitiveIndex) {
  const primitive = input.json.meshes?.[meshIndex]?.primitives?.[primitiveIndex];
  if (
    !primitive?.indices ||
    primitive.attributes?.POSITION === undefined ||
    primitive.attributes?.TEXCOORD_0 === undefined
  ) {
    throw new Error(`Tree source "${sourceId}" does not expose indexed foliage positions and UVs`);
  }
  const positions = readAccessor(input, primitive.attributes.POSITION);
  const uvs = readAccessor(input, primitive.attributes.TEXCOORD_0);
  const indices = readAccessor(input, primitive.indices).flat();
  if (indices.length % 6 !== 0) throw new Error(`Tree source "${sourceId}" foliage is not a card list`);
  const records = [];
  const bounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  };
  for (let offset = 0, cardIndex = 0; offset < indices.length; offset += 6, cardIndex++) {
    const vertexIndices = [...new Set(indices.slice(offset, offset + 6))];
    if (vertexIndices.length !== 4)
      throw new Error(`Tree source "${sourceId}" foliage card ${cardIndex} is not a quad`);
    const corners = new Map();
    for (const vertexIndex of vertexIndices) {
      const uv = uvs[vertexIndex];
      const key = `${Number(uv[0] >= 0.5)}:${Number(uv[1] >= 0.5)}`;
      if (corners.has(key)) throw new Error(`Tree source "${sourceId}" foliage card ${cardIndex} has ambiguous UVs`);
      corners.set(key, positions[vertexIndex]);
    }
    const p00 = requireCorner(corners, "0:0", sourceId, cardIndex);
    const p10 = requireCorner(corners, "1:0", sourceId, cardIndex);
    const p01 = requireCorner(corners, "0:1", sourceId, cardIndex);
    const p11 = requireCorner(corners, "1:1", sourceId, cardIndex);
    const sourceCorners = [p00, p10, p01, p11];
    const center = [0, 1, 2].map(
      (axis) => sourceCorners.reduce((sum, point) => sum + point[axis], 0) / sourceCorners.length
    );
    records.push({
      stableOrder: stableRank(`${sourceId}:${cardIndex}`),
      center,
      corners: sourceCorners
    });
    for (const point of sourceCorners) expandBounds(bounds, point);
  }
  const spatialOrder = spatiallyRankCards(records, bounds);
  return {
    records: spatialOrder.flatMap((record, index) => {
      const rank = spatialOrder.length === 1 ? 0 : index / (spatialOrder.length - 1);
      const [p00, p10, p01, p11] = record.corners;
      const heightRange = Math.max(bounds.max[1] - bounds.min[1], Number.EPSILON);
      const normalizedHeight = Math.min(1, Math.max(0, (record.center[1] - bounds.min[1]) / heightRange));
      const smoothHeight = normalizedHeight * normalizedHeight * (3 - 2 * normalizedHeight);
      const bendWeight = 0.18 + smoothHeight * 0.82;
      const flutterWeight = 0.72 + normalizedHeight * 0.28;
      const phase = record.stableOrder;
      // Four W channels form the structured wind contract: stable LOD rank,
      // branch bend weight, leaf flutter weight, and deterministic leaf phase.
      return [...p00, rank, ...p10, bendWeight, ...p01, flutterWeight, ...p11, phase];
    }),
    centers: spatialOrder.map((record) => record.center),
    bounds
  };
}

function evaluateProceduralTreeCandidate(source, authoredLayouts) {
  const candidate = generateProceduralTreeSkeleton(source);
  const lodRetainedRatios = [1, 0.62, 0.28];
  const branchRetainedRatios = [1, 0.56, 0.24];
  const perLod = authoredLayouts.map((authored, lodIndex) => {
    const ordered = spatiallyRankPoints(candidate.leafAnchors, authored.bounds, `${source.id}:lod${lodIndex}`);
    const retainedCount = Math.max(1, Math.round(ordered.length * lodRetainedRatios[lodIndex]));
    const retained = ordered.slice(0, retainedCount);
    const views = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((yawRadians) =>
      compareProjectedCoverage(authored.centers, retained, yawRadians)
    );
    const branchSegments = Math.max(1, Math.round(candidate.branchSegments * branchRetainedRatios[lodIndex]));
    const triangleRatio = (retained.length * 2 + branchSegments * 8) / Math.max(1, authored.centers.length * 2);
    const retainedDensity = retained.length / Math.max(1, candidate.leafAnchors.length);
    const sizeCompensation = Math.min(1.3, 1 / Math.sqrt(retainedDensity));
    const transitionCoverageFloor = Math.min(
      1,
      (retained.length * sizeCompensation ** 2) / Math.max(1, authored.centers.length)
    );
    const maxCrownExtentErrorPercent = Math.max(...views.map((view) => view.crownExtentErrorPercent));
    const maxSpatialOccupancyErrorPercent = Math.max(...views.map((view) => view.spatialOccupancyErrorPercent));
    return {
      lod: lodIndex,
      candidateLeafCount: retained.length,
      authoredLeafCount: authored.centers.length,
      branchSegments,
      maxCrownExtentErrorPercent: roundMetric(maxCrownExtentErrorPercent),
      maxSpatialOccupancyErrorPercent: roundMetric(maxSpatialOccupancyErrorPercent),
      triangleRatio: roundMetric(triangleRatio),
      transitionCoverageFloor: roundMetric(transitionCoverageFloor),
      passed:
        maxCrownExtentErrorPercent <= 10 &&
        maxSpatialOccupancyErrorPercent <= 15 &&
        triangleRatio <= 1.1 &&
        transitionCoverageFloor >= 0.9
    };
  });
  const failedMetrics = new Set();
  for (const lod of perLod) {
    if (lod.maxCrownExtentErrorPercent > 10) failedMetrics.add("crown-extent");
    if (lod.maxSpatialOccupancyErrorPercent > 15) failedMetrics.add("spatial-occupancy");
    if (lod.triangleRatio > 1.1) failedMetrics.add("triangle-budget");
    if (lod.transitionCoverageFloor < 0.9) failedMetrics.add("transition-coverage");
  }
  return {
    status: perLod.every((lod) => lod.passed) ? "passed" : "failed",
    generator: "hierarchical-skeleton-v1",
    evaluatedViews: 3,
    candidateLeafCount: candidate.leafAnchors.length,
    authoredLeafCount: authoredLayouts[0].centers.length,
    retainedRatio: roundMetric(candidate.leafAnchors.length / authoredLayouts[0].centers.length),
    perLod,
    failedMetrics: [...failedMetrics]
  };
}

function generateProceduralTreeSkeleton(source) {
  const random = deterministicRandom(source.id);
  const isBirch = source.slug.startsWith("birch");
  const height = source.size;
  const primaryCount = isBirch ? 14 : 16;
  const trunkSamples = Array.from({ length: 10 }, (_, index) => {
    const t = index / 9;
    return [
      Math.sin(t * Math.PI * 1.35 + random() * 0.2) * height * 0.018 * t,
      height * t,
      Math.cos(t * Math.PI * 1.1 + random() * 0.2) * height * 0.014 * t
    ];
  });
  const leafAnchors = [];
  let branchSegments = trunkSamples.length - 1;
  for (let primaryIndex = 0; primaryIndex < primaryCount; primaryIndex++) {
    const attachT = 0.27 + (primaryIndex / Math.max(1, primaryCount - 1)) * 0.58;
    const trunkIndex = Math.min(trunkSamples.length - 2, Math.floor(attachT * (trunkSamples.length - 1)));
    const start = lerp3(trunkSamples[trunkIndex], trunkSamples[trunkIndex + 1], attachT * 9 - trunkIndex);
    const parentTangent = normalize3(sub3(trunkSamples[trunkIndex + 1], trunkSamples[trunkIndex]));
    const phyllotaxy = primaryIndex * 2.3999632297 + (random() - 0.5) * 0.26;
    const radial = [Math.cos(phyllotaxy), 0, Math.sin(phyllotaxy)];
    const branchAngle = (isBirch ? 0.72 : 0.94) + (random() - 0.5) * 0.22;
    const direction = normalize3(
      add3(scale3(parentTangent, Math.cos(branchAngle)), scale3(radial, Math.sin(branchAngle)))
    );
    const crownFactor = Math.sin(Math.PI * Math.min(1, (attachT - 0.2) / 0.75));
    const primaryLength = height * (isBirch ? 0.24 : 0.31) * (0.72 + crownFactor * 0.36) * (0.9 + random() * 0.2);
    const primaryEnd = bendBranch(start, direction, primaryLength, isBirch ? 0.1 : 0.16, 0.08);
    branchSegments += 4;
    for (let secondaryIndex = 0; secondaryIndex < 3; secondaryIndex++) {
      const secondaryStart = lerp3(start, primaryEnd, 0.36 + secondaryIndex * 0.22);
      const secondaryPhase = phyllotaxy + (secondaryIndex - 1) * 1.15 + (random() - 0.5) * 0.35;
      const secondaryRadial = [Math.cos(secondaryPhase), 0.18 + random() * 0.22, Math.sin(secondaryPhase)];
      const secondaryDirection = normalize3(add3(scale3(direction, 0.56), scale3(secondaryRadial, 0.64)));
      const secondaryLength = primaryLength * (0.42 + random() * 0.16);
      const secondaryEnd = bendBranch(secondaryStart, secondaryDirection, secondaryLength, 0.18, 0.12);
      branchSegments += 3;
      for (let twigIndex = 0; twigIndex < 2; twigIndex++) {
        const twigStart = lerp3(secondaryStart, secondaryEnd, 0.5 + twigIndex * 0.32);
        const twigPhase = secondaryPhase + (twigIndex === 0 ? -0.82 : 0.82) + (random() - 0.5) * 0.3;
        const twigDirection = normalize3(
          add3(scale3(secondaryDirection, 0.58), [Math.cos(twigPhase) * 0.48, 0.32, Math.sin(twigPhase) * 0.48])
        );
        const twigLength = secondaryLength * (0.34 + random() * 0.16);
        const twigEnd = bendBranch(twigStart, twigDirection, twigLength, 0.22, 0.16);
        branchSegments += 2;
        for (let leafIndex = 0; leafIndex < 5; leafIndex++) {
          const leafT = 0.18 + leafIndex * 0.18;
          const anchor = lerp3(twigStart, twigEnd, leafT);
          const jitter = height * 0.008;
          const varied = [
            anchor[0] + (random() - 0.5) * jitter,
            anchor[1] + (random() - 0.5) * jitter,
            anchor[2] + (random() - 0.5) * jitter
          ];
          if (varied[1] >= height * 0.18 && varied[1] <= height * 1.04) leafAnchors.push(varied);
        }
      }
    }
  }
  return { trunkSamples, leafAnchors, branchSegments };
}

function compareProjectedCoverage(authored, candidate, yawRadians) {
  const authoredProjected = authored.map((point) => projectTreePoint(point, yawRadians));
  const candidateProjected = candidate.map((point) => projectTreePoint(point, yawRadians));
  const authoredBounds = bounds2(authoredProjected);
  const candidateBounds = bounds2(candidateProjected);
  const authoredWidth = Math.max(Number.EPSILON, authoredBounds.max[0] - authoredBounds.min[0]);
  const authoredHeight = Math.max(Number.EPSILON, authoredBounds.max[1] - authoredBounds.min[1]);
  const candidateWidth = candidateBounds.max[0] - candidateBounds.min[0];
  const candidateHeight = candidateBounds.max[1] - candidateBounds.min[1];
  const crownExtentErrorPercent =
    Math.max(Math.abs(candidateWidth / authoredWidth - 1), Math.abs(candidateHeight / authoredHeight - 1)) * 100;
  const authoredOccupancy = occupiedGridCells(authoredProjected, authoredBounds, 8);
  const candidateOccupancy = occupiedGridCells(candidateProjected, authoredBounds, 8);
  const spatialOccupancyErrorPercent =
    (symmetricDifferenceSize(authoredOccupancy, candidateOccupancy) / Math.max(1, authoredOccupancy.size)) * 100;
  return { crownExtentErrorPercent, spatialOccupancyErrorPercent };
}

function spatiallyRankPoints(points, bounds, salt) {
  const records = points.map((center, index) => ({ center, stableOrder: stableRank(`${salt}:${index}`) }));
  return spatiallyRankCards(records, bounds).map((record) => record.center);
}

function projectTreePoint(point, yawRadians) {
  return [point[0] * Math.cos(yawRadians) - point[2] * Math.sin(yawRadians), point[1]];
}

function bounds2(points) {
  const bounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  };
  for (const point of points) {
    for (let axis = 0; axis < 2; axis++) {
      bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
    }
  }
  return bounds;
}

function occupiedGridCells(points, bounds, gridSize) {
  const cells = new Set();
  for (const point of points) {
    const cell = point.map((value, axis) => {
      const extent = Math.max(Number.EPSILON, bounds.max[axis] - bounds.min[axis]);
      return Math.max(0, Math.min(gridSize - 1, Math.floor(((value - bounds.min[axis]) / extent) * gridSize)));
    });
    cells.add(`${cell[0]}:${cell[1]}`);
  }
  return cells;
}

function symmetricDifferenceSize(first, second) {
  let count = 0;
  for (const value of first) if (!second.has(value)) count++;
  for (const value of second) if (!first.has(value)) count++;
  return count;
}

function bendBranch(start, direction, length, gravity, phototropism) {
  return add3(start, scale3(normalize3(add3(direction, [0, phototropism - gravity, 0])), length));
}

function lerp3(first, second, t) {
  return [
    first[0] + (second[0] - first[0]) * t,
    first[1] + (second[1] - first[1]) * t,
    first[2] + (second[2] - first[2]) * t
  ];
}

function add3(first, second) {
  return [first[0] + second[0], first[1] + second[1], first[2] + second[2]];
}

function sub3(first, second) {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
}

function scale3(value, scalar) {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function normalize3(value) {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return scale3(value, 1 / length);
}

function deterministicRandom(value) {
  let state = stableHash(value);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let random = Math.imul(state ^ (state >>> 15), 1 | state);
    random ^= random + Math.imul(random ^ (random >>> 7), 61 | random);
    return ((random ^ (random >>> 14)) >>> 0) / 4294967296;
  };
}

function roundMetric(value) {
  return Number(value.toFixed(6));
}

function spatiallyRankCards(records, bounds) {
  const gridSize = [8, 4, 8];
  const groups = new Map();
  for (const record of records) {
    const cell = record.center.map((value, axis) => {
      const extent = Math.max(bounds.max[axis] - bounds.min[axis], Number.EPSILON);
      return Math.min(gridSize[axis] - 1, Math.floor(((value - bounds.min[axis]) / extent) * gridSize[axis]));
    });
    const key = `${cell[0]}:${cell[1]}:${cell[2]}`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  const spatialGroups = [...groups.entries()]
    .sort(([first], [second]) => stableRank(first) - stableRank(second))
    .map(([, group]) => group.sort((first, second) => first.stableOrder - second.stableOrder));
  const ordered = [];
  for (let depth = 0; ordered.length < records.length; depth++) {
    for (const group of spatialGroups) {
      if (depth < group.length) ordered.push(group[depth]);
    }
  }
  return ordered;
}

function readAccessor(input, accessorIndex) {
  const accessor = input.json.accessors[accessorIndex];
  if (accessor.sparse) throw new Error("Sparse tree accessors are unsupported");
  const view = input.json.bufferViews[accessor.bufferView];
  const component = componentType(accessor.componentType);
  const components = accessorComponents(accessor.type);
  const stride = view.byteStride ?? component.bytes * components;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let index = 0; index < accessor.count; index++) {
    const tuple = [];
    for (let componentIndex = 0; componentIndex < components; componentIndex++) {
      tuple.push(input.binary[component.read](base + index * stride + componentIndex * component.bytes));
    }
    values.push(tuple);
  }
  return values;
}

function componentType(type) {
  switch (type) {
    case 5121:
      return { bytes: 1, read: "readUInt8" };
    case 5123:
      return { bytes: 2, read: "readUInt16LE" };
    case 5125:
      return { bytes: 4, read: "readUInt32LE" };
    case 5126:
      return { bytes: 4, read: "readFloatLE" };
    default:
      throw new Error(`Unsupported tree accessor component type ${type}`);
  }
}

function accessorComponents(type) {
  switch (type) {
    case "SCALAR":
      return 1;
    case "VEC2":
      return 2;
    case "VEC3":
      return 3;
    case "VEC4":
      return 4;
    default:
      throw new Error(`Unsupported tree accessor shape ${type}`);
  }
}

function createGlb(json, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const paddedJsonLength = align4(jsonBytes.length);
  const paddedBinaryLength = align4(binary.length);
  const totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinaryLength;
  const output = Buffer.alloc(totalLength);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(paddedJsonLength, 12);
  output.writeUInt32LE(GLB_JSON_CHUNK, 16);
  jsonBytes.copy(output, 20);
  output.fill(0x20, 20 + jsonBytes.length, 20 + paddedJsonLength);
  const binaryHeader = 20 + paddedJsonLength;
  output.writeUInt32LE(paddedBinaryLength, binaryHeader);
  output.writeUInt32LE(GLB_BIN_CHUNK, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return output;
}

function requireCorner(corners, key, sourceId, cardIndex) {
  const value = corners.get(key);
  if (!value) throw new Error(`Tree source "${sourceId}" foliage card ${cardIndex} does not cover every UV corner`);
  return value;
}

function expandBounds(bounds, point) {
  for (let axis = 0; axis < 3; axis++) {
    bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
  }
}

function stableRank(value) {
  return stableHash(value) / 0x100000000;
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function align4(value) {
  return (value + 3) & ~3;
}
