import { TREE_STRUCTURE_EXTENSION_ID } from "./ProceduralTreeStructureToken";
import type {
  AssetCategory,
  AssetSeedColor,
  PopulationLayoutV1,
  PopulationTokenExtensionV1,
  PopulationTokenV1
} from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import type { AssetAssemblySourceLibrary } from "./AssetAssemblySourceLibrary";
import { PRODUCTION_ASSET_CATALOGS } from "./ProductionAssetCatalog";
import {
  DEFAULT_TREE_LEAF_COUNT_TUNING,
  validateTreeLeafCountTuning,
  type TreeLeafCountTuning
} from "./ProceduralTreeLeafCount";

export { DEFAULT_TREE_LEAF_COUNT_TUNING, type TreeLeafCountTuning } from "./ProceduralTreeLeafCount";

const CATALOG_ID = PRODUCTION_ASSET_CATALOGS[0].tokenCatalogId;
const CARTOON_DETAIL_CELL_MICROMETERS = 992_063;

/** Optional pt1 extension consumed by the procedural tree-card renderer. */
export const TREE_LEAF_CARD_EXTENSION_ID = "terrain/procedural-tree-leaf-card";
export const TREE_LEAF_CARD_PERCENT_MIN = 25;
export const TREE_LEAF_CARD_PERCENT_MAX = 300;
export const TREE_LEAF_COUNT_EXTENSION_ID = "terrain/procedural-tree-leaf-count";
export const TREE_LEAF_MASK_EXTENSION_ID = "terrain/procedural-tree-leaf-mask";
export const TREE_LEAF_MASK_IDS = ["leaf", "leaf2", "leaf3", "leaf4", "leaf5"] as const;
export type TreeLeafMaskId = (typeof TREE_LEAF_MASK_IDS)[number];
export const DEFAULT_TREE_LEAF_MASK_ID: TreeLeafMaskId = "leaf";
export const TREE_BILLBOARD_EXTENSION_ID = "terrain/procedural-tree-billboard";
export const TREE_LEAF_LIGHTING_EXTENSION_ID = "terrain/procedural-tree-leaf-lighting";
export const TREE_TRUNK_MATERIAL_EXTENSION_ID = "terrain/procedural-tree-trunk-material";
/** Complete deterministic trunk, branch, twig, and foliage generator input. */
export const TREE_DISTRIBUTION_EXTENSION_ID = "terrain/procedural-tree-distribution";
/** Sparse per-card states authored after deterministic procedural leaf placement. */
/** Complete records for only the primary/secondary branches explicitly edited by a user. */

/** Effective PBR inputs for the procedural trunk's authored base and normal textures. */
export interface TreeTrunkMaterialTuning {
  /** sRGB color-picker channels; converted to linear before reaching the shader. */
  readonly baseColorRgb: readonly [number, number, number];
  readonly tiling: number;
  readonly normalStrength: number;
  readonly smoothness: number;
  readonly metallic: number;
  readonly verticalGradientBottomColorRgb: readonly [number, number, number];
  readonly verticalGradientBottomStrength: number;
  readonly verticalGradientTopColorRgb: readonly [number, number, number];
  readonly verticalGradientTopStrength: number;
}

/** UE-compatible scalar inputs: Size/Inflate are centimeters, Scale is dimensionless. */
export interface TreeBillboardTuning {
  readonly billboardSize: number;
  readonly billboardsScale: number;
  readonly inflate: number;
}

export const DEFAULT_TREE_BILLBOARD_TUNING: TreeBillboardTuning = Object.freeze({
  billboardSize: 4,
  billboardsScale: 22,
  inflate: 1
});

/** Authored color, coverage, occlusion, and view-scattering terms for procedural leaves. */
export interface TreeLeafLightingTuning {
  /** Primary leaf albedo represented as editable sRGB8 channels. */
  readonly baseColorRgb: readonly [number, number, number];
  /** Secondary leaf albedo represented as editable sRGB8 channels. */
  readonly secondColorRgb: readonly [number, number, number];
  /** Transmitted-light tint represented as editable sRGB8 channels. */
  readonly translucencyColorRgb: readonly [number, number, number];
  /** Object-space height at which the linear secondary-color mask is anchored. */
  readonly secondColorLevel: number;
  /** Signed mask change per object-space meter. */
  readonly secondColorGradient: number;
  /** Linear multiplier applied to the sampled albedo before color compositing. */
  readonly albedoBrightness: number;
  /** Zero preserves sampled color; one converts it to luminance before color compositing. */
  readonly albedoDesaturation: number;
  /** Zero uses the authored base color; one uses the overlay-composited texture and base color. */
  readonly albedoTextureBlend: number;
  /** Fraction of procedural canopy visibility applied to indirect light and the far direct-shadow fallback. */
  readonly baseAoInfluence: number;
  /** Fraction of geometric grazing angle applied to alpha coverage. */
  readonly glancingAngleCut: number;
  /** Whether back-facing fragments invert their geometric and shading normals. */
  readonly flipBackfaceNormals: boolean;
  /** Multiplier applied to light transmitted through the leaf. */
  readonly translucencyIntensity: number;
  /** Fraction of procedural canopy visibility applied to the transmitted lobe. */
  readonly translucencyAoInfluence: number;
  /** Surface-normal contribution used to distort the transmitted-light direction. */
  readonly normalDistortion: number;
  /** Exponent controlling the contrast of the view-aligned transmitted-light lobe. */
  readonly scatteringExponent: number;
  /** Direct-light contribution to the transmitted lobe. */
  readonly directStrength: number;
  /** Environment-light contribution to the transmitted lobe. */
  readonly ambientStrength: number;
  /** Zero ignores direct-light shadows for transmission; one uses full shadow attenuation. */
  readonly shadowStrength: number;
}

