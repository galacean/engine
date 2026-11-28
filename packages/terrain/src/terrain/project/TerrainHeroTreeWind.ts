import { AssetType, Engine, Entity, Material, MeshRenderer, Vector4 } from "@galacean/engine";
import type { TerrainProjectResolvedGeometry, TerrainProjectResolvedRenderer } from "./TerrainProjectAsset";
import {
  TERRAIN_BRANCH_WIND_RESPONSE_PROFILE,
  terrainHeroTreeCalibratedComplianceGain,
  TERRAIN_HERO_TREE_PRIMARY_RESPONSE_PROFILES,
  type TerrainHeroTreeWindCalibrationKey,
  type TerrainTreeWindResponseProfile
} from "./TerrainWindResponseProfiles";
import {
  cloneTerrainTreeWindResponseControls,
  type TerrainTreeWindResponseControls
} from "./TerrainTreeWindResponseControls";
import { TerrainTreeMechanicalGpuData, type TerrainTreeMechanicalDepth } from "./TerrainTreeMechanicalGpuData";

export const TERRAIN_HERO_TREE_FAR_SLOD_SCREEN_HEIGHT = 0.25;
export const TERRAIN_HERO_TREE_BRANCH_MATERIAL_URL = "Material/Vegetation/broadleaf-branches.mat";

const HERO_TREE_HIERARCHY_MACRO = "MATERIAL_WIND_HERO_TREE_HIERARCHY";
const HERO_TREE_ATTACHMENT_MACRO = "MATERIAL_WIND_HERO_TREE_ATTACHMENT";
const HERO_TREE_FULL_FIDELITY_LOD_MACRO = "MATERIAL_WIND_FULL_FIDELITY_LOD";
const HERO_TREE_REDUCED_WIND_SLOD_MACRO = "MATERIAL_WIND_SLOD_REDUCED";
const HERO_TREE_FAR_WIND_SLOD_MACRO = "MATERIAL_WIND_SLOD_FAR";
const HERO_TREE_DEPTH_MACROS = [
  "MATERIAL_WIND_MECHANICAL_DEPTH_0",
  "MATERIAL_WIND_MECHANICAL_DEPTH_1",
  "MATERIAL_WIND_MECHANICAL_DEPTH_2",
  "MATERIAL_WIND_MECHANICAL_DEPTH_3"
] as const;
const HERO_TREE_NORMAL_MACROS = [
  "MATERIAL_WIND_NORMAL_NONE",
  "MATERIAL_WIND_NORMAL_TRUNK",
  "MATERIAL_WIND_NORMAL_PARENT",
  "MATERIAL_WIND_NORMAL_HIERARCHICAL"
] as const;

const COLLAPSED_STAGE1_REMAINING_LEVER_RATIO = 0.62;
const COLLAPSED_STAGE2_REMAINING_LEVER_RATIO = 0.34;

/**
 * LOD2 keeps the primary cantilever only. Convert the deleted branch hierarchy's maximum crown
 * travel into an equivalent primary-mode angle, so mesh simplification does not remove load
 * response. This is a displacement-equivalence ratio, not an LOD-specific wind multiplier.
 */
export function terrainHeroTreeFarAggregateGain(
  preset: Readonly<TerrainHeroTreeResponsePreset>,
  primaryProfile: Readonly<TerrainTreeWindResponseProfile>,
  rootBendScale = 1
): number {
  const retainedPrimaryTravel = Math.max(
    primaryProfile.maximumBendRadians * preset.rootBendScale * rootBendScale * Math.max(preset.trunkMode[1], 0),
    1e-4
  );
  const collapsedBranchTravel =
    TERRAIN_BRANCH_WIND_RESPONSE_PROFILE.maximumBendRadians *
    (preset.hierarchy[0] * COLLAPSED_STAGE1_REMAINING_LEVER_RATIO +
      preset.hierarchy[1] * COLLAPSED_STAGE2_REMAINING_LEVER_RATIO);
  return 1 + collapsedBranchTravel / retainedPrimaryTravel;
}

export interface TerrainHeroTreeWindAsset {
  readonly id: string;
  readonly label: string;
  readonly prefab: string;
  readonly calibration: TerrainHeroTreeWindCalibrationKey;
  readonly mechanicalData: string;
}

