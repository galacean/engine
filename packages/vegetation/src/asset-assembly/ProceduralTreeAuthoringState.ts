import { resolveTreeStructureRecipe } from "./ProceduralTreeStructureToken";
import type { Texture2D } from "@galacean/engine";
import {
  decodePopulationToken,
  detachPopulationToken,
  encodePopulationToken,
  type TreePopulationTokenV1
} from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import {
  resolveTreeBillboardTuning,
  resolveTreeLeafCardTuning,
  resolveTreeLeafCountTuning,
  resolveTreeLeafLightingTuning,
  resolveTreeLeafMaskId,
  resolveTreeTrunkMaterialTuning,
  TREE_DISTRIBUTION_EXTENSION_ID,
  TREE_LEAF_LIGHTING_EXTENSION_ID,
  withTreeLeafLightingTuning,
  validatePopulationTokenSource,
  type TreeBillboardTuning,
  type TreeLeafCardTuning,
  type TreeLeafCountTuning,
  type TreeLeafLightingTuning,
  type TreeLeafMaskId,
  type TreeTrunkMaterialTuning
} from "./AssetAssemblyPresetFactory";
import type {
  AssetAssemblySourceLibrary,
  ProductionLodGroupProfile,
  TreeRecipeSource
} from "./AssetAssemblySourceLibrary";
import {
  createInstancedBirchPopulationVariationCatalog,
  INSTANCED_BIRCH_AUTHORED_VARIATION_CONTROLS,
  validateInstancedBirchVariationControls,
  type InstancedBirchPopulationVariation,
  type InstancedBirchVariationControls
} from "./InstancedBirchVariationRow";
import {
  createDefaultProceduralTreeDistributionTuning,
  PROCEDURAL_TREE_ALGORITHM,
  validateProceduralTreeDistributionTuning,
  type ProceduralTreeDistributionTuning
} from "./ProceduralTreeGenerator";
import {
  detachTreeDistributionTuning,
  resolveTreeDistributionTuning,
  withTreeDistributionTuning
} from "./ProceduralTreeDistributionToken";

/**
 * Version 2 starts from the last pre-push tree snapshot. Version 1 was written while trunk/branch persistence was
 * incomplete, so importing it would immediately reapply the short-trunk state this recovery is replacing.
 */
export const TREE_POPULATION_TOKEN_STORAGE_KEY = "asset-assembly.tree-population-token.v2";
/** Versioned browser authoring drafts. Production boot uses repository-owned canonical inputs instead. */
export const TREE_POPULATION_TOKEN_CATALOG_STORAGE_KEY = "asset-assembly.tree-population-token-catalog.v1";
/** Version 3 stores the recovered pre-push physical scales directly, so no runtime size conversion is required. */
export const TREE_VARIATION_STORAGE_KEY = "asset-assembly.instanced-birch-variations.v3";
export const TREE_VARIATION_GEOMETRY_STORAGE_KEY = "asset-assembly.instanced-birch-geometry.v2";
/** Minimal browser-storage contract kept outside the deterministic Token and runtime layers. */
export interface ProceduralTreeAuthoringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Fully resolved immutable input shared by Asset Assembly and every Seed World tree consumer. */
export interface ProceduralTreeRuntimeAuthoringProfile {
  readonly token: TreePopulationTokenV1;
  readonly recipe: TreeRecipeSource;
  readonly distributionTuning: ProceduralTreeDistributionTuning;
  readonly leafCountTuning: TreeLeafCountTuning;
  readonly leafCardTuning: TreeLeafCardTuning;
  readonly billboardTuning: TreeBillboardTuning;
  readonly leafLightingTuning: TreeLeafLightingTuning;
  readonly trunkMaterialTuning: TreeTrunkMaterialTuning | null;
  readonly leafMaskId: TreeLeafMaskId;
  readonly leafMask: Texture2D;
  /** Exact seven editable renderer-variation inputs owned by this recipe. */
  readonly variationControls: readonly InstancedBirchVariationControls[];
  readonly variations: readonly InstancedBirchPopulationVariation[];
  readonly sizeScale: number;
  readonly lodGroup: ProductionLodGroupProfile;
}