/** Leaf-lighting defaults shared by the Token fallback and right-side panel. */
export const DEFAULT_TREE_LEAF_LIGHTING_TUNING: TreeLeafLightingTuning = Object.freeze({
  baseColorRgb: [95, 187, 65] as const,
  secondColorRgb: [197, 255, 90] as const,
  translucencyColorRgb: [238, 226, 145] as const,
  secondColorLevel: 0,
  secondColorGradient: -5,
  albedoBrightness: 1,
  albedoDesaturation: 1,
  albedoTextureBlend: 1,
  baseAoInfluence: 0.4,
  glancingAngleCut: 0.8,
  flipBackfaceNormals: false,
  translucencyIntensity: 15,
  translucencyAoInfluence: 0.9,
  normalDistortion: 0,
  scatteringExponent: 10,
  directStrength: 0.2,
  ambientStrength: 0.1,
  shadowStrength: 0.95
});

/** Independent dimensions applied to the Sapling-authored square-card baseline. */
export interface TreeLeafCardTuning {
  readonly lengthPercent: number;
  readonly widthPercent: number;
}

export const DEFAULT_TREE_LEAF_CARD_TUNING: TreeLeafCardTuning = Object.freeze({
  lengthPercent: 65,
  widthPercent: 100
});

/**
 * Creates the production Population Token for one Cartoon category.
 * @param category Asset family displayed by the page.
 * @param sourceLibrary Loaded immutable production catalog.
 * @returns Token containing one appearance, density policy, and local population layout.
 */
export function createDefaultPopulationToken(
  category: AssetCategory,
  sourceLibrary: AssetAssemblySourceLibrary
): PopulationTokenV1 {
  const common = {
    kind: "population" as const,
    schemaVersion: 1 as const,
    generatorVersion: 1 as const,
    category,
    catalogId: CATALOG_ID,
    rootSeed: categoryEntropy(category),
    sizePercent: 100,
    colorRgb: sourceColor(category, sourceLibrary),
    population: defaultPopulationLayout(category),
    extensions: []
  };
  switch (category) {
    case "tree": {
      const recipe = sourceLibrary.treeRecipes[0];
      let token: Extract<PopulationTokenV1, { readonly category: "tree" }> = {
        ...common,
        category,
        assetId: recipe.id,
        lodProfile: detachLodProfile(recipe.defaultLodProfile)
      };
      if (recipe.proceduralRuntime) {
        token = withTreeLeafCountTuning(token, recipe.proceduralRuntime.leafCountTuning);
        token = withTreeLeafCardTuning(token, recipe.proceduralRuntime.leafCardTuning);
        token = withTreeBillboardTuning(token, recipe.proceduralRuntime.billboardTuning);
      }
      if (recipe.defaultLeafLightingTuning) {
        token = withTreeLeafLightingTuning(token, recipe.defaultLeafLightingTuning);
      }
      return token;
    }
    case "shrub":
      return {
        ...common,
        category,
        assetId: sourceLibrary.shrub.id,
        lodProfile: detachLodProfile(sourceLibrary.shrub.defaultLodProfile)
      };
    case "grass":
      return {
        ...common,
        category,
        assetId: sourceLibrary.grass.id,
        lodProfile: detachLodProfile(sourceLibrary.grass.defaultLodProfile)
      };
    case "flower":
      return {
        ...common,
        category,
        assetId: sourceLibrary.flower.id,
        lodProfile: detachLodProfile(sourceLibrary.flower.defaultLodProfile)
      };
    case "rock":
      return {
        ...common,
        category,
        assetId: sourceLibrary.rock.id,
        lodProfile: detachLodProfile(sourceLibrary.rock.defaultLodProfile)
      };
  }
}

/**
 * Resolves every Token identity against the immutable production catalog.
 * @param token Decoded Population Token whose source fields must agree.
 * @param sourceLibrary Loaded production catalog resources.
 * @throws If the catalog, recipe, or Prefab ID is unknown or mismatched.
 */