export interface TerrainHeroTreeResponsePreset {
  readonly key: TerrainHeroTreeWindCalibrationKey;
  readonly rootBendScale: number;
  readonly windForce: number;
  readonly trunkWavesScale: number;
  readonly leafWavesScale: number;
  readonly trunkFlowDensity: number;
  readonly leafFlowDensity: number;
  /** Full-response height, primary spatial gain, maximum bend radians, root-rigidity contrast. */
  readonly trunkMode: readonly [number, number, number, number];
  /** Secondary gain, tip gain, nonlinear-load blend, delayed energy gain. */
  readonly hierarchy: readonly [number, number, number, number];
  /** Maximum adherence, tumble amplitude, twist amplitude, twitch amplitude in radians. */
  readonly leafMotion: readonly [number, number, number, number];
  /** Natural-frequency scale, phase propagation, drag reconfiguration, energy-to-bend. */
  readonly species: readonly [number, number, number, number];
}

export interface TerrainHeroTreeLodMaterials {
  readonly trunk: Material;
  readonly leaf: Material;
  readonly mechanicalDepth: 0 | 1 | 2 | 3;
  readonly windSlod: TerrainHeroTreeWindSlod;
}

export interface TerrainHeroTreeMaterials {
  readonly calibration: TerrainHeroTreeWindCalibrationKey;
  readonly lods: readonly TerrainHeroTreeLodMaterials[];
}

export type TerrainHeroTreeWindSlod = "full" | "reduced" | "far";

const TERRAIN_HERO_TREE_WIND_SLODS = ["full", "reduced", "far"] as const satisfies readonly TerrainHeroTreeWindSlod[];
const TERRAIN_HERO_TREE_MECHANICAL_DEPTHS = [3, 1, 0] as const;

export interface TerrainHeroTreeWindSlodBinding {
  readonly windSlod: TerrainHeroTreeWindSlod;
  readonly mechanicalDepth: 0 | 1 | 2 | 3;
}

/**
 * Resolves compile-time Wind SLOD independently from the tree's authored topology depth.
 *
 * `.treewind` always stores four transform texels per element. Its per-LOD depth is descriptive:
 * missing hierarchy stages carry zero weight/identity data, so a Full depth-3 program safely
 * consumes an asset whose actual topology ends at depth 2. Only the segment count is contractual.
 */
export function resolveTerrainHeroTreeWindSlodBindings(
  geometryLodCount: number,
  authoredMechanicalDepths: readonly TerrainTreeMechanicalDepth[]
): readonly TerrainHeroTreeWindSlodBinding[] {
  if (
    geometryLodCount !== TERRAIN_HERO_TREE_WIND_SLODS.length ||
    authoredMechanicalDepths.length !== geometryLodCount
  ) {
    throw new Error(
      `Hero tree requires ${TERRAIN_HERO_TREE_WIND_SLODS.length} geometry/mechanical LOD segments, received ${geometryLodCount}/${authoredMechanicalDepths.length}`
    );
  }
  return TERRAIN_HERO_TREE_WIND_SLODS.map((windSlod, lodIndex) => ({
    windSlod,
    mechanicalDepth: TERRAIN_HERO_TREE_MECHANICAL_DEPTHS[lodIndex]
  }));
}

export const TERRAIN_HERO_TREE_WIND_ASSETS = [
  {
    id: "broadleaf-large-1",
    label: "阔叶大树 1",
    prefab: "Prefab/Prototype/tree-broadleaf-large-1.prefab",
    calibration: "broadleaf-large",
    mechanicalData: "Models/1adfe9392d9a2aac.treewind"
  },
  {
    id: "broadleaf-large-2",
    label: "阔叶大树 2",
    prefab: "Prefab/Prototype/tree-broadleaf-large-2.prefab",
    calibration: "broadleaf-large",
    mechanicalData: "Models/a53cfc7956d1f311.treewind"
  },
  {
    id: "broadleaf-medium-1",
    label: "阔叶中树 1",
    prefab: "Prefab/Prototype/tree-broadleaf-medium-1.prefab",
    calibration: "broadleaf-medium",
    mechanicalData: "Models/efd966152697c274.treewind"
  },
  {
    id: "broadleaf-medium-2",
    label: "阔叶中树 2",
    prefab: "Prefab/Prototype/tree-broadleaf-medium-2.prefab",
    calibration: "broadleaf-medium",
    mechanicalData: "Models/d166cc5e0e841bb6.treewind"
  },
  {
    id: "birch-large-1",
    label: "白桦大树 1",
    prefab: "Prefab/Prototype/tree-birch-large-1.prefab",
    calibration: "birch-large",
    mechanicalData: "Models/8fcd8b5a84cbb2a1.treewind"
  },
  {
    id: "birch-large-2",
    label: "白桦大树 2",
    prefab: "Prefab/Prototype/tree-birch-large-2.prefab",
    calibration: "birch-large",
    mechanicalData: "Models/e5d9d5383c2f51e1.treewind"
  },
  {
    id: "birch-medium-1",
    label: "白桦中树 1",
    prefab: "Prefab/Prototype/tree-birch-medium-1.prefab",
    calibration: "birch-medium",
    mechanicalData: "Models/93131963d3f57feb.treewind"
  },
  {
    id: "birch-medium-2",
    label: "白桦中树 2",
    prefab: "Prefab/Prototype/tree-birch-medium-2.prefab",
    calibration: "birch-medium",
    mechanicalData: "Models/90fa81dde0531841.treewind"
  }
] as const satisfies readonly TerrainHeroTreeWindAsset[];