interface ResolvedProceduralTreeTokenState {
  readonly recipe: TreeRecipeSource;
  readonly distributionTuning: ProceduralTreeDistributionTuning;
  readonly leafCountTuning: TreeLeafCountTuning;
  readonly leafCardTuning: TreeLeafCardTuning;
  readonly billboardTuning: TreeBillboardTuning;
  readonly leafLightingTuning: TreeLeafLightingTuning;
  readonly trunkMaterialTuning: TreeTrunkMaterialTuning | null;
  readonly leafMaskId: TreeLeafMaskId;
  readonly leafMask: Texture2D;
}

interface InstancedBirchGeometryStateV1 {
  readonly algorithm: typeof PROCEDURAL_TREE_ALGORITHM;
  readonly tuning: ProceduralTreeDistributionTuning;
}

interface TreePopulationTokenCatalogV1 {
  readonly version: 1;
  readonly tokensByAssetId: Readonly<Record<string, string>>;
}

/** Deterministic repository-owned tree Token used when no explicit authoring draft is requested. */
export function createCanonicalTreePopulationToken(
  sourceLibrary: AssetAssemblySourceLibrary,
  fallback: TreePopulationTokenV1
): TreePopulationTokenV1 {
  return materializeTreeDistribution(sourceLibrary, fallback);
}

/** Deterministic seven-tree controls embedded in both local validation and published Seed World builds. */
export function createCanonicalInstancedBirchVariationControls(): readonly InstancedBirchVariationControls[] {
  return detachVariationControls(INSTANCED_BIRCH_AUTHORED_VARIATION_CONTROLS);
}

/** Repository-owned shared Birch geometry against which the seven canonical controls were authored. */
export function createCanonicalInstancedBirchGeometryDistribution(
  recipe: TreeRecipeSource
): ProceduralTreeDistributionTuning {
  return detachTreeDistributionTuning(
    recipe.proceduralRuntime?.distributionTuning ?? createDefaultProceduralTreeDistributionTuning(recipe)
  );
}

/**
 * Restores one validated tree Token and materializes its complete procedural distribution at the browser boundary.
 * Older Tokens omitted recipe-owned trunk/branch/twig values and therefore changed when their implicit fallback moved.
 */
export function restoreTreePopulationToken(
  sourceLibrary: AssetAssemblySourceLibrary,
  fallback: TreePopulationTokenV1,
  storage: ProceduralTreeAuthoringStorage | null = browserStorage()
): TreePopulationTokenV1 {
  try {
    const encoded = storage?.getItem(TREE_POPULATION_TOKEN_STORAGE_KEY);
    const token = encoded ? decodePopulationToken(encoded) : detachTreeToken(fallback);
    const restored = createCanonicalTreePopulationToken(sourceLibrary, token.category === "tree" ? token : fallback);
    persistTreePopulationToken(encodePopulationToken(restored), storage);
    return restored;
  } catch {
    const restored = createCanonicalTreePopulationToken(sourceLibrary, fallback);
    persistTreePopulationToken(encodePopulationToken(restored), storage);
    return restored;
  }
}

/**
 * Restores one exact Assembly-authored asset without changing Asset Assembly's currently selected tree.
 * A matching legacy current Token is migrated on first read; every other asset starts from its recipe fallback.
 */