export function validatePopulationTokenSource(
  token: PopulationTokenV1,
  sourceLibrary: AssetAssemblySourceLibrary
): void {
  if (token.catalogId !== CATALOG_ID) throw new Error("Population Token does not resolve to the Cartoon catalog");
  if (token.category === "tree") {
    const recipe = sourceLibrary.treeRecipes.find((candidate) => candidate.id === token.assetId);
    if (!recipe) {
      throw new Error("Tree Population Token does not resolve to one immutable production recipe");
    }
    if (token.lodProfile.values.length !== recipe.defaultLodProfile.values.length) {
      throw new Error("Tree Population Token LOD quantity count does not match its production recipe");
    }
    requireCatalogLodMetric(token, recipe.defaultLodProfile.metric);
    resolveTreeLeafCardTuning(token);
    resolveTreeLeafCountTuning(token);
    resolveTreeLeafMaskId(token);
    resolveTreeBillboardTuning(token);
    resolveTreeLeafLightingTuning(token);
    resolveTreeTrunkMaterialTuning(token);
    return;
  }
  if (token.category === "shrub") {
    if (token.assetId !== sourceLibrary.shrub.id) {
      throw new Error("Shrub Population Token does not resolve to one immutable production Prefab");
    }
    if (token.lodProfile.values.length !== sourceLibrary.shrub.lods.length) {
      throw new Error("Shrub Population Token LOD quantity count does not match its production layout");
    }
    requireCatalogLodMetric(token, sourceLibrary.shrub.defaultLodProfile.metric);
    return;
  }
  if (token.assetId !== sourceLibrary[token.category].id) {
    throw new Error(`${token.category} Population Token does not resolve to one immutable production Prefab`);
  }
  if (token.lodProfile.values.length !== sourceLibrary[token.category].lods.length) {
    throw new Error(`${token.category} Population Token LOD quantity count does not match its production Prefab`);
  }
  requireCatalogLodMetric(token, sourceLibrary[token.category].defaultLodProfile.metric);
}

/**
 * Switches one tree Token to another registered authored base-tree recipe.
 * @param token Current tree Population Token.
 * @param assetId Target recipe identity.
 * @param sourceLibrary Loaded production catalog.
 * @returns Detached Token with the recipe's authored color and LOD policy.
 */
export function withTreePopulationAsset(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>,
  assetId: string,
  sourceLibrary: AssetAssemblySourceLibrary
): Extract<PopulationTokenV1, { readonly category: "tree" }> {
  const recipe = sourceLibrary.treeRecipes.find((candidate) => candidate.id === assetId);
  if (!recipe) throw new Error(`Production tree recipe "${assetId}" is unavailable`);
  const recipeOwnedExtensionIds = new Set([
    TREE_STRUCTURE_EXTENSION_ID,
    TREE_DISTRIBUTION_EXTENSION_ID,
    TREE_LEAF_COUNT_EXTENSION_ID,
    TREE_LEAF_CARD_EXTENSION_ID,
    TREE_BILLBOARD_EXTENSION_ID,
    TREE_LEAF_LIGHTING_EXTENSION_ID
  ]);
  let switched: Extract<PopulationTokenV1, { readonly category: "tree" }> = {
    ...token,
    assetId: recipe.id,
    colorRgb: [...recipe.defaultColorRgb] as AssetSeedColor,
    lodProfile: {
      metric: recipe.defaultLodProfile.metric,
      values: [...recipe.defaultLodProfile.values]
    },
    extensions: token.extensions.filter((extension) => !recipeOwnedExtensionIds.has(extension.id))
  };
  if (recipe.proceduralRuntime) {
    switched = withTreeLeafCountTuning(switched, recipe.proceduralRuntime.leafCountTuning);
    switched = withTreeLeafCardTuning(switched, recipe.proceduralRuntime.leafCardTuning);
    switched = withTreeBillboardTuning(switched, recipe.proceduralRuntime.billboardTuning);
  }
  if (recipe.defaultLeafLightingTuning) {
    switched = withTreeLeafLightingTuning(switched, recipe.defaultLeafLightingTuning);
  }
  return switched;
}

/** Resolves and validates the optional procedural leaf-card dimensions in one tree Token. */
export function resolveTreeLeafCardTuning(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>
): TreeLeafCardTuning {
  const extension = token.extensions.find((candidate) => candidate.id === TREE_LEAF_CARD_EXTENSION_ID);
  if (!extension) return { ...DEFAULT_TREE_LEAF_CARD_TUNING };
  if (extension.version !== 1 || extension.required) {
    throw new Error("Tree leaf-card extension version or requirement is unsupported");
  }
  if (!extension.data || typeof extension.data !== "object" || Array.isArray(extension.data)) {
    throw new Error("Tree leaf-card extension data must be an object");
  }
  const data = extension.data as Record<string, unknown>;
  const keys = Object.keys(data).sort();
  if (keys.length !== 2 || keys[0] !== "lengthPercent" || keys[1] !== "widthPercent") {
    throw new Error("Tree leaf-card extension data contains unsupported fields");
  }
  const tuning = {
    lengthPercent: data.lengthPercent,
    widthPercent: data.widthPercent
  } as TreeLeafCardTuning;
  validateTreeLeafCardTuning(tuning);
  return tuning;
}

/** Replaces the leaf-card extension while leaving layout, seed, recipe, and LOD policy unchanged. */
export function withTreeLeafCardTuning(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>,
  tuning: TreeLeafCardTuning
): Extract<PopulationTokenV1, { readonly category: "tree" }> {
  validateTreeLeafCardTuning(tuning);
  const remaining = token.extensions.filter((extension) => extension.id !== TREE_LEAF_CARD_EXTENSION_ID);
  if (
    tuning.lengthPercent === DEFAULT_TREE_LEAF_CARD_TUNING.lengthPercent &&
    tuning.widthPercent === DEFAULT_TREE_LEAF_CARD_TUNING.widthPercent
  ) {
    return { ...token, extensions: remaining };
  }
  const extension: PopulationTokenExtensionV1 = {
    id: TREE_LEAF_CARD_EXTENSION_ID,
    version: 1,
    required: false,
    data: {
      lengthPercent: tuning.lengthPercent,
      widthPercent: tuning.widthPercent
    }
  };
  return { ...token, extensions: [...remaining, extension] };
}