export type TerrainHeroTreeWindAssetId = (typeof TERRAIN_HERO_TREE_WIND_ASSETS)[number]["id"];

/** Exact mechanical source selected by each production Asset Assembly tree recipe. */
export const TERRAIN_HERO_TREE_WIND_RECIPE_ASSETS = Object.freeze({
  "cartoon/tree/broadleaf-large/v1": "broadleaf-large-1",
  "cartoon/tree/broadleaf-medium/v1": "broadleaf-medium-2",
  "cartoon/tree/birch-large/v1": "birch-large-1",
  "cartoon/tree/birch-medium/v1": "birch-medium-2"
} as const satisfies Readonly<Record<string, TerrainHeroTreeWindAssetId>>);

export interface TerrainHeroTreeRecipeLodSource {
  readonly trunk: Readonly<{ readonly renderer: Readonly<{ readonly material: Material }> }>;
  readonly crown: Readonly<{ readonly renderer: Readonly<{ readonly material: Material }> }>;
}

interface TerrainHeroTreeMaterialLodSource {
  readonly trunk: Readonly<{ readonly material: Material }>;
  readonly crown: Readonly<{ readonly material: Material }>;
}

export const TERRAIN_HERO_TREE_RESPONSE_PRESETS: Readonly<
  Record<TerrainHeroTreeWindCalibrationKey, TerrainHeroTreeResponsePreset>
> = {
  "broadleaf-large": {
    key: "broadleaf-large",
    rootBendScale: 0.82,
    windForce: 0.5,
    trunkWavesScale: 0.24,
    leafWavesScale: 0.82,
    trunkFlowDensity: 1.25,
    leafFlowDensity: 1.1,
    trunkMode: [14, 0.9, 0.14, 0.4],
    hierarchy: [0.46, 0.32, 0.9, 0.88],
    leafMotion: [0.7, 0.1, 0.055, 0.032],
    species: [0.96, 0.58, 0.38, 0.32]
  },
  "broadleaf-medium": {
    key: "broadleaf-medium",
    rootBendScale: 0.86,
    windForce: 0.53,
    trunkWavesScale: 0.27,
    leafWavesScale: 0.88,
    trunkFlowDensity: 1.18,
    leafFlowDensity: 1.05,
    trunkMode: [10.6, 0.95, 0.15, 0.4],
    hierarchy: [0.5, 0.35, 0.88, 0.8],
    leafMotion: [0.74, 0.11, 0.06, 0.035],
    species: [1.08, 0.64, 0.34, 0.29]
  },
  "birch-large": {
    key: "birch-large",
    rootBendScale: 0.9,
    windForce: 0.56,
    trunkWavesScale: 0.3,
    leafWavesScale: 0.94,
    trunkFlowDensity: 1.08,
    leafFlowDensity: 0.98,
    trunkMode: [13.3, 1, 0.16, 0.4],
    hierarchy: [0.54, 0.39, 0.84, 0.72],
    leafMotion: [0.78, 0.125, 0.07, 0.04],
    species: [1.2, 0.7, 0.31, 0.26]
  },
  "birch-medium": {
    key: "birch-medium",
    rootBendScale: 0.94,
    windForce: 0.59,
    trunkWavesScale: 0.33,
    leafWavesScale: 1,
    trunkFlowDensity: 1.02,
    leafFlowDensity: 0.94,
    trunkMode: [11.3, 1.05, 0.17, 0.4],
    hierarchy: [0.58, 0.43, 0.8, 0.66],
    leafMotion: [0.82, 0.14, 0.08, 0.045],
    species: [1.34, 0.76, 0.28, 0.23]
  }
};