export function restoreTreePopulationAssetToken(
  sourceLibrary: AssetAssemblySourceLibrary,
  fallback: TreePopulationTokenV1,
  storage: ProceduralTreeAuthoringStorage | null = browserStorage()
): TreePopulationTokenV1 {
  try {
    const catalogEncoded = readTreePopulationTokenCatalog(storage).tokensByAssetId[fallback.assetId];
    const legacyEncoded = storage?.getItem(TREE_POPULATION_TOKEN_STORAGE_KEY);
    const catalogToken = catalogEncoded ? decodeTreePopulationAssetToken(catalogEncoded, fallback.assetId) : null;
    const legacyToken =
      !catalogToken && legacyEncoded ? decodeTreePopulationAssetToken(legacyEncoded, fallback.assetId) : null;
    const restored = createCanonicalTreePopulationToken(sourceLibrary, catalogToken ?? legacyToken ?? fallback);
    persistTreePopulationAssetToken(encodePopulationToken(restored), storage);
    return restored;
  } catch {
    const restored = createCanonicalTreePopulationToken(sourceLibrary, fallback);
    persistTreePopulationAssetToken(encodePopulationToken(restored), storage);
    return restored;
  }
}

/** Persists the already encoded canonical pt1 value without introducing a second serialization format. */
export function persistTreePopulationToken(
  encoded: string,
  storage: ProceduralTreeAuthoringStorage | null = browserStorage()
): void {
  try {
    const token = decodeTreePopulationAssetToken(encoded);
    storage?.setItem(TREE_POPULATION_TOKEN_STORAGE_KEY, encoded);
    persistTreePopulationAssetToken(encodePopulationToken(token), storage);
  } catch {}
}