/** Resolves exact per-tree card counts for the four procedural crown LODs. */
export function resolveTreeLeafCountTuning(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>
): TreeLeafCountTuning {
  const extension = token.extensions.find((candidate) => candidate.id === TREE_LEAF_COUNT_EXTENSION_ID);
  if (!extension) return { ...DEFAULT_TREE_LEAF_COUNT_TUNING };
  if (![1, 2].includes(extension.version) || extension.required) {
    throw new Error("Tree leaf-count extension version or requirement is unsupported");
  }
  if (!extension.data || typeof extension.data !== "object" || Array.isArray(extension.data)) {
    throw new Error("Tree leaf-count extension data must be an object");
  }
  const data = extension.data as Record<string, unknown>;
  const keys = Object.keys(data).sort();
  const legacyV1 =
    extension.version === 1 &&
    keys.length === 3 &&
    keys[0] === "lod0Count" &&
    keys[1] === "lod1Count" &&
    keys[2] === "lod2Count";
  const currentV2 =
    extension.version === 2 &&
    keys.length === 4 &&
    keys[0] === "lod0Count" &&
    keys[1] === "lod1Count" &&
    keys[2] === "lod2Count" &&
    keys[3] === "lod3Count";
  if (!legacyV1 && !currentV2) {
    throw new Error("Tree leaf-count extension data contains unsupported fields");
  }
  const tuning = {
    lod0Count: data.lod0Count,
    lod1Count: data.lod1Count,
    lod2Count: data.lod2Count,
    lod3Count:
      legacyV1 && typeof data.lod2Count === "number"
        ? Math.min(data.lod2Count, DEFAULT_TREE_LEAF_COUNT_TUNING.lod3Count)
        : data.lod3Count
  } as TreeLeafCountTuning;
  validateTreeLeafCountTuning(tuning);
  return tuning;
}

/** Replaces exact procedural crown LOD card counts without changing tree population layout. */
export function withTreeLeafCountTuning(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>,
  tuning: TreeLeafCountTuning
): Extract<PopulationTokenV1, { readonly category: "tree" }> {
  validateTreeLeafCountTuning(tuning);
  const remaining = token.extensions.filter((extension) => extension.id !== TREE_LEAF_COUNT_EXTENSION_ID);
  if (
    tuning.lod0Count === DEFAULT_TREE_LEAF_COUNT_TUNING.lod0Count &&
    tuning.lod1Count === DEFAULT_TREE_LEAF_COUNT_TUNING.lod1Count &&
    tuning.lod2Count === DEFAULT_TREE_LEAF_COUNT_TUNING.lod2Count &&
    tuning.lod3Count === DEFAULT_TREE_LEAF_COUNT_TUNING.lod3Count
  ) {
    return { ...token, extensions: remaining };
  }
  const extension: PopulationTokenExtensionV1 = {
    id: TREE_LEAF_COUNT_EXTENSION_ID,
    version: 2,
    required: false,
    data: {
      lod0Count: tuning.lod0Count,
      lod1Count: tuning.lod1Count,
      lod2Count: tuning.lod2Count,
      lod3Count: tuning.lod3Count
    }
  };
  return { ...token, extensions: [...remaining, extension] };
}

/** Resolves and validates the optional procedural Alpha-Test mask identity in one tree Token. */
export function resolveTreeLeafMaskId(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>
): TreeLeafMaskId {
  const extension = token.extensions.find((candidate) => candidate.id === TREE_LEAF_MASK_EXTENSION_ID);
  if (!extension) return DEFAULT_TREE_LEAF_MASK_ID;
  if (extension.version !== 1 || extension.required) {
    throw new Error("Tree leaf-mask extension version or requirement is unsupported");
  }
  if (!extension.data || typeof extension.data !== "object" || Array.isArray(extension.data)) {
    throw new Error("Tree leaf-mask extension data must be an object");
  }
  const data = extension.data as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.length !== 1 || keys[0] !== "maskId" || !isTreeLeafMaskId(data.maskId)) {
    throw new Error("Tree leaf-mask extension data contains an unsupported maskId");
  }
  return data.maskId;
}

/** Replaces only the procedural Alpha-Test mask extension. */
export function withTreeLeafMask(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>,
  maskId: TreeLeafMaskId
): Extract<PopulationTokenV1, { readonly category: "tree" }> {
  if (!isTreeLeafMaskId(maskId)) throw new Error(`Tree leaf mask "${maskId}" is unavailable`);
  const remaining = token.extensions.filter((extension) => extension.id !== TREE_LEAF_MASK_EXTENSION_ID);
  if (maskId === DEFAULT_TREE_LEAF_MASK_ID) return { ...token, extensions: remaining };
  const extension: PopulationTokenExtensionV1 = {
    id: TREE_LEAF_MASK_EXTENSION_ID,
    version: 1,
    required: false,
    data: { maskId }
  };
  return { ...token, extensions: [...remaining, extension] };
}

/** Runtime-safe identity check shared by the Token codec boundary and UI API. */
export function isTreeLeafMaskId(value: unknown): value is TreeLeafMaskId {
  return typeof value === "string" && (TREE_LEAF_MASK_IDS as readonly string[]).includes(value);
}