/** Shared owner of the accepted production-tree mechanical textures and Material variants. */
export class TerrainHeroTreeWindMaterialLibrary {
  private readonly _mechanicalData = new Map<TerrainHeroTreeWindAssetId, TerrainTreeMechanicalGpuData>();
  private readonly _materials = new Map<TerrainHeroTreeWindAssetId, TerrainHeroTreeMaterials>();
  private readonly _ownedMaterials: Material[] = [];
  private _controls = cloneTerrainTreeWindResponseControls();
  private _lockedMeanDirectionWS: readonly [number, number, number] = [1, 0, 0];
  private _destroyed = false;

  private constructor(
    private readonly _branchTemplate: Material,
    mechanicalData: ReadonlyMap<TerrainHeroTreeWindAssetId, TerrainTreeMechanicalGpuData>
  ) {
    for (const [assetId, data] of mechanicalData) this._mechanicalData.set(assetId, data);
  }

  static async load(
    engine: Engine,
    assetIds: readonly TerrainHeroTreeWindAssetId[] = TERRAIN_HERO_TREE_WIND_ASSETS.map((asset) => asset.id)
  ): Promise<TerrainHeroTreeWindMaterialLibrary> {
    const uniqueIds = [...new Set(assetIds)];
    const assets = uniqueIds.map((assetId) => requireTerrainHeroTreeWindAsset(assetId));
    const results = await Promise.allSettled([
      engine.resourceManager.load<Material>({ type: AssetType.Material, url: TERRAIN_HERO_TREE_BRANCH_MATERIAL_URL }),
      ...assets.map((asset) => TerrainTreeMechanicalGpuData.load(engine, asset.mechanicalData))
    ]);
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) {
      for (let index = 0; index < results.length; index++) {
        const result = results[index];
        if (result.status !== "fulfilled") continue;
        if (index === 0) (result.value as Material).destroy();
        else (result.value as TerrainTreeMechanicalGpuData).destroy();
      }
      throw failure.reason;
    }
    const branchTemplate = (results[0] as PromiseFulfilledResult<Material>).value;
    const mechanicalEntries = assets.map(
      (asset, index) =>
        [asset.id, (results[index + 1] as PromiseFulfilledResult<TerrainTreeMechanicalGpuData>).value] as const
    );
    return new TerrainHeroTreeWindMaterialLibrary(branchTemplate, new Map(mechanicalEntries));
  }

  getAssetForPrefab(prefabUrl: string): (typeof TERRAIN_HERO_TREE_WIND_ASSETS)[number] | null {
    return TERRAIN_HERO_TREE_WIND_ASSETS.find((asset) => asset.prefab === prefabUrl) ?? null;
  }

  getMaterials(
    prefabUrl: string,
    lods: readonly { readonly renderers: readonly TerrainProjectResolvedRenderer[] }[]
  ): TerrainHeroTreeMaterials {
    this._assertAlive();
    const asset = this.getAssetForPrefab(prefabUrl);
    if (!asset) throw new Error(`Hero tree Prefab has no mechanical-data contract: ${prefabUrl}`);
    if (lods.length !== 3 || lods.some((lod) => lod.renderers.length !== 2)) {
      throw new Error(`Hero tree ${asset.id} requires one trunk and one leaf Renderer per LOD`);
    }
    return this._getOrCreateMaterials(
      asset,
      lods.map((lod) => ({ trunk: lod.renderers[0], crown: lod.renderers[1] }))
    );
  }

  /**
   * Resolves P3 Material variants for one Asset Assembly recipe without instantiating its source Prefabs.
   * Seed World batches keep their existing shared instance buffers while consuming the same mechanical atlas
   * and LOD response contract as production hero-tree instances.
   */
  getRecipeMaterials(recipeId: string, lods: readonly TerrainHeroTreeRecipeLodSource[]): TerrainHeroTreeMaterials {
    this._assertAlive();
    const asset = requireTerrainHeroTreeWindRecipeAsset(recipeId);
    if (lods.length !== 3) throw new Error(`Hero tree recipe ${recipeId} requires exactly three geometry LODs`);
    return this._getOrCreateMaterials(
      asset,
      lods.map((lod) => ({ trunk: lod.trunk.renderer, crown: lod.crown.renderer }))
    );
  }

  private _getOrCreateMaterials(
    asset: (typeof TERRAIN_HERO_TREE_WIND_ASSETS)[number],
    lods: readonly TerrainHeroTreeMaterialLodSource[]
  ): TerrainHeroTreeMaterials {
    const existing = this._materials.get(asset.id);
    if (existing) return existing;
    const mechanicalData = this._mechanicalData.get(asset.id);
    if (!mechanicalData) throw new Error(`Hero tree ${asset.id} mechanical data was not loaded`);
    const preset = TERRAIN_HERO_TREE_RESPONSE_PRESETS[asset.calibration];
    const primaryProfile = TERRAIN_HERO_TREE_PRIMARY_RESPONSE_PROFILES[asset.calibration];
    const slodBindings = resolveTerrainHeroTreeWindSlodBindings(lods.length, mechanicalData.lodMechanicalDepths);
    const heroLods = lods.map((lod, lodIndex) => {
      const { mechanicalDepth, windSlod } = slodBindings[lodIndex];
      const trunk = lod.trunk.material.clone();
      const leaf = lod.crown.material.clone();
      if (windSlod === "far") {
        configureTerrainHeroTreeFarMaterial(trunk, this._branchTemplate, preset, primaryProfile, false);
        configureTerrainHeroTreeFarMaterial(leaf, this._branchTemplate, preset, primaryProfile, true);
      } else {
        configureTerrainHeroTreeWindMaterial(
          trunk,
          this._branchTemplate,
          preset,
          primaryProfile,
          mechanicalData,
          mechanicalDepth as 1 | 2 | 3,
          false,
          windSlod
        );
        configureTerrainHeroTreeWindMaterial(
          leaf,
          this._branchTemplate,
          preset,
          primaryProfile,
          mechanicalData,
          mechanicalDepth as 1 | 2 | 3,
          true,
          windSlod
        );
      }
      trunk.name = `wind-tree:${preset.key}:lod${lodIndex}:${windSlod}:depth${mechanicalDepth}:branch`;
      leaf.name = `wind-tree:${preset.key}:lod${lodIndex}:${windSlod}:depth${mechanicalDepth}:leaf`;
      return { trunk, leaf, mechanicalDepth, windSlod };
    });
    const materials: TerrainHeroTreeMaterials = {
      calibration: preset.key,
      lods: heroLods
    };
    applyTerrainHeroTreeResponseControls(materials, preset, this._controls, this._lockedMeanDirectionWS);
    this._ownedMaterials.push(...heroLods.flatMap((lod) => [lod.trunk, lod.leaf]));
    this._materials.set(asset.id, materials);
    return materials;
  }

  /** Applies full/reduced/far production wind variants without allocating Materials per instance. */
  bindProductionInstance(instance: Entity, geometry: TerrainProjectResolvedGeometry, prefabUrl: string): boolean {
    const asset = this.getAssetForPrefab(prefabUrl);
    if (!asset) return false;
    if (geometry.kind !== "lod-group") {
      throw new Error(`Hero tree ${asset.id} requires authored LODGroup geometry`);
    }
    const materials = this.getMaterials(prefabUrl, geometry.lodGroup.lods);
    geometry.lodGroup.lods.forEach((lod, lodIndex) => {
      const selected = materials.lods[lodIndex];
      resolveTerrainHeroTreeRenderer(instance, lod.renderers[0], asset.id).setMaterial(selected.trunk);
      resolveTerrainHeroTreeRenderer(instance, lod.renderers[1], asset.id).setMaterial(selected.leaf);
    });
    return true;
  }

  setResponseControls(
    controls: Readonly<TerrainTreeWindResponseControls>,
    lockedMeanDirectionWS: readonly [number, number, number]
  ): void {
    this._assertAlive();
    this._controls = cloneTerrainTreeWindResponseControls(controls);
    this._lockedMeanDirectionWS = [...lockedMeanDirectionWS];
    for (const materials of this._materials.values()) {
      applyTerrainHeroTreeResponseControls(
        materials,
        TERRAIN_HERO_TREE_RESPONSE_PRESETS[materials.calibration],
        this._controls,
        this._lockedMeanDirectionWS
      );
    }
  }

  destroy(): void {
    if (this._destroyed) return;
    for (const material of this._ownedMaterials) material.destroy();
    this._ownedMaterials.length = 0;
    this._materials.clear();
    for (const data of this._mechanicalData.values()) data.destroy();
    this._mechanicalData.clear();
    this._branchTemplate.destroy();
    this._destroyed = true;
  }

  private _assertAlive(): void {
    if (this._destroyed) throw new Error("Terrain Hero tree wind Material library has been destroyed");
  }
}