/** Stores one canonical tree Token in the shared per-asset catalog without changing the active Assembly selection. */
export function persistTreePopulationAssetToken(
  encoded: string,
  storage: ProceduralTreeAuthoringStorage | null = browserStorage()
): void {
  try {
    const token = decodeTreePopulationAssetToken(encoded);
    const catalog = readTreePopulationTokenCatalog(storage);
    const next: TreePopulationTokenCatalogV1 = {
      version: 1,
      tokensByAssetId: { ...catalog.tokensByAssetId, [token.assetId]: encodePopulationToken(token) }
    };
    storage?.setItem(TREE_POPULATION_TOKEN_CATALOG_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

/** Restores and detaches the complete seven-tree control set used by both preview and world population instances. */
export function restoreInstancedBirchVariationControls(
  storage: ProceduralTreeAuthoringStorage | null = browserStorage()
): readonly InstancedBirchVariationControls[] {
  try {
    const serialized = storage?.getItem(TREE_VARIATION_STORAGE_KEY);
    if (!serialized) {
      const recovered = createCanonicalInstancedBirchVariationControls();
      persistInstancedBirchVariationControls(recovered, storage);
      return recovered;
    }
    const controls = JSON.parse(serialized) as readonly InstancedBirchVariationControls[];
    validateInstancedBirchVariationControls(controls);
    return detachVariationControls(controls);
  } catch {
    return createCanonicalInstancedBirchVariationControls();
  }
}

/** Stores one validated seven-tree control set as browser authoring state. */
export function persistInstancedBirchVariationControls(
  controls: readonly InstancedBirchVariationControls[],
  storage: ProceduralTreeAuthoringStorage | null = browserStorage()
): void {
  validateInstancedBirchVariationControls(controls);
  try {
    storage?.setItem(TREE_VARIATION_STORAGE_KEY, JSON.stringify(detachVariationControls(controls)));
  } catch {}
}

/**
 * Restores the exact shared trunk/branch/twig geometry against which the seven instance controls were authored.
 * This is deliberately independent from the foreground tree Token: the artist tuned those two surfaces at
 * different times, and coupling them on reload changes the seven accepted silhouettes.
 */
export function restoreInstancedBirchGeometryDistribution(
  recipe: TreeRecipeSource,
  storage: ProceduralTreeAuthoringStorage | null = browserStorage()
): ProceduralTreeDistributionTuning {
  const fallback = createCanonicalInstancedBirchGeometryDistribution(recipe);
  try {
    const serialized = storage?.getItem(TREE_VARIATION_GEOMETRY_STORAGE_KEY);
    if (!serialized) {
      persistInstancedBirchGeometryDistribution(fallback, storage);
      return fallback;
    }
    const state = JSON.parse(serialized) as InstancedBirchGeometryStateV1;
    if (
      !state ||
      typeof state !== "object" ||
      state.algorithm !== PROCEDURAL_TREE_ALGORITHM ||
      !state.tuning ||
      typeof state.tuning !== "object" ||
      Array.isArray(state.tuning)
    ) {
      throw new Error("Instanced birch geometry state is unsupported");
    }
    validateProceduralTreeDistributionTuning(state.tuning);
    return detachTreeDistributionTuning(state.tuning);
  } catch {
    persistInstancedBirchGeometryDistribution(fallback, storage);
    return fallback;
  }
}

/** Stores one complete validated shared-geometry snapshot for all seven authored instances. */
export function persistInstancedBirchGeometryDistribution(
  tuning: ProceduralTreeDistributionTuning,
  storage: ProceduralTreeAuthoringStorage | null = browserStorage()
): void {
  validateProceduralTreeDistributionTuning(tuning);
  const state: InstancedBirchGeometryStateV1 = {
    algorithm: PROCEDURAL_TREE_ALGORITHM,
    tuning: detachTreeDistributionTuning(tuning)
  };
  try {
    storage?.setItem(TREE_VARIATION_GEOMETRY_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/** Compiles all persisted tree inputs once before any renderer allocates geometry, materials, or GPU storage. */
export function compileProceduralTreeRuntimeAuthoringProfile(
  sourceLibrary: AssetAssemblySourceLibrary,
  token: TreePopulationTokenV1,
  variationControls: readonly InstancedBirchVariationControls[],
  variationGeometryDistribution?: ProceduralTreeDistributionTuning
): ProceduralTreeRuntimeAuthoringProfile {
  const resolved = resolveProceduralTreeTokenState(sourceLibrary, token);
  const distributionTuning = variationGeometryDistribution
    ? detachTreeDistributionTuning(variationGeometryDistribution)
    : resolved.distributionTuning;
  validateProceduralTreeDistributionTuning(distributionTuning);
  const detachedToken = detachTreeToken(token);
  const sizeScale = detachedToken.sizePercent / 100;
  validateInstancedBirchVariationControls(variationControls);
  const variations = createInstancedBirchPopulationVariationCatalog(resolved.recipe, {
    controls: variationControls,
    baseAppearanceColor: detachedToken.colorRgb
  });
  return Object.freeze({
    token: detachedToken,
    ...resolved,
    distributionTuning,
    variationControls: detachVariationControls(variationControls),
    variations,
    sizeScale,
    lodGroup: Object.freeze({
      localReferencePoint: resolved.recipe.lodGroup.localReferencePoint.map((value) => value * sizeScale) as [
        number,
        number,
        number
      ],
      size: resolved.recipe.lodGroup.size * sizeScale,
      screenRelativeTransitionHeights: Object.freeze([...resolved.recipe.lodGroup.screenRelativeTransitionHeights])
    })
  });
}

function resolveProceduralTreeTokenState(
  sourceLibrary: AssetAssemblySourceLibrary,
  token: TreePopulationTokenV1
): ResolvedProceduralTreeTokenState {
  validatePopulationTokenSource(token, sourceLibrary);
  const recipe = sourceLibrary.treeRecipes.find((candidate) => candidate.id === token.assetId);
  if (!recipe) throw new Error("Procedural tree authoring Token requires one loaded recipe");
  const leafMaskId = resolveTreeLeafMaskId(token);
  return {
    recipe: resolveTreeStructureRecipe(recipe, token),
    distributionTuning: resolveTreeDistributionTuning(token, recipe),
    leafCountTuning: resolveTreeLeafCountTuning(token),
    leafCardTuning: resolveTreeLeafCardTuning(token),
    billboardTuning: resolveTreeBillboardTuning(token),
    leafLightingTuning: resolveTreeLeafLightingTuning(token),
    trunkMaterialTuning: resolveTreeTrunkMaterialTuning(token),
    leafMaskId,
    leafMask: resolveLeafMask(sourceLibrary, recipe, leafMaskId)
  };
}

function resolveLeafMask(
  sourceLibrary: AssetAssemblySourceLibrary,
  recipe: TreeRecipeSource,
  maskId: TreeLeafMaskId
): Texture2D {
  if (maskId === recipe.leafMaskId) return recipe.leafMask;
  const source = sourceLibrary.treeLeafMasks.find((candidate) => candidate.id === maskId);
  if (!source) throw new Error(`Tree leaf mask "${maskId}" is unavailable in the production catalog`);
  return source.texture;
}

function detachTreeToken(token: TreePopulationTokenV1): TreePopulationTokenV1 {
  return detachPopulationToken(token) as TreePopulationTokenV1;
}

/** Upgrades legacy runtime-tree Tokens from an implicit recipe fallback to one self-contained generator snapshot. */
function materializeTreeDistribution(
  sourceLibrary: AssetAssemblySourceLibrary,
  token: TreePopulationTokenV1
): TreePopulationTokenV1 {
  const detached = detachTreeToken(token);
  const resolved = resolveProceduralTreeTokenState(sourceLibrary, detached);
  if (!resolved.recipe.proceduralRuntime) return detached;
  let materialized = detached;
  if (!materialized.extensions.some((extension) => extension.id === TREE_DISTRIBUTION_EXTENSION_ID)) {
    materialized = withTreeDistributionTuning(materialized, resolved.distributionTuning);
  }
  if (
    !materialized.extensions.some((extension) => extension.id === TREE_LEAF_LIGHTING_EXTENSION_ID) &&
    resolved.recipe.defaultLeafLightingTuning
  ) {
    materialized = withTreeLeafLightingTuning(materialized, resolved.recipe.defaultLeafLightingTuning);
  }
  return materialized;
}

function readTreePopulationTokenCatalog(storage: ProceduralTreeAuthoringStorage | null): TreePopulationTokenCatalogV1 {
  try {
    const serialized = storage?.getItem(TREE_POPULATION_TOKEN_CATALOG_STORAGE_KEY);
    if (!serialized) return { version: 1, tokensByAssetId: {} };
    const parsed = JSON.parse(serialized) as TreePopulationTokenCatalogV1;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== 1 ||
      !parsed.tokensByAssetId ||
      typeof parsed.tokensByAssetId !== "object" ||
      Array.isArray(parsed.tokensByAssetId) ||
      Object.values(parsed.tokensByAssetId).some((encoded) => typeof encoded !== "string")
    ) {
      return { version: 1, tokensByAssetId: {} };
    }
    return parsed;
  } catch {
    return { version: 1, tokensByAssetId: {} };
  }
}

function decodeTreePopulationAssetToken(encoded: string, expectedAssetId?: string): TreePopulationTokenV1 {
  const token = decodePopulationToken(encoded);
  if (token.category !== "tree") throw new Error("Tree Population Token catalog only accepts tree Tokens");
  if (expectedAssetId !== undefined && token.assetId !== expectedAssetId) {
    throw new Error(`Tree Population Token asset "${token.assetId}" does not match "${expectedAssetId}"`);
  }
  return detachTreeToken(token);
}

function detachVariationControls(
  controls: readonly InstancedBirchVariationControls[]
): readonly InstancedBirchVariationControls[] {
  return controls.map((control) => ({
    ...control,
    leafColorRgb: [...control.leafColorRgb],
    barkColorRgb: [...control.barkColorRgb]
  })) as readonly InstancedBirchVariationControls[];
}

function browserStorage(): ProceduralTreeAuthoringStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