/** Resolves and validates the optional artist-tuned material billboard controls. */
export function resolveTreeBillboardTuning(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>
): TreeBillboardTuning {
  const extension = token.extensions.find((candidate) => candidate.id === TREE_BILLBOARD_EXTENSION_ID);
  if (!extension) return { ...DEFAULT_TREE_BILLBOARD_TUNING };
  if (extension.version !== 1 || extension.required) {
    throw new Error("Tree billboard extension version or requirement is unsupported");
  }
  if (!extension.data || typeof extension.data !== "object" || Array.isArray(extension.data)) {
    throw new Error("Tree billboard extension data must be an object");
  }
  const data = extension.data as Record<string, unknown>;
  const keys = Object.keys(data).sort();
  if (keys.length !== 3 || keys[0] !== "billboardSize" || keys[1] !== "billboardsScale" || keys[2] !== "inflate") {
    throw new Error("Tree billboard extension data contains unsupported fields");
  }
  const tuning = {
    billboardSize: data.billboardSize,
    billboardsScale: data.billboardsScale,
    inflate: data.inflate
  } as TreeBillboardTuning;
  validateTreeBillboardTuning(tuning);
  return tuning;
}

/** Replaces only the material billboard controls in one tree Token. */
export function withTreeBillboardTuning(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>,
  tuning: TreeBillboardTuning
): Extract<PopulationTokenV1, { readonly category: "tree" }> {
  validateTreeBillboardTuning(tuning);
  const remaining = token.extensions.filter((extension) => extension.id !== TREE_BILLBOARD_EXTENSION_ID);
  if (
    tuning.billboardSize === DEFAULT_TREE_BILLBOARD_TUNING.billboardSize &&
    tuning.billboardsScale === DEFAULT_TREE_BILLBOARD_TUNING.billboardsScale &&
    tuning.inflate === DEFAULT_TREE_BILLBOARD_TUNING.inflate
  ) {
    return { ...token, extensions: remaining };
  }
  const extension: PopulationTokenExtensionV1 = {
    id: TREE_BILLBOARD_EXTENSION_ID,
    version: 1,
    required: false,
    data: {
      billboardSize: tuning.billboardSize,
      billboardsScale: tuning.billboardsScale,
      inflate: tuning.inflate
    }
  };
  return { ...token, extensions: [...remaining, extension] };
}

/** Resolves and validates the optional procedural leaf-transmission controls. */
export function resolveTreeLeafLightingTuning(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>
): TreeLeafLightingTuning {
  const extension = token.extensions.find((candidate) => candidate.id === TREE_LEAF_LIGHTING_EXTENSION_ID);
  if (!extension) return detachTreeLeafLightingTuning(DEFAULT_TREE_LEAF_LIGHTING_TUNING);
  if ((extension.version !== 3 && extension.version !== 4) || extension.required) {
    throw new Error("Tree leaf-lighting extension version or requirement is unsupported");
  }
  if (!extension.data || typeof extension.data !== "object" || Array.isArray(extension.data)) {
    throw new Error("Tree leaf-lighting extension data must be an object");
  }
  const data = extension.data as Record<string, unknown>;
  const keys = Object.keys(data).sort();
  const expectedKeys =
    extension.version === 3
      ? [
          "backlightThreshold",
          "baseColorRgb",
          "energyScale",
          "normalWrap",
          "secondColorGradient",
          "secondColorLevel",
          "secondColorRgb",
          "shadowStrength",
          "translucencyColorRgb",
          "translucencyIntensity"
        ]
      : [
          "albedoBrightness",
          "albedoDesaturation",
          "albedoTextureBlend",
          "ambientStrength",
          "baseAoInfluence",
          "baseColorRgb",
          "directStrength",
          "flipBackfaceNormals",
          "glancingAngleCut",
          "normalDistortion",
          "scatteringExponent",
          "secondColorGradient",
          "secondColorLevel",
          "secondColorRgb",
          "shadowStrength",
          "translucencyAoInfluence",
          "translucencyColorRgb",
          "translucencyIntensity"
        ];
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error("Tree leaf-lighting extension data contains unsupported fields");
  }
  const tuning = {
    baseColorRgb: data.baseColorRgb,
    secondColorRgb: data.secondColorRgb,
    translucencyColorRgb: data.translucencyColorRgb,
    secondColorLevel: data.secondColorLevel,
    secondColorGradient: data.secondColorGradient,
    albedoBrightness:
      extension.version === 4 ? data.albedoBrightness : DEFAULT_TREE_LEAF_LIGHTING_TUNING.albedoBrightness,
    albedoDesaturation:
      extension.version === 4 ? data.albedoDesaturation : DEFAULT_TREE_LEAF_LIGHTING_TUNING.albedoDesaturation,
    albedoTextureBlend:
      extension.version === 4 ? data.albedoTextureBlend : DEFAULT_TREE_LEAF_LIGHTING_TUNING.albedoTextureBlend,
    baseAoInfluence: extension.version === 4 ? data.baseAoInfluence : DEFAULT_TREE_LEAF_LIGHTING_TUNING.baseAoInfluence,
    glancingAngleCut:
      extension.version === 4 ? data.glancingAngleCut : DEFAULT_TREE_LEAF_LIGHTING_TUNING.glancingAngleCut,
    flipBackfaceNormals:
      extension.version === 4 ? data.flipBackfaceNormals : DEFAULT_TREE_LEAF_LIGHTING_TUNING.flipBackfaceNormals,
    translucencyIntensity: data.translucencyIntensity,
    translucencyAoInfluence:
      extension.version === 4
        ? data.translucencyAoInfluence
        : DEFAULT_TREE_LEAF_LIGHTING_TUNING.translucencyAoInfluence,
    normalDistortion:
      extension.version === 4 ? data.normalDistortion : DEFAULT_TREE_LEAF_LIGHTING_TUNING.normalDistortion,
    scatteringExponent:
      extension.version === 4 ? data.scatteringExponent : DEFAULT_TREE_LEAF_LIGHTING_TUNING.scatteringExponent,
    directStrength: extension.version === 4 ? data.directStrength : DEFAULT_TREE_LEAF_LIGHTING_TUNING.directStrength,
    ambientStrength: extension.version === 4 ? data.ambientStrength : DEFAULT_TREE_LEAF_LIGHTING_TUNING.ambientStrength,
    shadowStrength: data.shadowStrength
  } as TreeLeafLightingTuning;
  validateTreeLeafLightingTuning(tuning);
  return detachTreeLeafLightingTuning(tuning);
}