export function resolveTerrainHeroTreeRenderer(
  root: Entity,
  binding: TerrainProjectResolvedRenderer,
  id: string
): MeshRenderer {
  let entity: Entity | undefined = root;
  for (const childIndex of binding.entityPath) entity = entity.children[childIndex];
  if (!entity) throw new Error(`Hero tree ${id} Renderer path is invalid`);
  const renderers: MeshRenderer[] = [];
  entity.getComponents(MeshRenderer, renderers);
  const renderer = renderers[binding.componentIndex];
  if (!renderer) throw new Error(`Hero tree ${id} Renderer selector is invalid`);
  return renderer;
}

export function configureTerrainHeroTreeWindMaterial(
  material: Material,
  branchTemplate: Material,
  preset: Readonly<TerrainHeroTreeResponsePreset>,
  primaryProfile: Readonly<TerrainTreeWindResponseProfile>,
  mechanicalData: TerrainTreeMechanicalGpuData,
  mechanicalDepth: 1 | 2 | 3,
  leaf: boolean,
  windSlod: Exclude<TerrainHeroTreeWindSlod, "far">
): void {
  material.shader = branchTemplate.shader;
  material.shaderData.disableMacro("MATERIAL_ENABLE_COVERAGE");
  material.shaderData.enableMacro("MATERIAL_ENABLE_WIND");
  material.shaderData.enableMacro(HERO_TREE_HIERARCHY_MACRO);
  material.shaderData.disableMacro(HERO_TREE_FAR_WIND_SLOD_MACRO);
  if (windSlod === "full") {
    material.shaderData.enableMacro(HERO_TREE_FULL_FIDELITY_LOD_MACRO);
    material.shaderData.disableMacro(HERO_TREE_REDUCED_WIND_SLOD_MACRO);
  } else {
    material.shaderData.disableMacro(HERO_TREE_FULL_FIDELITY_LOD_MACRO);
    material.shaderData.enableMacro(HERO_TREE_REDUCED_WIND_SLOD_MACRO);
  }
  if (leaf) {
    material.shaderData.enableMacro("MATERIAL_VEGETATION_CLIMATE_LEAF");
    material.shaderData.disableMacro("MATERIAL_VEGETATION_CLIMATE_BRANCH");
    material.shaderData.enableMacro(HERO_TREE_ATTACHMENT_MACRO);
  } else {
    material.shaderData.disableMacro("MATERIAL_VEGETATION_CLIMATE_LEAF");
    material.shaderData.enableMacro("MATERIAL_VEGETATION_CLIMATE_BRANCH");
    material.shaderData.disableMacro(HERO_TREE_ATTACHMENT_MACRO);
  }
  for (const macro of HERO_TREE_DEPTH_MACROS) material.shaderData.disableMacro(macro);
  for (const macro of HERO_TREE_NORMAL_MACROS) material.shaderData.disableMacro(macro);
  material.shaderData.enableMacro(HERO_TREE_DEPTH_MACROS[mechanicalDepth]);
  material.shaderData.enableMacro(HERO_TREE_NORMAL_MACROS[mechanicalDepth]);
  material.shaderData.setFloat(
    "material_AlphaCutoff",
    leaf ? (material.shaderData.getFloat("material_AlphaCutoff") ?? 0.5) : 0
  );
  material.shaderData.setFloat("material_LightingFlatness", 0);
  material.shaderData.setFloat("material_WindForce", preset.windForce);
  material.shaderData.setFloat("material_WindWavesScale", leaf ? preset.leafWavesScale : preset.trunkWavesScale);
  material.shaderData.setFloat("material_WindFlowDensity", leaf ? preset.leafFlowDensity : preset.trunkFlowDensity);
  material.shaderData.setFloat("material_UVBaseLock", 0);
  material.shaderData.setFloat("material_GrassDistanceFadeEnable", 0);
  material.shaderData.setVector4("material_WindHierarchyParams", new Vector4(...preset.hierarchy));
  material.shaderData.setVector4("material_WindLeafMotionParams", new Vector4(...preset.leafMotion));
  material.shaderData.setVector4("material_WindSpeciesParams", new Vector4(...preset.species));
  material.shaderData.setVector4("material_WindTrunkModeParams", new Vector4(...preset.trunkMode));
  material.shaderData.setFloat(
    "material_WindTreeComplianceGain",
    terrainHeroTreeCalibratedComplianceGain(primaryProfile)
  );
  material.shaderData.setVector4(
    "material_WindTreePrimaryParams",
    new Vector4(
      primaryProfile.naturalFrequencyHz,
      primaryProfile.dampingRatio,
      primaryProfile.maximumBendRadians * preset.rootBendScale,
      1
    )
  );
  mechanicalData.bind(material);
}

