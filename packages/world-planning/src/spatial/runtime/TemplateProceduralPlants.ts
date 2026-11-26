import {
  AssetType,
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  Color,
  Matrix,
  MeshRenderer,
  Quaternion,
  RenderFace,
  Script,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode,
  Vector2,
  Vector3,
  Vector4,
  type Camera,
  type Engine,
  type Entity,
  type Material,
  type ModelMesh,
  type PBRMaterial
} from "@galacean/engine";
import { createSurfaceMaterial } from "@galacean/engine-terrain/surface/SurfaceMaterial";
import { decodePlantParameters } from "@galacean/engine-vegetation/asset-assembly/PlantParameterEncoding";
import { PLANT_SPECIES_CATALOG } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import bushStructureJson from "@galacean/engine-vegetation/asset-assembly/generated/procedural-trees/meadow-sm_birchbush_03-structure.json";
import flowerStructureJson from "@galacean/engine-vegetation/asset-assembly/generated/procedural-trees/meadow-sm_flower_06_02-structure.json";
import grassStructureJson from "@galacean/engine-vegetation/asset-assembly/generated/procedural-trees/meadow-sm_grass_02_01-prototype-structure.json";
import plumeStructureJson from "@galacean/engine-vegetation/asset-assembly/generated/procedural-trees/meadow-sm_flower_09_01-prototype-structure.json";
import type {
  PlantGeometryInstance,
  ProceduralPlantAsset
} from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantAsset";
import {
  attachPlantCanopyOpticalDepth,
  buildProceduralPlantGeometry,
  mergePlantGeometryByMaterial,
  type PlantPartMesh,
  type PlantPoint
} from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantGeometry";
import { uploadProceduralPlantGeometry } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantMeshes";
import {
  configureProceduralLeafMaterial,
  configureProceduralPlantWindMaterial,
  expandProceduralTreeWindBounds
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyRuntime";
import {
  createDefaultProceduralTreeDistributionTuning,
  createProceduralTreeFoliageGeometryTuning,
  createProceduralTreeMeshesForLods,
  type ProceduralTreeSource
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeGenerator";
import {
  createTreeAssemblyInstanceStorage,
  createTreeAssemblyInstancedMesh,
  TREE_ASSEMBLY_LOD_FADE_FLOAT_OFFSET,
  uploadTreeAssemblyInstanceRange,
  uploadTreeAssemblyInstances,
  type TreeAssemblyInstancedMesh
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyInstancedMesh";
import { DEAD_TREE_ASSET_ID } from "@galacean/engine-vegetation/asset-assembly/TreeSpeciesCatalog";
import { TREE_SPECIES_LOD_POLICIES } from "@galacean/engine-vegetation/asset-assembly/TreeSpeciesLodPolicy";
import { TREE_SPECIES_MATERIAL_RESOURCES } from "@galacean/engine-vegetation/asset-assembly/TreeSpeciesMaterialResources";
import { TREE_SPECIES_PARAMETERS } from "@galacean/engine-vegetation/asset-assembly/TreeSpeciesParameters";
import { TREE_STRUCTURE as DEAD_TREE_STRUCTURE } from "@galacean/engine-vegetation/asset-assembly/TreeStructureDeadTree";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { templateLinearColor } from "../WorldTemplateCatalog";

import type { TemplatePlantPlacement, TemplateProceduralPlantKind } from "../WorldTemplateVegetation";
export type { TemplateProceduralPlantInstance, TemplateProceduralPlantKind } from "../WorldTemplateVegetation";
import type { VegetationColors } from "../VegetationColors";
import type { SeedWorldPickBatch, SeedWorldPickVisitor } from "@galacean/engine-project/rendering/SeedWorldPickBatch";

export interface TemplateProceduralPlantResources {
  readonly bushAsset?: ProceduralPlantAsset;
  readonly flowerAsset?: ProceduralPlantAsset;
  readonly grassAsset?: ProceduralPlantAsset;
  readonly plumeAsset?: ProceduralPlantAsset;
  readonly textures: Readonly<Record<string, Texture2D>>;
  readonly deadBarkAlbedo?: Texture2D;
  readonly deadBarkNormal?: Texture2D;
}

type PlantColorways = readonly PlantPoint[];
const hexPalette = (...hexes: readonly string[]): PlantColorways => hexes.map((h) => templateLinearColor(h));

const PROCEDURAL_PALETTE: Record<TemplateProceduralPlantKind, Record<string, PlantColorways>> = {
  "dead-wood": { bark: hexPalette("#bfa286", "#ae9176", "#9a7d64") },
  "dry-grass": { foliage: hexPalette("#e4b86e", "#efca84", "#d6a45c", "#e9c27a") },
  "plume-grass": {
    foliage: hexPalette("#ddb066", "#cda058", "#e8be78"),
    plume: hexPalette("#f7dfae", "#eed29a", "#fbeaC2")
  },
  "desert-shrub": {
    bark: hexPalette("#c2b29c", "#cdc0aa", "#b5a58e"),
    foliage: hexPalette("#b6c2a8", "#a8b69a", "#c2ccb6", "#9dac90")
  },
  "pastel-flower": {
    foliage: hexPalette("#94a678", "#86986a", "#a2b286"),
    petals: hexPalette("#d8b0fa", "#f4bae8", "#c8a0f4", "#ecd2fc"),
    petalsAlt: hexPalette("#e4bcf8", "#f6c6ec", "#d2acf6", "#f0d8fc")
  },
  "meadow-flower": {
    foliage: hexPalette("#4b8e20", "#5aa129", "#3f7d1b"),
    petals: hexPalette("#ffffff", "#fffdf0", "#f8fbff", "#fff9e0"),
    petalsAlt: hexPalette("#fffbe8", "#ffffff", "#fff6d6", "#f6faff")
  }
};

const SLOT_TEXTURES: Partial<
  Record<
    Exclude<TemplateProceduralPlantKind, "dead-wood">,
    Readonly<Record<string, { textureKey: string; alphaCutoff: number; textureBlend: number; repeatU?: boolean }>>
  >
> = {
  "desert-shrub": {
    bark: { textureKey: "bark", alphaCutoff: 0, textureBlend: 0.35, repeatU: true },
    foliage: { textureKey: "shrubLeaf", alphaCutoff: 0.28, textureBlend: 0.28 }
  },
  "pastel-flower": {
    foliage: { textureKey: "grassBlade", alphaCutoff: 0.22, textureBlend: 0.2 },
    petals: { textureKey: "flowerBlossom", alphaCutoff: 0.16, textureBlend: 0.32 },
    petalsAlt: { textureKey: "flowerPetal", alphaCutoff: 0.16, textureBlend: 0.32 }
  },
  "meadow-flower": {
    foliage: { textureKey: "grassBlade", alphaCutoff: 0.22, textureBlend: 0.18 },
    petals: { textureKey: "flowerBlossom", alphaCutoff: 0.18, textureBlend: 0.16 },
    petalsAlt: { textureKey: "flowerPetal", alphaCutoff: 0.18, textureBlend: 0.16 }
  },
  "dry-grass": {
    foliage: { textureKey: "grassBlade", alphaCutoff: 0.24, textureBlend: 0.24 }
  },
  "plume-grass": {
    foliage: { textureKey: "grassBlade", alphaCutoff: 0.24, textureBlend: 0.24 },
    plume: { textureKey: "plumeSpray", alphaCutoff: 0.2, textureBlend: 0.26 }
  }
};

type CachedEnginePlantState = {
  textures: Map<string, Promise<Texture2D>>;
  optionalTextures: Map<string, Promise<Texture2D | undefined>>;
};
const cachedEngineStates = new WeakMap<Engine, CachedEnginePlantState>();
let decodedBushAsset: ProceduralPlantAsset | undefined;
let decodedFlowerAsset: ProceduralPlantAsset | undefined;
let decodedGrassAsset: ProceduralPlantAsset | undefined;
let decodedPlumeAsset: ProceduralPlantAsset | undefined;

const ALL_TEMPLATE_PLANT_KINDS: readonly TemplateProceduralPlantKind[] = [
  "dead-wood",
  "dry-grass",
  "plume-grass",
  "desert-shrub",
  "pastel-flower",
  "meadow-flower"
];

// Use static literal URLs so Vite bundles and rewrites every texture for subpath/CDN deployments.
const TEXTURE_FILES: Readonly<Record<string, { url: string; repeatU?: boolean }>> = {
  bark: {
    url: new URL(
      "../../../../vegetation/src/asset-assembly/generated/procedural-trees/meadow-birch-bark-256.png",
      import.meta.url
    ).href,
    repeatU: true
  },
  shrubLeaf: {
    url: new URL(
      "../../../../vegetation/src/asset-assembly/generated/procedural-trees/meadow-birchtree_leaf_01_summer-part-01-256.png",
      import.meta.url
    ).href
  },
  flowerBlossom: {
    url: new URL(
      "../../../../vegetation/src/asset-assembly/generated/procedural-trees/meadow-flowers_01-part-01-256.png",
      import.meta.url
    ).href
  },
  flowerPetal: {
    url: new URL(
      "../../../../vegetation/src/asset-assembly/generated/procedural-trees/meadow-flowers_02-part-05-256.png",
      import.meta.url
    ).href
  },
  grassBlade: {
    url: new URL(
      "../../../../vegetation/src/asset-assembly/generated/procedural-trees/meadow-grass_02_summer-part-01-256.png",
      import.meta.url
    ).href
  },
  plumeSpray: {
    url: new URL(
      "../../../../vegetation/src/asset-assembly/generated/procedural-trees/meadow-flowers_03-part-01-256.png",
      import.meta.url
    ).href
  }
};

/** Preloads reconstructed production plant structures and alpha-cutout textures incrementally on demand per Engine. */
export async function preloadTemplateProceduralPlantResources(
  engine: Engine,
  kinds?: Iterable<TemplateProceduralPlantKind>
): Promise<TemplateProceduralPlantResources> {
  let state = cachedEngineStates.get(engine);
  if (!state) {
    state = { textures: new Map(), optionalTextures: new Map() };
    cachedEngineStates.set(engine, state);
  }
  const activeKinds = new Set(kinds ?? ALL_TEMPLATE_PLANT_KINDS);
  const neededTextureKeys = new Set<string>();
  for (const kind of activeKinds) {
    if (kind === "dead-wood") continue;
    for (const slot of Object.values(SLOT_TEXTURES[kind] ?? {})) {
      neededTextureKeys.add(slot.textureKey);
    }
  }

  const loadTex = (key: string) => {
    let pending = state!.textures.get(key);
    if (!pending) {
      const desc = TEXTURE_FILES[key]!;
      pending = engine.resourceManager.load<Texture2D>({
        type: AssetType.Texture,
        url: desc.url,
        params: {
          isSRGBColorSpace: true,
          mipmap: true,
          filterMode: TextureFilterMode.Trilinear,
          wrapModeU: desc.repeatU ? TextureWrapMode.Repeat : TextureWrapMode.Clamp,
          wrapModeV: TextureWrapMode.Clamp,
          anisoLevel: 8
        }
      });
      state!.textures.set(key, pending);
    }
    return pending;
  };

  const loadOptionalTex = (key: string, url: string | undefined) => {
    if (!url) return Promise.resolve(undefined);
    let pending = state!.optionalTextures.get(key);
    if (!pending) {
      pending = engine.resourceManager
        .load<Texture2D>({ type: AssetType.Texture, url })
        .then((tex) => (tex instanceof Texture2D ? tex : undefined))
        .catch(() => undefined);
      state!.optionalTextures.set(key, pending);
    }
    return pending;
  };

  const deadResources = TREE_SPECIES_MATERIAL_RESOURCES["dead-tree"];
  const needDeadWood = activeKinds.has("dead-wood");
  const needBush = activeKinds.has("desert-shrub");
  const needFlower = activeKinds.has("pastel-flower") || activeKinds.has("meadow-flower");
  const needGrass = needFlower || activeKinds.has("dry-grass") || activeKinds.has("plume-grass");
  const needPlume = activeKinds.has("plume-grass");

  if (needBush && !decodedBushAsset) decodedBushAsset = decodePlantParameters<ProceduralPlantAsset>(bushStructureJson);
  if (needFlower && !decodedFlowerAsset)
    decodedFlowerAsset = decodePlantParameters<ProceduralPlantAsset>(flowerStructureJson);
  if (needGrass && !decodedGrassAsset)
    decodedGrassAsset = decodePlantParameters<ProceduralPlantAsset>(grassStructureJson);
  if (needPlume && !decodedPlumeAsset)
    decodedPlumeAsset = decodePlantParameters<ProceduralPlantAsset>(plumeStructureJson);

  const [loadedEntries, deadBarkAlbedo, deadBarkNormal] = await Promise.all([
    Promise.all([...neededTextureKeys].map(async (key) => [key, await loadTex(key)] as const)),
    needDeadWood ? loadOptionalTex("deadBarkAlbedo", deadResources?.barkAlbedoUrl) : Promise.resolve(undefined),
    needDeadWood ? loadOptionalTex("deadBarkNormal", deadResources?.barkNormalUrl) : Promise.resolve(undefined)
  ]);

  return {
    bushAsset: decodedBushAsset,
    flowerAsset: decodedFlowerAsset,
    grassAsset: decodedGrassAsset,
    plumeAsset: decodedPlumeAsset,
    textures: Object.fromEntries(loadedEntries),
    deadBarkAlbedo,
    deadBarkNormal
  };
}

function transformRestParts(
  parts: readonly PlantPartMesh[],
  transformArray: readonly number[],
  targetMaterialId: string,
  suffix: string
): PlantPartMesh[] {
  const matrix = new Matrix().copyFromArray(transformArray);
  const normalMatrix = matrix.clone().invert().transpose();
  const flipWinding = matrix.determinant() < 0;
  const pos = new Vector3();
  const norm = new Vector3();
  return parts.map((part) => {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const positions = part.mesh.positions.map((p) => {
      Vector3.transformCoordinate(pos.set(...p), matrix, pos);
      min[0] = Math.min(min[0], pos.x);
      min[1] = Math.min(min[1], pos.y);
      min[2] = Math.min(min[2], pos.z);
      max[0] = Math.max(max[0], pos.x);
      max[1] = Math.max(max[1], pos.y);
      max[2] = Math.max(max[2], pos.z);
      return [pos.x, pos.y, pos.z] as const;
    });
    const normals = part.mesh.normals.map((n) => {
      Vector3.transformNormal(norm.set(...n), normalMatrix, norm);
      norm.normalize();
      return [norm.x, norm.y, norm.z] as const;
    });
    const indices = flipWinding
      ? part.mesh.indices.map((_, idx) => part.mesh.indices[idx - (idx % 3) + (idx % 3 === 0 ? 0 : 3 - (idx % 3))])
      : part.mesh.indices;
    return {
      partId: `${part.partId}/${suffix}`,
      materialId: targetMaterialId,
      mesh: {
        ...part.mesh,
        positions,
        normals,
        indices,
        bounds: [min, max] as const
      }
    };
  });
}

function attachFlexibleWindFrames(parts: readonly PlantPartMesh[], windHeight: number): PlantPartMesh[] {
  const safeHeight = Math.max(0.05, windHeight);
  return parts.map((part) => {
    const positions = part.mesh.positions;
    const windFrames = new Float32Array(positions.length * 4);
    for (let i = 0; i < positions.length; i++) {
      const o = i * 4;
      windFrames[o] = 1;
      windFrames[o + 3] = Math.min(1, Math.max(0, positions[i][1]) / safeHeight);
    }
    return {
      ...part,
      mesh: {
        ...part.mesh,
        windFrames
      }
    };
  });
}

function catalogLodInstances(speciesId: string, lodIndex: number): readonly PlantGeometryInstance[] {
  const entry = PLANT_SPECIES_CATALOG.assets.find((item) => item.id === speciesId) as
    | { geometryInstances?: readonly PlantGeometryInstance[] }
    | undefined;
  return (entry?.geometryInstances ?? []).filter((inst) => !inst.lods || inst.lods.includes(lodIndex));
}

function scaleTransformXZ(transform: readonly number[], xzScale: number): number[] {
  const out = transform.slice();
  out[0] *= xzScale;
  out[1] *= xzScale;
  out[2] *= xzScale;
  out[8] *= xzScale;
  out[9] *= xzScale;
  out[10] *= xzScale;
  out[12] *= xzScale;
  out[14] *= xzScale;
  return out;
}

/**
 * Camera-distance thresholds (metres) for `desert-shrub` dynamic GPU-instanced LOD bucketing.
 * - LOD0 (< 24m): full two-layer close-up foliage (upper crown + lower sage skirt).
 * - LOD1 (24–46m): broadened single-layer mid-ground bush (-67% triangles).
 * - LOD2 (46–84m): broadened single-layer canyon ledge bush (-83% triangles).
 * - LOD3 (84–190m): far canyon rim silhouette (-96% triangles).
 */
export const DESERT_SHRUB_LOD_DISTANCES_M: readonly number[] = [24, 46, 84];
const TEMPLATE_PLANT_CELL_SIZE_M = 32;
const CAMERA_MATRIX_EPSILON = 1e-5;

interface TemplatePlantLodPolicy {
  readonly distancesM: readonly number[];
  readonly maxDistanceM: number;
  readonly hysteresisM: number;
}

export const TEMPLATE_PLANT_LOD_POLICIES: Readonly<
  Record<Exclude<TemplateProceduralPlantKind, "dead-wood">, TemplatePlantLodPolicy>
> = {
  "desert-shrub": { distancesM: DESERT_SHRUB_LOD_DISTANCES_M, maxDistanceM: 190, hysteresisM: 4 },
  "pastel-flower": { distancesM: [16, 34], maxDistanceM: 95, hysteresisM: 3 },
  "meadow-flower": { distancesM: [16, 34], maxDistanceM: 95, hysteresisM: 3 },
  "dry-grass": { distancesM: [22, 48], maxDistanceM: 130, hysteresisM: 4 },
  "plume-grass": { distancesM: [22, 48], maxDistanceM: 130, hysteresisM: 4 }
};

interface CompiledProductionPlantGeometry {
  readonly geometry: readonly PlantPartMesh[];
  readonly floor: number;
  readonly sourceHeight: number;
  readonly windHeight: number;
  readonly leafSlots: Set<string>;
  readonly canopyOcclusionSlots?: ReadonlySet<string>;
}

export interface CompiledTemplatePlantLod extends CompiledProductionPlantGeometry {
  readonly lodIndex: number;
}

export type CompiledDesertShrubLod = CompiledTemplatePlantLod;

const cachedDesertShrubLods = new WeakMap<ProceduralPlantAsset, readonly CompiledDesertShrubLod[]>();
const cachedFlowerLods = new WeakMap<ProceduralPlantAsset, Map<string, readonly CompiledTemplatePlantLod[]>>();
const cachedGrassLods = new WeakMap<ProceduralPlantAsset, Map<string, readonly CompiledTemplatePlantLod[]>>();

/** Compiles all available LODs for `desert-shrub` anchored to LOD0's canonical height so LOD swaps never pop vertically. */
export function compileDesertShrubLods(bushAsset: ProceduralPlantAsset): readonly CompiledDesertShrubLod[] {
  const cached = cachedDesertShrubLods.get(bushAsset);
  if (cached) return cached;
  const rawLeafId = "appearance-e832df91cc4eb1a2";
  const lodCount = Math.min(4, bushAsset.geometryLods.length);
  const lod0Parts = buildProceduralPlantGeometry(bushAsset.geometryLods[0], 0);
  const rawFloor = Math.min(...lod0Parts.map(({ mesh }) => mesh.bounds[0][1]));
  const rawMaxY = Math.max(...lod0Parts.map(({ mesh }) => mesh.bounds[1][1]));
  const rawHeight = Math.max(0.05, rawMaxY - rawFloor);
  // Combine an upper crown and a ground-hugging lower sage skirt at close range (LOD0),
  // and switch mid/far LODs to a single broadened crown so silhouette stays lush at half the triangle & overdraw cost.
  const closeLayers = [
    [1, 0, 0, 0, 0, 0.92, 0, 0, 0, 0, 1, 0, 0, -0.14 * rawHeight, 0, 1],
    [0, 0, -1.24, 0, 0, 0.62, 0, 0, 1.24, 0, 0, 0, 0, -0.22 * rawHeight, 0, 1]
  ];
  const distantLayers = [[1.16, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 1.16, 0, 0, -0.17 * rawHeight, 0, 1]];

  const assembleLayerParts = (
    baseParts: readonly PlantPartMesh[],
    layers: readonly (readonly number[])[]
  ): PlantPartMesh[] => {
    const assembled: PlantPartMesh[] = [];
    layers.forEach((m, idx) => {
      for (const part of baseParts) {
        const slot = part.materialId === rawLeafId ? "foliage" : "bark";
        assembled.push(...transformRestParts([part], m, slot, `b${idx}`));
      }
    });
    return assembled;
  };

  const lod0Assembled = assembleLayerParts(lod0Parts, closeLayers);
  const shrubCanopySlots = new Set<string>(["foliage"]);
  const lod0WithDepths = attachPlantCanopyOpticalDepth(lod0Assembled, shrubCanopySlots);
  const lod0Floor = Math.min(...lod0WithDepths.map(({ mesh }) => mesh.bounds[0][1]));
  const lod0MaxY = Math.max(...lod0WithDepths.map(({ mesh }) => mesh.bounds[1][1]));
  const windHeight = Math.max(0.05, lod0MaxY - lod0Floor);
  const floor = Math.max(lod0Floor, -0.02 * rawHeight);
  const sourceHeight = Math.max(0.01, lod0MaxY - floor);

  // Keep leafSlots empty so desert shrubs stay on the flexible plant wind & original sage color path
  // (no MATERIAL_VEGETATION_CLIMATE_LEAF leaf-pivot flutter or forest-leaf season recoloring).
  const result: CompiledDesertShrubLod[] = [
    {
      lodIndex: 0,
      geometry: mergePlantGeometryByMaterial(attachFlexibleWindFrames(lod0WithDepths, windHeight)),
      floor,
      sourceHeight,
      windHeight,
      leafSlots: new Set(),
      canopyOcclusionSlots: shrubCanopySlots
    }
  ];

  for (let lodIndex = 1; lodIndex < lodCount; lodIndex++) {
    const baseParts = buildProceduralPlantGeometry(bushAsset.geometryLods[lodIndex], 0);
    const assembled = attachPlantCanopyOpticalDepth(
      assembleLayerParts(baseParts, distantLayers),
      shrubCanopySlots,
      lod0WithDepths
    );
    result.push({
      lodIndex,
      geometry: mergePlantGeometryByMaterial(attachFlexibleWindFrames(assembled, windHeight)),
      floor,
      sourceHeight,
      windHeight,
      leafSlots: new Set(),
      canopyOcclusionSlots: shrubCanopySlots
    });
  }

  cachedDesertShrubLods.set(bushAsset, result);
  return result;
}

/** Compiles LOD0..LOD2 flower cushion meshes anchored to LOD0 height for `pastel-flower` and `meadow-flower`. */
export function compileFlowerLods(
  kind: "pastel-flower" | "meadow-flower",
  flowerAsset: ProceduralPlantAsset,
  grassAsset: ProceduralPlantAsset
): readonly CompiledTemplatePlantLod[] {
  let byKind = cachedFlowerLods.get(flowerAsset);
  const existing = byKind?.get(kind);
  if (existing) return existing;

  const rawPetalId = "appearance-e7bfcdb9301d4d83";
  const baseHeadBoost = kind === "meadow-flower" ? 1.28 : 1.95;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const radiusScale = kind === "meadow-flower" ? 0.72 : 0.52;

  const lod0BaseParts = buildProceduralPlantGeometry(flowerAsset.geometryLods[0], 0);
  const baseSpan = Math.max(
    0.1,
    ...lod0BaseParts.map(({ mesh }) =>
      Math.max(mesh.bounds[1][0] - mesh.bounds[0][0], mesh.bounds[1][2] - mesh.bounds[0][2])
    )
  );
  const baseMaxY = Math.max(0.05, ...lod0BaseParts.map(({ mesh }) => mesh.bounds[1][1]));
  const grassLod0Rest = buildProceduralPlantGeometry(grassAsset.geometryLods[0], 0);
  const grassMaxY = Math.max(0.05, ...grassLod0Rest.map(({ mesh }) => mesh.bounds[1][1]));
  const foliageScale = (baseMaxY * 0.55) / grassMaxY;
  const grassCatalog = catalogLodInstances("SM_Grass_02_03", 0);

  const tierSpecs = [
    {
      lodIndex: 0,
      flowerLodIndex: 0,
      grassLodIndex: 0,
      sprigCount: kind === "meadow-flower" ? 5 : 9,
      grassCount: 3,
      headBoostMul: 1
    },
    {
      lodIndex: 1,
      flowerLodIndex: Math.min(1, flowerAsset.geometryLods.length - 1),
      grassLodIndex: Math.min(1, grassAsset.geometryLods.length - 1),
      sprigCount: kind === "meadow-flower" ? 3 : 4,
      grassCount: 2,
      headBoostMul: 1.18
    },
    {
      lodIndex: 2,
      flowerLodIndex: Math.min(2, flowerAsset.geometryLods.length - 1),
      grassLodIndex: Math.min(2, grassAsset.geometryLods.length - 1),
      sprigCount: 2,
      grassCount: 1,
      headBoostMul: 1.32
    }
  ] as const;

  const q = new Quaternion();
  const mat = new Matrix();
  const buildTierParts = (spec: (typeof tierSpecs)[number]): PlantPartMesh[] => {
    const baseParts =
      spec.flowerLodIndex === 0
        ? lod0BaseParts
        : buildProceduralPlantGeometry(flowerAsset.geometryLods[spec.flowerLodIndex], 0);
    const headBoost = baseHeadBoost * spec.headBoostMul;
    const enlargedParts = baseParts.map((part) => {
      if (part.materialId !== rawPetalId) return part;
      const cx = (part.mesh.bounds[0][0] + part.mesh.bounds[1][0]) * 0.5;
      const cy = (part.mesh.bounds[0][1] + part.mesh.bounds[1][1]) * 0.5;
      const cz = (part.mesh.bounds[0][2] + part.mesh.bounds[1][2]) * 0.5;
      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      const positions = part.mesh.positions.map(([px, py, pz]) => {
        const nx = cx + (px - cx) * headBoost;
        const ny = cy + (py - cy) * headBoost;
        const nz = cz + (pz - cz) * headBoost;
        min[0] = Math.min(min[0], nx);
        min[1] = Math.min(min[1], ny);
        min[2] = Math.min(min[2], nz);
        max[0] = Math.max(max[0], nx);
        max[1] = Math.max(max[1], ny);
        max[2] = Math.max(max[2], nz);
        return [nx, ny, nz] as const;
      });
      return { ...part, mesh: { ...part.mesh, positions, bounds: [min, max] as const } };
    });

    const assembled: PlantPartMesh[] = [];
    for (let i = 0; i < spec.sprigCount; i++) {
      const r = (i === 0 ? 0 : 0.24 + Math.sqrt(i / Math.max(1, spec.sprigCount - 1)) * radiusScale) * baseSpan;
      const theta = i * goldenAngle;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const s = i === 0 ? 0.96 : 0.88 - (i % 3) * 0.08;
      const outwardTilt = i === 0 ? 0 : 0.22 + (i % 3) * 0.08;
      Quaternion.rotationYawPitchRoll(theta + i * 0.7, outwardTilt, 0, q);
      Matrix.affineTransformation(new Vector3(s, s * 0.78, s), q, new Vector3(x, -0.04 * baseMaxY, z), mat);
      const mArr = Array.from(mat.elements);
      for (const part of enlargedParts) {
        const slot = part.materialId === rawPetalId ? (i % 2 === 0 ? "petals" : "petalsAlt") : "foliage";
        assembled.push(...transformRestParts([part], mArr, slot, `c${i}`));
      }
    }

    const grassRest =
      spec.grassLodIndex === 0
        ? grassLod0Rest
        : buildProceduralPlantGeometry(grassAsset.geometryLods[spec.grassLodIndex], 0);
    grassCatalog.slice(0, spec.grassCount).forEach((inst, idx) => {
      const matching = grassRest.filter((part) => part.materialId === inst.materialId);
      const scaledTransform = inst.transform.map((v, k) =>
        k < 12 ? v * foliageScale : k === 15 ? 1 : v * foliageScale
      );
      assembled.push(...transformRestParts(matching, scaledTransform, "foliage", `fg${idx}`));
    });
    return assembled;
  };

  const lod0Assembled = buildTierParts(tierSpecs[0]);
  const floor = Math.min(...lod0Assembled.map(({ mesh }) => mesh.bounds[0][1]));
  const maxY = Math.max(...lod0Assembled.map(({ mesh }) => mesh.bounds[1][1]));
  const windHeight = Math.max(0.05, maxY);
  const sourceHeight = Math.max(0.01, maxY - floor);

  const result: CompiledTemplatePlantLod[] = tierSpecs.map((spec, idx) => {
    const assembled = idx === 0 ? lod0Assembled : buildTierParts(spec);
    return {
      lodIndex: spec.lodIndex,
      geometry: mergePlantGeometryByMaterial(attachFlexibleWindFrames(assembled, windHeight)),
      floor,
      sourceHeight,
      windHeight,
      leafSlots: new Set()
    };
  });

  if (!byKind) {
    byKind = new Map();
    cachedFlowerLods.set(flowerAsset, byKind);
  }
  byKind.set(kind, result);
  return result;
}

/** Compiles LOD0..LOD2 grass/plume clump meshes anchored to LOD0 height for `dry-grass` and `plume-grass`. */
export function compileGrassLods(
  kind: "dry-grass" | "plume-grass",
  grassAsset: ProceduralPlantAsset,
  plumeAsset?: ProceduralPlantAsset
): readonly CompiledTemplatePlantLod[] {
  let byKind = cachedGrassLods.get(grassAsset);
  const existing = byKind?.get(kind);
  if (existing) return existing;

  const grassLod0Rest = buildProceduralPlantGeometry(grassAsset.geometryLods[0], 0);
  const grassLod0Instances = catalogLodInstances("SM_Grass_02_03", 0);
  const grassLod3Instances = catalogLodInstances("SM_Grass_02_03", 3);

  const assembleGrass = (lodIndex: number, maxCount: number, xzScale: number): PlantPartMesh[] => {
    const clampedLod = Math.min(lodIndex, grassAsset.geometryLods.length - 1);
    const grassRest =
      clampedLod === 0 ? grassLod0Rest : buildProceduralPlantGeometry(grassAsset.geometryLods[clampedLod], 0);
    const sourceInstances = lodIndex >= 2 && grassLod3Instances.length > 0 ? grassLod3Instances : grassLod0Instances;
    const out: PlantPartMesh[] = [];
    sourceInstances.slice(0, maxCount).forEach((inst, idx) => {
      const matching = grassRest.filter((part) => part.materialId === inst.materialId);
      const transform = xzScale === 1 ? inst.transform : scaleTransformXZ(inst.transform, xzScale);
      out.push(...transformRestParts(matching, transform, "foliage", `g${idx}`));
    });
    return out;
  };

  const lod0Grass = assembleGrass(0, grassLod0Instances.length, 1);
  const grassMaxY = Math.max(...lod0Grass.map(({ mesh }) => mesh.bounds[1][1]));

  const plumeLod0Rest =
    kind === "plume-grass" && plumeAsset ? buildProceduralPlantGeometry(plumeAsset.geometryLods[0], 0) : undefined;
  const plumeBaseMaxY = plumeLod0Rest ? Math.max(0.05, ...plumeLod0Rest.map(({ mesh }) => mesh.bounds[1][1])) : 1;
  const plumeScale = (grassMaxY * 1.38) / plumeBaseMaxY;
  const allPlumeAngles = [
    { yaw: 0.3, tiltX: 0.12, tiltZ: -0.08, s: plumeScale },
    { yaw: 2.4, tiltX: -0.1, tiltZ: 0.12, s: plumeScale * 0.92 },
    { yaw: 4.5, tiltX: 0.08, tiltZ: 0.1, s: plumeScale * 0.86 }
  ];

  const q = new Quaternion();
  const mat = new Matrix();
  const buildTierParts = (
    lodIndex: number,
    grassCount: number,
    grassXzScale: number,
    plumeCount: number,
    plumeBoost: number
  ): PlantPartMesh[] => {
    const combined = lodIndex === 0 ? [...lod0Grass] : assembleGrass(lodIndex, grassCount, grassXzScale);
    if (kind === "plume-grass" && plumeAsset && plumeLod0Rest) {
      const clampedPlumeLod = Math.min(lodIndex, plumeAsset.geometryLods.length - 1);
      const plumeRest =
        clampedPlumeLod === 0
          ? plumeLod0Rest
          : buildProceduralPlantGeometry(plumeAsset.geometryLods[clampedPlumeLod], 0);
      allPlumeAngles.slice(0, plumeCount).forEach(({ yaw, tiltX, tiltZ, s }, idx) => {
        const bs = s * plumeBoost;
        Quaternion.rotationYawPitchRoll(yaw, tiltX, tiltZ, q);
        Matrix.affineTransformation(new Vector3(bs, bs, bs), q, new Vector3(0, 0, 0), mat);
        combined.push(...transformRestParts(plumeRest, Array.from(mat.elements), "plume", `p${idx}`));
      });
    }
    return combined;
  };

  const tierSpecs = [
    { lodIndex: 0, grassCount: grassLod0Instances.length, grassXzScale: 1, plumeCount: 3, plumeBoost: 1 },
    { lodIndex: 1, grassCount: 5, grassXzScale: 1.12, plumeCount: 2, plumeBoost: 1.08 },
    { lodIndex: 2, grassCount: 3, grassXzScale: 1.24, plumeCount: 1, plumeBoost: 1.18 }
  ] as const;

  const lod0Parts = buildTierParts(0, tierSpecs[0].grassCount, 1, 3, 1);
  const floor = Math.min(...lod0Parts.map(({ mesh }) => mesh.bounds[0][1]));
  const maxY = Math.max(...lod0Parts.map(({ mesh }) => mesh.bounds[1][1]));
  const windHeight = Math.max(0.05, maxY);
  const sourceHeight = Math.max(0.01, maxY - floor);

  const result: CompiledTemplatePlantLod[] = tierSpecs.map((spec, idx) => {
    const parts =
      idx === 0
        ? lod0Parts
        : buildTierParts(spec.lodIndex, spec.grassCount, spec.grassXzScale, spec.plumeCount, spec.plumeBoost);
    return {
      lodIndex: spec.lodIndex,
      geometry: mergePlantGeometryByMaterial(attachFlexibleWindFrames(parts, windHeight)),
      floor,
      sourceHeight,
      windHeight,
      leafSlots: new Set()
    };
  });

  if (!byKind) {
    byKind = new Map();
    cachedGrassLods.set(grassAsset, byKind);
  }
  byKind.set(kind, result);
  return result;
}

function resolvePlantLodTier(
  distanceM: number,
  currentTier: number,
  maxTier: number,
  thresholds: readonly number[],
  hysteresisM: number
): number {
  if (currentTier < 0) {
    let tier = 0;
    while (tier < maxTier && tier < thresholds.length && distanceM >= thresholds[tier]) {
      tier++;
    }
    return tier;
  }
  let tier = currentTier;
  while (tier > 0 && distanceM < thresholds[tier - 1] - hysteresisM) {
    tier--;
  }
  while (tier < maxTier && tier < thresholds.length && distanceM > thresholds[tier] + hysteresisM) {
    tier++;
  }
  return tier;
}

function distancePointToBoxSq(px: number, py: number, pz: number, box: BoundingBox): number {
  const dx = px < box.min.x ? box.min.x - px : px > box.max.x ? px - box.max.x : 0;
  const dy = py < box.min.y ? box.min.y - py : py > box.max.y ? py - box.max.y : 0;
  const dz = pz < box.min.z ? box.min.z - pz : pz > box.max.z ? pz - box.max.z : 0;
  return dx * dx + dy * dy + dz * dz;
}

type PaintedPlacement = TemplatePlantPlacement & { foliagePigment: number; barkPigment: number };

/** The packed slot owns both its picking ID and its pigment. LOD compaction moves them together. */
class TemplatePlantDraw implements SeedWorldPickBatch {
  readonly instanced = true;
  readonly placements: PaintedPlacement[] = [];
  readonly interactionOccluder: boolean;
  private readonly part?: "foliagePigment" | "barkPigment";

  constructor(
    readonly renderer: MeshRenderer,
    private readonly view: TreeAssemblyInstancedMesh,
    kind: TemplateProceduralPlantKind,
    slot: string
  ) {
    this.interactionOccluder = kind === "dead-wood" || kind === "desert-shrub";
    if (slot === "bark") this.part = "barkPigment";
    else if ((kind === "desert-shrub" && slot === "foliage") || slot === "petals" || slot === "petalsAlt")
      this.part = "foliagePigment";
  }
  get count(): number {
    return this.view.mesh.instanceCount;
  }
  resolve(index: number): string | undefined {
    return this.placements[index]?.sample?.id;
  }
  pack(index: number, placement: PaintedPlacement): void {
    this.placements[index] = placement;
    this.view.staging[index * this.view.recordFloats + TREE_ASSEMBLY_LOD_FADE_FLOAT_OFFSET] = this.part
      ? placement[this.part]
      : 1;
  }
  updateColors(): void {
    if (!this.part) return;
    let first = this.count,
      last = -1;
    for (let i = 0; i < this.count; i++) {
      const offset = i * this.view.recordFloats + TREE_ASSEMBLY_LOD_FADE_FLOAT_OFFSET;
      const color = this.placements[i][this.part];
      if (this.view.staging[offset] === color) continue;
      this.view.staging[offset] = color;
      first = Math.min(first, i);
      last = i;
    }
    if (last >= first) uploadTreeAssemblyInstanceRange(this.view, first, last - first + 1);
  }
}

interface PlantLodInstanceRecord {
  readonly placement: PaintedPlacement;
  readonly worldX: number;
  readonly centerY: number;
  readonly worldZ: number;
  readonly radius: number;
  readonly transform: Float32Array;
  readonly explicitVariant?: number;
  readonly variantRandom: number;
}

interface PlantSpatialCell {
  readonly bounds: BoundingBox;
  readonly instanceIndices: Int32Array;
}

interface PlantLodTierPart {
  readonly entity: Entity;
  readonly view: TreeAssemblyInstancedMesh;
  readonly draw: TemplatePlantDraw;
  readonly colors: PlantColorways;
}

function buildPlantSpatialCells(instances: readonly PlantLodInstanceRecord[]): PlantSpatialCell[] {
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const cx = Math.floor(inst.worldX / TEMPLATE_PLANT_CELL_SIZE_M);
    const cz = Math.floor(inst.worldZ / TEMPLATE_PLANT_CELL_SIZE_M);
    const key = `${cx},${cz}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(i);
  }
  const cells: PlantSpatialCell[] = [];
  for (const indices of buckets.values()) {
    const bounds = new BoundingBox(
      new Vector3(Infinity, Infinity, Infinity),
      new Vector3(-Infinity, -Infinity, -Infinity)
    );
    for (let k = 0; k < indices.length; k++) {
      const inst = instances[indices[k]];
      const r = inst.radius;
      bounds.min.set(
        Math.min(bounds.min.x, inst.worldX - r),
        Math.min(bounds.min.y, inst.centerY - r),
        Math.min(bounds.min.z, inst.worldZ - r)
      );
      bounds.max.set(
        Math.max(bounds.max.x, inst.worldX + r),
        Math.max(bounds.max.y, inst.centerY + r),
        Math.max(bounds.max.z, inst.worldZ + r)
      );
    }
    cells.push({ bounds, instanceIndices: Int32Array.from(indices) });
  }
  return cells;
}

/**
 * Spatial Cell + Frustum + Distance-LOD controller shared across all procedural template plants.
 * Partitioned into 32m XZ cells with zero per-frame allocations and VP-matrix change gating.
 */
class TemplatePlantCellLodController extends Script {
  private camera?: Camera;
  private instances: readonly PlantLodInstanceRecord[] = [];
  private cells: readonly PlantSpatialCell[] = [];
  private tiers: readonly (readonly PlantLodTierPart[])[] = [];
  private policy: TemplatePlantLodPolicy = TEMPLATE_PLANT_LOD_POLICIES["desert-shrub"];
  private assignedLod = new Int8Array(0);
  private nextAssignedLod = new Int8Array(0);
  private tierCounts = new Int32Array(0);
  private readonly viewProjection = new Matrix();
  private readonly lastViewProjection = new Float32Array(16);
  private lastViewProjectionValid = false;
  private readonly frustum = new BoundingFrustum();
  private readonly scratchSphere = new BoundingSphere();

  configure(
    camera: Camera,
    instances: readonly PlantLodInstanceRecord[],
    tiers: readonly (readonly PlantLodTierPart[])[],
    policy: TemplatePlantLodPolicy
  ): void {
    this.camera = camera;
    this.instances = instances;
    this.cells = buildPlantSpatialCells(instances);
    this.tiers = tiers;
    this.policy = policy;
    this.assignedLod = new Int8Array(instances.length).fill(-2);
    this.nextAssignedLod = new Int8Array(instances.length).fill(-1);
    this.tierCounts = new Int32Array(tiers.length);
    this.lastViewProjectionValid = false;
    this.refresh(true);
  }

  override onLateUpdate(): void {
    this.refresh(false);
  }

  refresh(force: boolean): void {
    const camera = this.camera;
    if (!camera || camera.destroyed || camera.entity.destroyed || this.tiers.length === 0) return;

    Matrix.multiply(camera.projectionMatrix, camera.viewMatrix, this.viewProjection);
    const vp = this.viewProjection.elements;
    const frustumValid =
      Number.isFinite(vp[0]) &&
      Number.isFinite(vp[5]) &&
      Number.isFinite(vp[15]) &&
      (Math.abs(vp[0]) > 1e-6 || Math.abs(vp[5]) > 1e-6);

    if (!force && frustumValid && this.lastViewProjectionValid) {
      let cameraChanged = false;
      for (let i = 0; i < 16; i++) {
        if (Math.abs(vp[i] - this.lastViewProjection[i]) > CAMERA_MATRIX_EPSILON) {
          cameraChanged = true;
          break;
        }
      }
      if (!cameraChanged) return;
    }

    if (frustumValid) {
      this.lastViewProjection.set(vp);
      this.lastViewProjectionValid = true;
      this.frustum.calculateFromMatrix(this.viewProjection);
    } else {
      this.lastViewProjectionValid = false;
    }

    const camPos = camera.entity.transform.worldPosition;
    const camX = camPos.x;
    const camY = camPos.y;
    const camZ = camPos.z;
    const maxTier = this.tiers.length - 1;
    const { distancesM, maxDistanceM, hysteresisM } = this.policy;
    const maxCellCullDist = maxDistanceM + hysteresisM;
    const maxCellCullDistSq = maxCellCullDist * maxCellCullDist;

    this.nextAssignedLod.fill(-1);
    for (let c = 0; c < this.cells.length; c++) {
      const cell = this.cells[c];
      if (distancePointToBoxSq(camX, camY, camZ, cell.bounds) > maxCellCullDistSq) continue;
      if (frustumValid && !this.frustum.intersectsBox(cell.bounds)) continue;
      const indices = cell.instanceIndices;
      for (let k = 0; k < indices.length; k++) {
        const idx = indices[k];
        const inst = this.instances[idx];
        const dx = inst.worldX - camX;
        const dy = inst.centerY - camY;
        const dz = inst.worldZ - camZ;
        const prev = this.assignedLod[idx];
        const cullLimit = prev >= 0 ? maxDistanceM + hysteresisM : maxDistanceM;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > cullLimit * cullLimit) continue;
        if (frustumValid) {
          this.scratchSphere.center.set(inst.worldX, inst.centerY, inst.worldZ);
          this.scratchSphere.radius = inst.radius;
          if (!this.frustum.intersectsSphere(this.scratchSphere)) continue;
        }
        this.nextAssignedLod[idx] = resolvePlantLodTier(Math.sqrt(distSq), prev, maxTier, distancesM, hysteresisM);
      }
    }

    let changed = force;
    for (let i = 0; i < this.instances.length; i++) {
      if (this.nextAssignedLod[i] !== this.assignedLod[i]) {
        this.assignedLod[i] = this.nextAssignedLod[i];
        changed = true;
      }
    }
    if (!changed) return;

    this.tierCounts.fill(0);
    for (let i = 0; i < this.instances.length; i++) {
      const tierIndex = this.assignedLod[i];
      if (tierIndex < 0) continue;
      const slotIndex = this.tierCounts[tierIndex]++;
      const inst = this.instances[i];
      const tierParts = this.tiers[tierIndex];
      for (let p = 0; p < tierParts.length; p++) {
        const part = tierParts[p];
        const offset = slotIndex * part.view.recordFloats;
        const rawVariant = inst.explicitVariant ?? Math.floor(inst.variantRandom * part.colors.length);
        const color = part.colors[Math.abs(Math.trunc(rawVariant)) % part.colors.length];
        const staging = part.view.staging;
        staging.set(inst.transform, offset);
        staging[offset + 12] = color[0];
        staging[offset + 13] = color[1];
        staging[offset + 14] = color[2];
        part.draw.pack(slotIndex, inst.placement);
      }
    }

    for (let t = 0; t < this.tiers.length; t++) {
      const count = this.tierCounts[t];
      const tierParts = this.tiers[t];
      for (let p = 0; p < tierParts.length; p++) {
        const part = tierParts[p];
        uploadTreeAssemblyInstances(part.view, count);
        part.entity.isActive = count > 0;
      }
    }
  }
}

function compileProductionGeometryLods(
  kind: Exclude<TemplateProceduralPlantKind, "dead-wood">,
  resources: TemplateProceduralPlantResources
): readonly CompiledTemplatePlantLod[] {
  if (kind === "desert-shrub") {
    const bushAsset =
      resources.bushAsset ?? (decodedBushAsset ??= decodePlantParameters<ProceduralPlantAsset>(bushStructureJson));
    return compileDesertShrubLods(bushAsset);
  }
  const grassAsset =
    resources.grassAsset ?? (decodedGrassAsset ??= decodePlantParameters<ProceduralPlantAsset>(grassStructureJson));
  if (kind === "pastel-flower" || kind === "meadow-flower") {
    const flowerAsset =
      resources.flowerAsset ??
      (decodedFlowerAsset ??= decodePlantParameters<ProceduralPlantAsset>(flowerStructureJson));
    return compileFlowerLods(kind, flowerAsset, grassAsset);
  }
  const plumeAsset =
    kind === "plume-grass"
      ? (resources.plumeAsset ??
        (decodedPlumeAsset ??= decodePlantParameters<ProceduralPlantAsset>(plumeStructureJson)))
      : undefined;
  return compileGrassLods(kind, grassAsset, plumeAsset);
}

const cachedDeadTreeMeshes = new WeakMap<Engine, readonly ModelMesh[]>();

function getDeadTreeVariantMeshes(engine: Engine): readonly ModelMesh[] {
  const cached = cachedDeadTreeMeshes.get(engine);
  if (
    cached &&
    cached.every((mesh) => !mesh.destroyed && !mesh.vertexBufferBindings.some((binding) => binding?.buffer.destroyed))
  ) {
    return cached;
  }
  const deadParams = TREE_SPECIES_PARAMETERS["dead-tree"]!;
  const lodPolicy = TREE_SPECIES_LOD_POLICIES["dead-tree"]!;
  const foliageTuning = createProceduralTreeFoliageGeometryTuning();
  const measuredSource: ProceduralTreeSource = {
    id: DEAD_TREE_ASSET_ID,
    label: "Desert Dead Tree Measured",
    size: deadParams.size,
    proceduralProfile: "white-birch",
    proceduralGeometryIdentity: "dead-tree",
    structureParameters: DEAD_TREE_STRUCTURE
  };
  const measuredLod = createProceduralTreeMeshesForLods(
    engine,
    measuredSource,
    [0],
    deadParams.leafCountTuning,
    deadParams.distributionTuning,
    foliageTuning,
    lodPolicy.triangleBudget
  )[0]!;
  measuredLod.crown.destroy();

  const saplingBase: ProceduralTreeSource = {
    id: `${DEAD_TREE_ASSET_ID}:weeping-desert`,
    label: "Desert Weeping Snag",
    size: 10.5,
    proceduralProfile: "white-birch",
    proceduralGeometryIdentity: "desert-weeping-snag"
  };
  const weepingDistribution = {
    ...createDefaultProceduralTreeDistributionTuning(saplingBase),
    geometrySeed: 294817523,
    trunkCount: 1,
    trunkClearHeightPercentOfHeight: 28,
    trunkRadiusPercentOfHeight: 1.55,
    trunkCurveVariationDegrees: 18,
    trunkSplitAngleDegrees: 16,
    branchCount: 7,
    branchLengthPercentOfParent: 42,
    branchMaximumLengthPercentOfHeight: 56,
    branchLengthVariationPercent: 22,
    branchCurveVariationDegrees: 30,
    branchAttractionUp: -0.14,
    branchDownAngleDegrees: 46,
    branchDownAngleVariationDegrees: 14,
    twigCount: 24,
    twigLengthPercentOfParent: 54,
    twigMaximumLengthPercentOfHeight: 28,
    twigLengthVariationPercent: 36,
    twigCurveVariationDegrees: 44,
    twigAttractionUp: -0.22,
    twigDownAngleDegrees: 62,
    twigDownAngleVariationDegrees: 16,
    leafNormalCrownBlendPercent: 0
  };
  const weepingLod = createProceduralTreeMeshesForLods(
    engine,
    saplingBase,
    [0],
    { lod0Count: 0, lod1Count: 0, lod2Count: 0, lod3Count: 0 },
    weepingDistribution,
    foliageTuning,
    lodPolicy.triangleBudget
  )[0]!;
  weepingLod.crown.destroy();

  const meshes = [measuredLod.trunk, weepingLod.trunk] as const;
  cachedDeadTreeMeshes.set(engine, meshes);
  return meshes;
}

function bindDeadTreeBarkTextures(
  engine: Engine,
  material: PBRMaterial,
  isDisposed: () => boolean,
  plantResources?: TemplateProceduralPlantResources
): void {
  const resources = TREE_SPECIES_MATERIAL_RESOURCES["dead-tree"];
  if (!resources) return;
  const [uScale, vScale] = resources.trunkUvTilesPerMeter;
  material.shaderData.setVector2("material_UvScale", new Vector2(uScale, vScale));
  material.shaderData.enableMacro("MATERIAL_HAS_UV_SCALE");
  if (plantResources?.deadBarkAlbedo && !plantResources.deadBarkAlbedo.destroyed) {
    material.baseTexture = plantResources.deadBarkAlbedo;
  }
  if (plantResources?.deadBarkNormal && !plantResources.deadBarkNormal.destroyed) {
    material.normalTexture = plantResources.deadBarkNormal;
  }
  if (material.baseTexture && material.normalTexture) return;
  void Promise.all([
    engine.resourceManager.load<Texture2D>({ type: AssetType.Texture, url: resources.barkAlbedoUrl }),
    engine.resourceManager.load<Texture2D>({ type: AssetType.Texture, url: resources.barkNormalUrl })
  ])
    .then(([albedo, normal]) => {
      if (isDisposed() || material.destroyed) return;
      if (albedo instanceof Texture2D) material.baseTexture = albedo;
      if (normal instanceof Texture2D) material.normalTexture = normal;
    })
    .catch(() => {});
}

const PROCEDURAL_WIND_PARAMS: Record<
  Exclude<TemplateProceduralPlantKind, "dead-wood">,
  readonly [wholeLimit: number, wholeFreqHz: number, leafLimit: number, leafFreqHz: number]
> = {
  "dry-grass": [0.32, 0.65, 0, 1.15],
  "plume-grass": [0.38, 0.68, 0, 1.2],
  "desert-shrub": [0.16, 0.52, 0.14, 1.15],
  "pastel-flower": [0.28, 0.68, 0, 1.25],
  "meadow-flower": [0.24, 0.68, 0, 1.22]
};

interface ProceduralShrubShadingOptions {
  readonly lightingFlatness: number;
  readonly translucencyIntensity: number;
  readonly canopyOcclusionDensity?: number;
  readonly verticalGradient?: {
    readonly baseColor: Color;
    readonly crownColor: Color;
    readonly floor: number;
    readonly height: number;
  };
}

function createProceduralWindMaterial(
  engine: Engine,
  vegetationTemplate: Material | undefined,
  isLeaf: boolean,
  windHeight: number,
  windParams: readonly [number, number, number, number],
  texture: Texture2D | undefined,
  alphaCutoff: number,
  textureBlend: number,
  albedoBrightness: number,
  desaturation: number,
  shading?: ProceduralShrubShadingOptions
): Material {
  if (!vegetationTemplate || vegetationTemplate.shader.name !== "Terrain/Vegetation") {
    const fallback = createSurfaceMaterial(engine, { baseColor: new Color(1, 1, 1, 1) });
    fallback.renderFace = RenderFace.Double;
    fallback.screenSpaceReflectionOccluder = false;
    return fallback;
  }
  const material = vegetationTemplate.clone();
  // Low ground shrubs, grass tufts, and flowers opt out of shadow casting and SSR DepthOnly occlusion.
  material.screenSpaceReflectionOccluder = false;
  const data = material.shaderData;
  for (const macro of data.getMacros()) {
    if (
      macro.name.startsWith("MATERIAL_WIND_") ||
      macro.name.startsWith("MATERIAL_SECOND_COLOR_") ||
      [
        "MATERIAL_HAS_BASETEXTURE",
        "MATERIAL_HAS_SMOOTHNESS_TEXTURE",
        "MATERIAL_HAS_NORMALTEXTURE",
        "MATERIAL_ENABLE_SECOND_COLOR",
        "MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION",
        "MATERIAL_PROCEDURAL_TREE_TRUNK_VERTICAL_GRADIENT"
      ].includes(macro.name)
    ) {
      data.disableMacro(macro);
    }
  }
  if (texture) {
    configureProceduralLeafMaterial(material, texture);
  } else {
    data.setTexture("material_BaseTexture", null!);
  }
  configureProceduralPlantWindMaterial(material, isLeaf);
  data.setFloat("material_ProceduralTreeHeight", windHeight);
  data.setVector4("material_ProceduralTreeWindParams", new Vector4(...windParams));
  data.setColor("material_BaseColor", shading?.verticalGradient?.baseColor ?? new Color(1, 1, 1, 1));
  data.setColor("material_TranslucencyColor", new Color(1, 0.96, 0.9, 1));
  data.setFloat("material_TranslucencyIntensity", shading?.translucencyIntensity ?? (isLeaf ? 0.62 : 0.42));
  data.setFloat("material_LeafAlbedoBrightness", albedoBrightness);
  data.setFloat("material_LeafAlbedoDesaturation", desaturation);
  data.setFloat("material_LeafAlbedoTextureBlend", texture ? textureBlend : 0);
  data.setFloat("material_LeafFlipBackfaceNormals", 1);
  data.setFloat("material_LightingFlatness", shading?.lightingFlatness ?? 0.58);
  data.setFloat("material_Smoothness", 0.12);
  data.setFloat("material_Tiling", 1);
  data.setFloat("material_UVBaseLock", 0);
  data.setFloat("material_AlphaCutoff", texture ? alphaCutoff : 0);
  data.setFloat("material_GrassDistanceFadeEnable", 0);
  if (shading?.canopyOcclusionDensity && shading.canopyOcclusionDensity > 0) {
    data.enableMacro("MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION");
    data.setFloat("material_ProceduralTreeCanopyOcclusionDensity", shading.canopyOcclusionDensity);
    data.setColor("material_ProceduralTreeCanopyOcclusionColor", new Color(0.66, 0.71, 0.65, 1));
  }
  if (shading?.verticalGradient) {
    data.enableMacro("MATERIAL_ENABLE_SECOND_COLOR");
    data.enableMacro("MATERIAL_SECOND_COLOR_LINEAR_OBJECT_GRADIENT");
    data.setColor("material_SecondColor", shading.verticalGradient.crownColor);
    data.setFloat("material_SecondColorLevel", -shading.verticalGradient.floor);
    data.setFloat("material_SecondColorGradient", 1 / Math.max(0.05, shading.verticalGradient.height * 0.88));
  }
  return material;
}

/** Mounts native procedural desert trees/shrubs/flowers/grass declared on a template via GPU instancing. */
export function mountTemplateProceduralPlants(
  root: Entity,
  anchor: { x: number; y: number; z: number },
  plants: readonly TemplatePlantPlacement[],
  seed: number,
  vegetationTemplate?: Material,
  plantResources?: TemplateProceduralPlantResources,
  camera?: Camera
) {
  let disposed = false;
  const disposals: Array<() => void> = [];
  const grouped = new Map<TemplateProceduralPlantKind, PaintedPlacement[]>();
  const draws: TemplatePlantDraw[] = [];
  const placements = plants.map((plant) => ({ ...plant, foliagePigment: 1, barkPigment: 1 }));
  for (const placement of placements) {
    const kind = placement.entry.kind;
    let list = grouped.get(kind);
    if (!list) grouped.set(kind, (list = []));
    list.push(placement);
  }
  const owner = root.createChild("Template procedural plants");
  const rotQuat = new Quaternion();

  for (const [kind, positioned] of grouped) {
    if (kind === "dead-wood") {
      const material = createSurfaceMaterial(root.engine, { baseColor: new Color(1, 1, 1, 1), normalStrength: 0.75 });
      material.renderFace = RenderFace.Double;
      disposals.push(() => material.destroy());
      bindDeadTreeBarkTextures(root.engine, material, () => disposed, plantResources);

      const variants = getDeadTreeVariantMeshes(root.engine);
      const colors = PROCEDURAL_PALETTE["dead-wood"].bark;

      variants.forEach((variantMesh, variantIndex) => {
        const subset = positioned.filter(({ entry }, idx) => ((entry.variant ?? idx) & 1) === variantIndex);
        if (!subset.length) return;
        const floor = variantMesh.bounds.min.y;
        const sourceHeight = Math.max(0.01, variantMesh.bounds.max.y - floor);
        const bounds = new BoundingBox(
          new Vector3(Infinity, Infinity, Infinity),
          new Vector3(-Infinity, -Infinity, -Infinity)
        );
        const storage = createTreeAssemblyInstanceStorage(root.engine, subset.length);
        disposals.push(() => storage.instanceBuffer.destroy(true));

        subset.forEach(({ entry, localX, localY, localZ, reach }, idx) => {
          const scale = entry.heightM / sourceHeight;
          const base = localY - floor * scale - 0.14;
          const yaw = ((entry.yawDegrees ?? 0) * Math.PI) / 180;
          const pitch = ((entry.tiltXDegrees ?? 0) * Math.PI) / 180;
          const roll = ((entry.tiltZDegrees ?? 0) * Math.PI) / 180;
          Quaternion.rotationYawPitchRoll(yaw, pitch, roll, rotQuat);
          bounds.min.set(
            Math.min(bounds.min.x, localX - reach),
            Math.min(bounds.min.y, base - 0.5),
            Math.min(bounds.min.z, localZ - reach)
          );
          bounds.max.set(
            Math.max(bounds.max.x, localX + reach),
            Math.max(bounds.max.y, base + entry.heightM * 1.25),
            Math.max(bounds.max.z, localZ + reach)
          );
          const offset = idx * storage.recordFloats;
          const rawVariant =
            entry.variant ?? Math.floor(settlementRandom(seed, `template-plant:${entry.id}`) * colors.length);
          const color = colors[Math.abs(Math.trunc(rawVariant)) % colors.length];
          storage.staging.set(
            [
              localX,
              base,
              localZ,
              1,
              rotQuat.x,
              rotQuat.y,
              rotQuat.z,
              rotQuat.w,
              scale * (entry.spreadScale ?? 1),
              scale,
              scale * (entry.spreadScale ?? 1),
              1
            ],
            offset
          );
          storage.staging.set([...color, 1], offset + 12);
        });

        const name = `dead-wood/variant-${variantIndex}`;
        const view = createTreeAssemblyInstancedMesh(root.engine, variantMesh, subset.length, bounds, name, storage);
        disposals.push(() => view.mesh.destroy());
        uploadTreeAssemblyInstances(view, subset.length);
        const renderer = owner.createChild(name).addComponent(MeshRenderer);
        renderer.mesh = view.mesh;
        renderer.setMaterial(material);
        renderer.castShadows = renderer.receiveShadows = true;
        renderer.shaderData.enableMacro("RENDERER_ASSET_ASSEMBLY_INSTANCE");
        const draw = new TemplatePlantDraw(renderer, view, kind, "bark");
        subset.forEach((plant, i) => draw.pack(i, plant));
        draws.push(draw);
      });
      continue;
    }

    if (!plantResources) continue;
    const plantLods = compileProductionGeometryLods(kind, plantResources);
    const primary = plantLods[0]!;
    const { floor, sourceHeight, windHeight, leafSlots, canopyOcclusionSlots } = primary;
    const windParams = PROCEDURAL_WIND_PARAMS[kind];
    const slotConfigs = SLOT_TEXTURES[kind] ?? {};
    const materials = Object.fromEntries(
      Object.keys(PROCEDURAL_PALETTE[kind]).map((slot) => {
        const cfg = slotConfigs[slot];
        const texture = cfg?.textureKey ? plantResources.textures[cfg.textureKey] : undefined;
        const isDesertShrub = kind === "desert-shrub";
        const isShrubCanopy = isDesertShrub && Boolean(canopyOcclusionSlots?.has(slot));
        const brightness =
          kind === "meadow-flower" && (slot === "petals" || slot === "petalsAlt")
            ? 1.75
            : kind === "pastel-flower" && (slot === "petals" || slot === "petalsAlt")
              ? 1.32
              : isDesertShrub
                ? 1.72
                : 1.48;
        const desaturation = isDesertShrub ? 0.32 : 0;
        const shading: ProceduralShrubShadingOptions | undefined = isDesertShrub
          ? {
              lightingFlatness: isShrubCanopy ? 0.05 : 0.0,
              translucencyIntensity: isShrubCanopy ? 0.16 : 0.08,
              canopyOcclusionDensity: isShrubCanopy ? 0.55 : undefined,
              verticalGradient: isShrubCanopy
                ? {
                    baseColor: new Color(0.68, 0.72, 0.67, 1),
                    crownColor: new Color(1.14, 1.13, 1.07, 1),
                    floor,
                    height: sourceHeight
                  }
                : undefined
            }
          : undefined;
        const material = createProceduralWindMaterial(
          root.engine,
          vegetationTemplate,
          leafSlots.has(slot),
          windHeight,
          windParams,
          texture,
          cfg?.alphaCutoff ?? 0,
          cfg?.textureBlend ?? 0,
          brightness,
          desaturation,
          shading
        );
        disposals.push(() => material.destroy());
        return [slot, material];
      })
    );
    const bounds = new BoundingBox(
      new Vector3(Infinity, Infinity, Infinity),
      new Vector3(-Infinity, -Infinity, -Infinity)
    );
    const transforms = positioned.map(({ entry, localX, localY, localZ, height: effectiveHeight, spread, reach }) => {
      const scaleY = effectiveHeight / sourceHeight;
      const scaleXZ = scaleY * spread;
      const sink = entry.onRock ? Math.min(0.08, effectiveHeight * 0.08) : Math.min(0.035, effectiveHeight * 0.06);
      const base = localY - floor * scaleY - sink;
      const yaw = ((entry.yawDegrees ?? 0) * Math.PI) / 180;
      bounds.min.set(
        Math.min(bounds.min.x, localX - reach),
        Math.min(bounds.min.y, base - effectiveHeight),
        Math.min(bounds.min.z, localZ - reach)
      );
      bounds.max.set(
        Math.max(bounds.max.x, localX + reach),
        Math.max(bounds.max.y, base + effectiveHeight * 2.6),
        Math.max(bounds.max.z, localZ + reach)
      );
      return {
        localX,
        base,
        localZ,
        effectiveHeight,
        radius: Math.max(0.6, effectiveHeight * Math.max(1.25, spread * 1.45)),
        transform: new Float32Array([
          localX,
          base,
          localZ,
          1,
          0,
          Math.sin(yaw / 2),
          0,
          Math.cos(yaw / 2),
          scaleXZ,
          scaleY,
          scaleXZ,
          1
        ])
      };
    });
    const palette = PROCEDURAL_PALETTE[kind];

    const uploadWithWindBounds = (geometry: readonly PlantPartMesh[]) => {
      const meshes = uploadProceduralPlantGeometry(root.engine, geometry);
      disposals.push(() => meshes.destroy());
      for (const { mesh, materialId } of meshes.parts) {
        const data = geometry.find((item) => item.materialId === materialId)!.mesh;
        let radius = 0;
        if (data.leafFrames) {
          data.positions.forEach((p, idx) => {
            radius = Math.max(radius, Math.hypot(...p.map((v, axis) => v - data.leafFrames![idx][axis])));
          });
        }
        expandProceduralTreeWindBounds(mesh, radius);
      }
      return meshes;
    };

    if (camera) {
      const ownerWorldPos = owner.transform.worldPosition;
      const originX = Number.isFinite(ownerWorldPos.x) ? ownerWorldPos.x : anchor.x;
      const originY = Number.isFinite(ownerWorldPos.y) ? ownerWorldPos.y : anchor.y;
      const originZ = Number.isFinite(ownerWorldPos.z) ? ownerWorldPos.z : anchor.z;
      const records: PlantLodInstanceRecord[] = positioned.map(({ entry }, index) => {
        const placement = transforms[index];
        return {
          placement: positioned[index],
          worldX: originX + placement.localX,
          centerY: originY + placement.base + placement.effectiveHeight * 0.55,
          worldZ: originZ + placement.localZ,
          radius: placement.radius,
          transform: placement.transform,
          explicitVariant: entry.variant,
          variantRandom: entry.variant === undefined ? settlementRandom(seed, `template-plant:${entry.id}`) : 0
        };
      });
      const kindOwner = owner.createChild(kind);
      const tiers: PlantLodTierPart[][] = [];
      for (const lod of plantLods) {
        const meshes = uploadWithWindBounds(lod.geometry);
        const tierParts: PlantLodTierPart[] = [];
        for (const part of meshes.parts) {
          const colors = palette[part.materialId];
          if (!colors) continue;
          const name = `${kind}/lod${lod.lodIndex}/${part.materialId}`;
          const storage = createTreeAssemblyInstanceStorage(root.engine, positioned.length);
          disposals.push(() => storage.instanceBuffer.destroy(true));
          const view = createTreeAssemblyInstancedMesh(
            root.engine,
            part.mesh,
            positioned.length,
            bounds,
            name,
            storage
          );
          disposals.push(() => view.mesh.destroy());
          const partEntity = kindOwner.createChild(name);
          const renderer = partEntity.addComponent(MeshRenderer);
          renderer.mesh = view.mesh;
          renderer.setMaterial(materials[part.materialId]);
          // Ground underbrush, grass tufts, and flower cushions receive cliff/tree shadows
          // without rasterizing hundreds of thousands of alpha-cutout triangles across directional shadow cascades.
          renderer.castShadows = false;
          renderer.receiveShadows = true;
          renderer.shaderData.enableMacro("RENDERER_ASSET_ASSEMBLY_INSTANCE");
          if (lod.canopyOcclusionSlots?.has(part.materialId)) {
            renderer.shaderData.enableMacro("RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION");
          }
          partEntity.isActive = false;
          const draw = new TemplatePlantDraw(renderer, view, kind, part.materialId);
          draws.push(draw);
          tierParts.push({ entity: partEntity, view, colors, draw });
        }
        tiers.push(tierParts);
      }
      const controller = kindOwner.addComponent(TemplatePlantCellLodController);
      controller.configure(camera, records, tiers, TEMPLATE_PLANT_LOD_POLICIES[kind]);
      continue;
    }

    const meshes = uploadWithWindBounds(primary.geometry);
    for (const part of meshes.parts) {
      const name = `${kind}/${part.materialId}`;
      const colors = palette[part.materialId];
      if (!colors) continue;
      const storage = createTreeAssemblyInstanceStorage(root.engine, positioned.length);
      disposals.push(() => storage.instanceBuffer.destroy(true));
      transforms.forEach(({ transform }, index) => {
        const offset = index * storage.recordFloats;
        const rawVariant =
          positioned[index].entry.variant ??
          Math.floor(settlementRandom(seed, `template-plant:${positioned[index].entry.id}`) * colors.length);
        const colorIndex = Math.abs(Math.trunc(rawVariant)) % colors.length;
        const color = colors[colorIndex];
        storage.staging.set(transform, offset);
        storage.staging[offset + 12] = color[0];
        storage.staging[offset + 13] = color[1];
        storage.staging[offset + 14] = color[2];
        storage.staging[offset + 15] = 1;
      });
      const view = createTreeAssemblyInstancedMesh(root.engine, part.mesh, positioned.length, bounds, name, storage);
      disposals.push(() => view.mesh.destroy());
      uploadTreeAssemblyInstances(view, positioned.length);
      const renderer = owner.createChild(name).addComponent(MeshRenderer);
      renderer.mesh = view.mesh;
      renderer.setMaterial(materials[part.materialId]);
      // Ground underbrush, grass tufts, and flower cushions receive cliff/tree shadows
      // without rasterizing 2.34M sub-pixel alpha-cutout triangles across directional shadow cascades.
      renderer.castShadows = false;
      renderer.receiveShadows = true;
      renderer.shaderData.enableMacro("RENDERER_ASSET_ASSEMBLY_INSTANCE");
      const draw = new TemplatePlantDraw(renderer, view, kind, part.materialId);
      positioned.forEach((plant, i) => draw.pack(i, plant));
      draws.push(draw);
      if (canopyOcclusionSlots?.has(part.materialId)) {
        renderer.shaderData.enableMacro("RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION");
      }
    }
  }
  disposals.push(() => {
    if (!owner.destroyed) owner.destroy();
  });
  let previous: VegetationColors | undefined;
  return {
    setLocalColors(colors: VegetationColors) {
      const changed = colors.changedSamples(previous);
      previous = colors;
      let dirty = false;
      for (const plant of placements) {
        if (!plant.sample || !changed(plant.sample)) continue;
        const foliage = colors.shaderCode(plant.sample, "foliageColorRgb") ?? 1;
        const bark = colors.shaderCode(plant.sample, "barkColorRgb") ?? 1;
        if (plant.foliagePigment !== foliage || plant.barkPigment !== bark) {
          plant.foliagePigment = foliage;
          plant.barkPigment = bark;
          dirty = true;
        }
      }
      if (dirty) for (const draw of draws) draw.updateColors();
    },
    visitPickBatches(visitor: SeedWorldPickVisitor) {
      for (const draw of draws) {
        if (
          draw.count &&
          draw.placements[0].sample &&
          draw.renderer.enabled &&
          draw.renderer.entity.isActiveInHierarchy
        )
          visitor(draw);
      }
    },
    dispose() {
      disposed = true;
      for (const destroy of disposals.reverse()) destroy();
    }
  };
}