/** Replaces only the procedural leaf-lighting controls in one tree Token. */
export function withTreeLeafLightingTuning(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>,
  tuning: TreeLeafLightingTuning
): Extract<PopulationTokenV1, { readonly category: "tree" }> {
  validateTreeLeafLightingTuning(tuning);
  const remaining = token.extensions.filter((extension) => extension.id !== TREE_LEAF_LIGHTING_EXTENSION_ID);
  if (treeLeafLightingTuningsEqual(tuning, DEFAULT_TREE_LEAF_LIGHTING_TUNING)) {
    return { ...token, extensions: remaining };
  }
  const extension: PopulationTokenExtensionV1 = {
    id: TREE_LEAF_LIGHTING_EXTENSION_ID,
    version: 4,
    required: false,
    data: {
      baseColorRgb: [...tuning.baseColorRgb],
      secondColorRgb: [...tuning.secondColorRgb],
      translucencyColorRgb: [...tuning.translucencyColorRgb],
      secondColorLevel: tuning.secondColorLevel,
      secondColorGradient: tuning.secondColorGradient,
      albedoBrightness: tuning.albedoBrightness,
      albedoDesaturation: tuning.albedoDesaturation,
      albedoTextureBlend: tuning.albedoTextureBlend,
      baseAoInfluence: tuning.baseAoInfluence,
      glancingAngleCut: tuning.glancingAngleCut,
      flipBackfaceNormals: tuning.flipBackfaceNormals,
      translucencyIntensity: tuning.translucencyIntensity,
      translucencyAoInfluence: tuning.translucencyAoInfluence,
      normalDistortion: tuning.normalDistortion,
      scatteringExponent: tuning.scatteringExponent,
      directStrength: tuning.directStrength,
      ambientStrength: tuning.ambientStrength,
      shadowStrength: tuning.shadowStrength
    }
  };
  return { ...token, extensions: [...remaining, extension] };
}

/** Resolves an explicitly authored trunk-material override, or null to retain the active recipe material. */
export function resolveTreeTrunkMaterialTuning(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>
): TreeTrunkMaterialTuning | null {
  const extension = token.extensions.find((candidate) => candidate.id === TREE_TRUNK_MATERIAL_EXTENSION_ID);
  if (!extension) return null;
  if ((extension.version !== 1 && extension.version !== 2 && extension.version !== 3) || extension.required) {
    throw new Error("Tree trunk-material extension version or requirement is unsupported");
  }
  if (!extension.data || typeof extension.data !== "object" || Array.isArray(extension.data)) {
    throw new Error("Tree trunk-material extension data must be an object");
  }
  const data = extension.data as Record<string, unknown>;
  const keys = Object.keys(data).sort();
  const expectedKeys =
    extension.version === 1
      ? ["baseColorRgb", "metallic", "normalStrength", "smoothness", "tiling"]
      : extension.version === 2
        ? ["baseColorRgb", "metallic", "normalStrength", "smoothness", "tiling", "verticalGradientStrength"]
        : [
            "baseColorRgb",
            "metallic",
            "normalStrength",
            "smoothness",
            "tiling",
            "verticalGradientBottomColorRgb",
            "verticalGradientBottomStrength",
            "verticalGradientTopColorRgb",
            "verticalGradientTopStrength"
          ];
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error("Tree trunk-material extension data contains unsupported fields");
  }
  const tuning = {
    baseColorRgb: data.baseColorRgb,
    tiling: data.tiling,
    normalStrength: data.normalStrength,
    smoothness: data.smoothness,
    metallic: data.metallic,
    verticalGradientBottomColorRgb:
      extension.version === 3 ? data.verticalGradientBottomColorRgb : ([255, 255, 255] as const),
    verticalGradientBottomStrength: extension.version === 3 ? data.verticalGradientBottomStrength : 0,
    verticalGradientTopColorRgb: extension.version === 3 ? data.verticalGradientTopColorRgb : ([0, 0, 0] as const),
    verticalGradientTopStrength:
      extension.version === 1
        ? 0
        : extension.version === 2
          ? data.verticalGradientStrength
          : data.verticalGradientTopStrength
  } as TreeTrunkMaterialTuning;
  validateTreeTrunkMaterialTuning(tuning);
  return detachTreeTrunkMaterialTuning(tuning);
}