export function configureTerrainHeroTreeFarMaterial(
  material: Material,
  branchTemplate: Material,
  preset: Readonly<TerrainHeroTreeResponsePreset>,
  primaryProfile: Readonly<TerrainTreeWindResponseProfile>,
  leaf: boolean
): void {
  material.shader = branchTemplate.shader;
  material.shaderData.enableMacro("MATERIAL_ENABLE_WIND");
  material.shaderData.enableMacro(HERO_TREE_FAR_WIND_SLOD_MACRO);
  material.shaderData.disableMacro(HERO_TREE_FULL_FIDELITY_LOD_MACRO);
  material.shaderData.disableMacro(HERO_TREE_REDUCED_WIND_SLOD_MACRO);
  // LOD2 retains the shared low-frequency GPU state, one continuous crown mode and a root-pinned
  // leaf-cluster mode. Per-branch mechanical fetches, high-frequency leaf motion and back-light
  // translucency are compiled out.
  material.shaderData.disableMacro("MATERIAL_ENABLE_TRANSLUCENCY");
  material.shaderData.disableMacro(HERO_TREE_HIERARCHY_MACRO);
  material.shaderData.disableMacro(HERO_TREE_ATTACHMENT_MACRO);
  for (const macro of HERO_TREE_DEPTH_MACROS) material.shaderData.disableMacro(macro);
  for (const macro of HERO_TREE_NORMAL_MACROS) material.shaderData.disableMacro(macro);
  material.shaderData.enableMacro(HERO_TREE_DEPTH_MACROS[0]);
  material.shaderData.enableMacro(HERO_TREE_NORMAL_MACROS[0]);
  material.shaderData.disableMacro("MATERIAL_ENABLE_COVERAGE");
  if (leaf) {
    material.shaderData.enableMacro("MATERIAL_VEGETATION_CLIMATE_LEAF");
    material.shaderData.disableMacro("MATERIAL_VEGETATION_CLIMATE_BRANCH");
  } else {
    material.shaderData.disableMacro("MATERIAL_VEGETATION_CLIMATE_LEAF");
    material.shaderData.enableMacro("MATERIAL_VEGETATION_CLIMATE_BRANCH");
    material.shaderData.setFloat("material_AlphaCutoff", 0);
  }
  material.shaderData.setFloat("material_LightingFlatness", 0);
  material.shaderData.setFloat("material_WindForce", preset.windForce);
  material.shaderData.setFloat("material_WindWavesScale", 0);
  material.shaderData.setFloat("material_WindFlowDensity", 0);
  material.shaderData.setFloat("material_GrassDistanceFadeEnable", 0);
  material.shaderData.setVector4("material_WindTrunkModeParams", new Vector4(...preset.trunkMode));
  material.shaderData.setFloat(
    "material_WindTreeComplianceGain",
    terrainHeroTreeCalibratedComplianceGain(primaryProfile)
  );
  material.shaderData.setVector4(
    "material_WindTreePrimaryParams",
    new Vector4(
      primaryProfile.naturalFrequencyHz,
      primaryProfile.dampingRatio,
      primaryProfile.maximumBendRadians * preset.rootBendScale,
      terrainHeroTreeFarAggregateGain(preset, primaryProfile)
    )
  );
}