/** Serializes one explicit trunk-material override without changing geometry or population placement. */
export function withTreeTrunkMaterialTuning(
  token: Extract<PopulationTokenV1, { readonly category: "tree" }>,
  tuning: TreeTrunkMaterialTuning
): Extract<PopulationTokenV1, { readonly category: "tree" }> {
  validateTreeTrunkMaterialTuning(tuning);
  const remaining = token.extensions.filter((extension) => extension.id !== TREE_TRUNK_MATERIAL_EXTENSION_ID);
  const extension: PopulationTokenExtensionV1 = {
    id: TREE_TRUNK_MATERIAL_EXTENSION_ID,
    version: 3,
    required: false,
    data: {
      baseColorRgb: [...tuning.baseColorRgb],
      tiling: tuning.tiling,
      normalStrength: tuning.normalStrength,
      smoothness: tuning.smoothness,
      metallic: tuning.metallic,
      verticalGradientBottomColorRgb: [...tuning.verticalGradientBottomColorRgb],
      verticalGradientBottomStrength: tuning.verticalGradientBottomStrength,
      verticalGradientTopColorRgb: [...tuning.verticalGradientTopColorRgb],
      verticalGradientTopStrength: tuning.verticalGradientTopStrength
    }
  };
  return { ...token, extensions: [...remaining, extension] };
}

function defaultPopulationLayout(category: AssetCategory): PopulationLayoutV1 {
  const profile =
    category === "tree"
      ? { extentCells: [32, 32] as const, cellSizeMicrometers: 3_800_000 }
      : category === "shrub"
        ? { extentCells: [32, 32] as const, cellSizeMicrometers: 2_300_000 }
        : category === "grass" || category === "flower"
          ? { extentCells: [6, 6] as const, cellSizeMicrometers: CARTOON_DETAIL_CELL_MICROMETERS }
          : { extentCells: [8, 8] as const, cellSizeMicrometers: 1_400_000 };
  const layoutAlgorithm =
    category === "rock"
      ? "centered-pairs-v1"
      : category === "grass" || category === "flower"
        ? "stratified-jitter-v1"
        : "cell-slot-v1";
  return {
    mode: "standard",
    ...profile,
    layoutAlgorithm
  };
}

function categoryEntropy(category: AssetCategory): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < category.length; index++) {
    hash ^= category.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function sourceColor(category: AssetCategory, sourceLibrary: AssetAssemblySourceLibrary): AssetSeedColor {
  const source = category === "tree" ? sourceLibrary.treeRecipes[0] : sourceLibrary[category];
  return [...source.defaultColorRgb] as AssetSeedColor;
}

function detachLodProfile(profile: PopulationTokenV1["lodProfile"]): PopulationTokenV1["lodProfile"] {
  return { metric: profile.metric, values: [...profile.values] };
}

function requireCatalogLodMetric(token: PopulationTokenV1, expected: PopulationTokenV1["lodProfile"]["metric"]): void {
  if (token.lodProfile.metric !== expected) {
    throw new Error(`Population Token LOD metric does not match ${token.assetId}`);
  }
}

function validateTreeLeafCardTuning(tuning: TreeLeafCardTuning): void {
  for (const [label, value] of [
    ["lengthPercent", tuning.lengthPercent],
    ["widthPercent", tuning.widthPercent]
  ] as const) {
    if (!Number.isInteger(value) || value < TREE_LEAF_CARD_PERCENT_MIN || value > TREE_LEAF_CARD_PERCENT_MAX) {
      throw new RangeError(
        `Tree leaf-card ${label} must be an integer within ${TREE_LEAF_CARD_PERCENT_MIN}..${TREE_LEAF_CARD_PERCENT_MAX}`
      );
    }
  }
}

function validateTreeBillboardTuning(tuning: TreeBillboardTuning): void {
  for (const [label, value] of [
    ["billboardSize", tuning.billboardSize],
    ["billboardsScale", tuning.billboardsScale],
    ["inflate", tuning.inflate]
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`Tree billboard ${label} must be finite`);
    }
  }
}

/** Validates the complete procedural-tree leaf material contract used by authoring UIs and runtimes. */
export function validateTreeLeafLightingTuning(tuning: TreeLeafLightingTuning): void {
  for (const [label, color] of [
    ["baseColorRgb", tuning.baseColorRgb],
    ["secondColorRgb", tuning.secondColorRgb],
    ["translucencyColorRgb", tuning.translucencyColorRgb]
  ] as const) {
    if (
      !Array.isArray(color) ||
      color.length !== 3 ||
      color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)
    ) {
      throw new RangeError(`Tree leaf-lighting ${label} must contain three uint8 sRGB channels`);
    }
  }
  for (const [label, value] of [
    ["secondColorLevel", tuning.secondColorLevel],
    ["secondColorGradient", tuning.secondColorGradient],
    ["albedoBrightness", tuning.albedoBrightness],
    ["albedoDesaturation", tuning.albedoDesaturation],
    ["albedoTextureBlend", tuning.albedoTextureBlend],
    ["baseAoInfluence", tuning.baseAoInfluence],
    ["glancingAngleCut", tuning.glancingAngleCut],
    ["translucencyIntensity", tuning.translucencyIntensity],
    ["translucencyAoInfluence", tuning.translucencyAoInfluence],
    ["normalDistortion", tuning.normalDistortion],
    ["scatteringExponent", tuning.scatteringExponent],
    ["directStrength", tuning.directStrength],
    ["ambientStrength", tuning.ambientStrength],
    ["shadowStrength", tuning.shadowStrength]
  ] as const) {
    if (!Number.isFinite(value)) throw new RangeError(`Tree leaf-lighting ${label} must be finite`);
  }
  if (typeof tuning.flipBackfaceNormals !== "boolean") {
    throw new TypeError("Tree leaf-lighting flipBackfaceNormals must be boolean");
  }
  if (tuning.albedoBrightness < 0 || tuning.albedoBrightness > 5) {
    throw new RangeError("Tree leaf-lighting albedoBrightness must be between 0 and 5");
  }
  if (tuning.translucencyIntensity < 0 || tuning.translucencyIntensity > 50) {
    throw new RangeError("Tree leaf-lighting translucencyIntensity must be between 0 and 50");
  }
  if (tuning.scatteringExponent < 1 || tuning.scatteringExponent > 50) {
    throw new RangeError("Tree leaf-lighting scatteringExponent must be between 1 and 50");
  }
  for (const [label, value] of [
    ["albedoDesaturation", tuning.albedoDesaturation],
    ["albedoTextureBlend", tuning.albedoTextureBlend],
    ["baseAoInfluence", tuning.baseAoInfluence],
    ["glancingAngleCut", tuning.glancingAngleCut],
    ["translucencyAoInfluence", tuning.translucencyAoInfluence],
    ["normalDistortion", tuning.normalDistortion],
    ["directStrength", tuning.directStrength],
    ["ambientStrength", tuning.ambientStrength],
    ["shadowStrength", tuning.shadowStrength]
  ] as const) {
    if (value < 0 || value > 1) {
      throw new RangeError(`Tree leaf-lighting ${label} must be between 0 and 1`);
    }
  }
}

function validateTreeTrunkMaterialTuning(tuning: TreeTrunkMaterialTuning): void {
  for (const [label, color] of [
    ["baseColorRgb", tuning.baseColorRgb],
    ["verticalGradientBottomColorRgb", tuning.verticalGradientBottomColorRgb],
    ["verticalGradientTopColorRgb", tuning.verticalGradientTopColorRgb]
  ] as const) {
    if (
      !Array.isArray(color) ||
      color.length !== 3 ||
      color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)
    ) {
      throw new RangeError(`Tree trunk-material ${label} must contain three uint8 sRGB channels`);
    }
  }
  for (const [label, value, minimum, maximum] of [
    ["tiling", tuning.tiling, 0.01, 64],
    ["normalStrength", tuning.normalStrength, 0, 8],
    ["smoothness", tuning.smoothness, 0, 1],
    ["metallic", tuning.metallic, 0, 1],
    ["verticalGradientBottomStrength", tuning.verticalGradientBottomStrength, 0, 8],
    ["verticalGradientTopStrength", tuning.verticalGradientTopStrength, 0, 8]
  ] as const) {
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new RangeError(`Tree trunk-material ${label} must be between ${minimum} and ${maximum}`);
    }
  }
}

function detachTreeTrunkMaterialTuning(tuning: TreeTrunkMaterialTuning): TreeTrunkMaterialTuning {
  return {
    ...tuning,
    baseColorRgb: [...tuning.baseColorRgb],
    verticalGradientBottomColorRgb: [...tuning.verticalGradientBottomColorRgb],
    verticalGradientTopColorRgb: [...tuning.verticalGradientTopColorRgb]
  };
}

function detachTreeLeafLightingTuning(tuning: TreeLeafLightingTuning): TreeLeafLightingTuning {
  return {
    ...tuning,
    baseColorRgb: [...tuning.baseColorRgb],
    secondColorRgb: [...tuning.secondColorRgb],
    translucencyColorRgb: [...tuning.translucencyColorRgb]
  };
}

function treeLeafLightingTuningsEqual(left: TreeLeafLightingTuning, right: TreeLeafLightingTuning): boolean {
  return (
    left.baseColorRgb.every((channel, index) => channel === right.baseColorRgb[index]) &&
    left.secondColorRgb.every((channel, index) => channel === right.secondColorRgb[index]) &&
    left.translucencyColorRgb.every((channel, index) => channel === right.translucencyColorRgb[index]) &&
    left.secondColorLevel === right.secondColorLevel &&
    left.secondColorGradient === right.secondColorGradient &&
    left.albedoBrightness === right.albedoBrightness &&
    left.albedoDesaturation === right.albedoDesaturation &&
    left.albedoTextureBlend === right.albedoTextureBlend &&
    left.baseAoInfluence === right.baseAoInfluence &&
    left.glancingAngleCut === right.glancingAngleCut &&
    left.flipBackfaceNormals === right.flipBackfaceNormals &&
    left.translucencyIntensity === right.translucencyIntensity &&
    left.translucencyAoInfluence === right.translucencyAoInfluence &&
    left.normalDistortion === right.normalDistortion &&
    left.scatteringExponent === right.scatteringExponent &&
    left.directStrength === right.directStrength &&
    left.ambientStrength === right.ambientStrength &&
    left.shadowStrength === right.shadowStrength
  );
}