export function applyTerrainHeroTreeResponseControls(
  materials: Readonly<TerrainHeroTreeMaterials>,
  preset: Readonly<TerrainHeroTreeResponsePreset>,
  controls: Readonly<TerrainTreeWindResponseControls>,
  lockedMeanDirectionWS: readonly [number, number, number]
): void {
  const forcing = controls.forcing;
  const structure = controls.structure;
  const foliage = controls.foliage;
  const tuning = controls.tuning;
  const primaryProfile = TERRAIN_HERO_TREE_PRIMARY_RESPONSE_PROFILES[preset.key];
  const calibratedComplianceGain = terrainHeroTreeCalibratedComplianceGain(primaryProfile);
  const apply = (material: Material, windSlod: TerrainHeroTreeWindSlod): void => {
    material.shaderData.setVector4(
      "material_WindInputWeights",
      new Vector4(forcing.meanLoad, forcing.gustPackets, forcing.turbulenceSpectrum, forcing.localField)
    );
    material.shaderData.setVector4(
      "material_WindStructureWeights",
      new Vector4(
        structure.primaryMode * structure.continuousTrunk,
        structure.primaryBranches,
        structure.secondaryBranches,
        structure.phasePropagation
      )
    );
    material.shaderData.setVector4(
      "material_WindAerodynamicWeights",
      new Vector4(
        structure.elasticRecovery,
        structure.dragReconfiguration,
        forcing.directionVariation,
        forcing.meanDirectionTracking
      )
    );
    material.shaderData.setVector4(
      "material_WindLockedDirectionWS",
      new Vector4(lockedMeanDirectionWS[0], lockedMeanDirectionWS[1], lockedMeanDirectionWS[2], 0)
    );
    material.shaderData.setVector4(
      "material_WindFoliageWeights",
      new Vector4(foliage.directionalAdherence, foliage.tumble, foliage.twist, foliage.twitch)
    );
    material.shaderData.setVector4(
      "material_WindFlutterTuning",
      new Vector4(
        tuning.flutterFrequencyScale,
        tuning.flutterGeometryFraction,
        tuning.leafPressureReferenceSpeedScale,
        tuning.leafAdherenceAngleScale
      )
    );
    material.shaderData.setVector4(
      "material_WindLeafBladeParams",
      new Vector4(foliage.ripple, foliage.clusterRoll, foliage.bladeFlexion, tuning.highSpeedMicroSuppression)
    );
    material.shaderData.setVector4(
      "material_WindSpeciesParams",
      new Vector4(
        preset.species[0] * tuning.branchFrequencyScale,
        preset.species[1] * tuning.phasePropagationScale,
        preset.species[2],
        preset.species[3]
      )
    );
    material.shaderData.setVector4(
      "material_WindLeafMotionParams",
      new Vector4(
        preset.leafMotion[0],
        preset.leafMotion[1] * tuning.flutterAmplitudeScale,
        preset.leafMotion[2] * tuning.flutterAmplitudeScale,
        preset.leafMotion[3] * tuning.flutterAmplitudeScale
      )
    );
    material.shaderData.setVector4(
      "material_WindTrunkModeParams",
      new Vector4(
        preset.trunkMode[0],
        preset.trunkMode[1],
        preset.trunkMode[2] * tuning.rootBendScale,
        preset.trunkMode[3]
      )
    );
    material.shaderData.setFloat(
      "material_WindTreeComplianceGain",
      calibratedComplianceGain * tuning.rootComplianceScale
    );
    material.shaderData.setVector4(
      "material_WindTreePrimaryParams",
      new Vector4(
        primaryProfile.naturalFrequencyHz,
        primaryProfile.dampingRatio,
        primaryProfile.maximumBendRadians * preset.rootBendScale * tuning.rootBendScale,
        windSlod === "far" ? terrainHeroTreeFarAggregateGain(preset, primaryProfile, tuning.rootBendScale) : 1
      )
    );
  };
  for (const lod of materials.lods) {
    apply(lod.trunk, lod.windSlod);
    apply(lod.leaf, lod.windSlod);
  }
}

export function requireTerrainHeroTreeWindAsset(assetId: TerrainHeroTreeWindAssetId) {
  const asset = TERRAIN_HERO_TREE_WIND_ASSETS.find((candidate) => candidate.id === assetId);
  if (!asset) throw new RangeError(`Unknown Hero tree calibration asset: ${assetId}`);
  return asset;
}

/** Resolves the exact `.treewind` calibration source for one production tree recipe. */
export function requireTerrainHeroTreeWindRecipeAsset(recipeId: string) {
  const assetId = TERRAIN_HERO_TREE_WIND_RECIPE_ASSETS[recipeId as keyof typeof TERRAIN_HERO_TREE_WIND_RECIPE_ASSETS];
  if (!assetId) throw new RangeError(`Tree recipe has no P3 mechanical-data contract: ${recipeId}`);
  return requireTerrainHeroTreeWindAsset(assetId);
}
