import { resolveTreeStructureRecipe } from "./ProceduralTreeStructureToken";
import { treeStructureStemNodes, treeStructureLeafNodes } from "./ProceduralTreeGenerator";
import {
  BoundingBox,
  Camera,
  Color,
  Entity,
  Material,
  MeshRenderer,
  ModelMesh,
  Script,
  ShaderMacro,
  ShaderProperty,
  Texture2D,
  Vector4
} from "@galacean/engine";
import {
  createTerrainLodRendererSetScratch,
  TerrainLodGroupRuntime,
  type TerrainLodGroupInstance
} from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRuntime";
import type { TreeAssemblySourceLibrary, TreeRecipeSource } from "./AssetAssemblySourceLibrary";
import {
  createTreeAssemblyPlan,
  TREE_ASSEMBLY_DEFAULT_LOD_PROFILE,
  TREE_ASSEMBLY_LOD_CROSS_FADE_SECONDS,
  TREE_ASSEMBLY_LOD_PREVIEW_DISTANCES,
  treeAssemblyControls,
  treeAssemblyLodProjection,
  validateTreeAssemblyLodProfile,
  type TreeAssemblyControls,
  type TreeAssemblyLodProfile,
  type TreeAssemblyPlan
} from "./TreeAssemblyPlan";
import { ASSET_ASSEMBLY_ENTRANCE_DURATION_MS } from "./AssetAssemblyRenderProfile";
import { assetPopulationVariationDiagnostics, type AssetPopulationVariationDiagnostics } from "./AssetPopulation";
import {
  resolveTreeBillboardTuning,
  resolveTreeLeafCardTuning,
  resolveTreeLeafCountTuning,
  resolveTreeLeafLightingTuning,
  resolveTreeLeafMaskId,
  resolveTreeTrunkMaterialTuning,
  type TreeBillboardTuning,
  type TreeLeafCardTuning,
  type TreeLeafCountTuning,
  type TreeLeafLightingTuning,
  type TreeLeafMaskId,
  type TreeTrunkMaterialTuning
} from "./AssetAssemblyPresetFactory";
import {
  createProceduralTreeFoliageGeometryTuning,
  createProceduralTreeMeshes,
  PROCEDURAL_TREE_ALGORITHM,
  PROCEDURAL_TREE_LEAF_DENSITY,
  PROCEDURAL_TREE_LOD_COUNT,
  resolveSaplingTreeParameters,
  type ProceduralTreeDistributionTuning,
  type ProceduralTreeLeafGpuFrame,
  type ProceduralTreeLeafNodeEdit,
  type ProceduralTreeLodTuple,
  type ProceduralTreeStemNodeEdit,
  type SaplingTreeParameters
} from "./ProceduralTreeGenerator";
import { detachTreeDistributionTuning, resolveTreeDistributionTuning } from "./ProceduralTreeDistributionToken";
import {
  DEFAULT_PROCEDURAL_TREE_CANOPY_OCCLUSION_TUNING,
  summarizeProceduralTreeCanopyOcclusion,
  validateProceduralTreeCanopyOcclusionTuning,
  type ProceduralTreeCanopyOcclusionStatistics,
  type ProceduralTreeCanopyOcclusionTuning
} from "./ProceduralTreeCanopyOcclusion";
import { ProceduralTreeLeafGpuData, type ProceduralTreeLeafGpuFrameScale } from "./ProceduralTreeLeafGpuData";

const ASSET_ASSEMBLY_INSTANCE_MACRO = ShaderMacro.getByName("RENDERER_ASSET_ASSEMBLY_INSTANCE");
const ASSET_ASSEMBLY_RENDERER_INSTANCE_MACRO = ShaderMacro.getByName("RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE");
const LOD_DITHER_MACRO = ShaderMacro.getByName("RENDERER_LOD_DITHER");
const GENERATION_REVEAL_MACRO = ShaderMacro.getByName("RENDERER_GENERATION_REVEAL");
const BASE_TEXTURE_MACRO = ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE");
const SMOOTHNESS_TEXTURE_MACRO = ShaderMacro.getByName("MATERIAL_HAS_SMOOTHNESS_TEXTURE");
const SECOND_COLOR_MACRO = ShaderMacro.getByName("MATERIAL_ENABLE_SECOND_COLOR");
const TRANSLUCENCY_MACRO = ShaderMacro.getByName("MATERIAL_ENABLE_TRANSLUCENCY");
const LEAF_CLIMATE_MACRO = ShaderMacro.getByName("MATERIAL_VEGETATION_CLIMATE_LEAF");
const BRANCH_CLIMATE_MACRO = ShaderMacro.getByName("MATERIAL_VEGETATION_CLIMATE_BRANCH");
const SECOND_COLOR_VERTEX_GRADIENT_MACRO = ShaderMacro.getByName("MATERIAL_SECOND_COLOR_VERTEX_GRADIENT");
const SECOND_COLOR_WORLD_NOISE_MACRO = ShaderMacro.getByName("MATERIAL_SECOND_COLOR_WORLD_NOISE_3D");
const WIND_MACRO = ShaderMacro.getByName("MATERIAL_ENABLE_WIND");
const PROCEDURAL_TREE_WIND_MACRO = ShaderMacro.getByName("MATERIAL_WIND_PROCEDURAL_TREE");
const TRUNK_VERTICAL_GRADIENT_MACRO = ShaderMacro.getByName("MATERIAL_PROCEDURAL_TREE_TRUNK_VERTICAL_GRADIENT");
const CANOPY_OCCLUSION_MACRO = ShaderMacro.getByName("MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION");
const LEAF_VERTEX_NORMAL_DEBUG_MACRO = ShaderMacro.getByName("MATERIAL_PROCEDURAL_TREE_LEAF_VERTEX_NORMAL_DEBUG");
const PROCEDURAL_TREE_LEAF_BILLBOARD_MACRO = ShaderMacro.getByName("RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD");
const ASSET_ASSEMBLY_COLOR = ShaderProperty.getByName("renderer_AssetAssemblyColor");
const LOD_FADE = ShaderProperty.getByName("renderer_LodFade");
const REVEAL_PROGRESS = ShaderProperty.getByName("renderer_GenerationRevealProgress");
const REVEAL_ORIGIN_Y = ShaderProperty.getByName("renderer_GenerationRevealOriginY");
const REVEAL_HEIGHT = ShaderProperty.getByName("renderer_GenerationRevealHeight");
const REVEAL_LIFT = ShaderProperty.getByName("renderer_GenerationRevealLift");
const MATERIAL_BASE_TEXTURE = ShaderProperty.getByName("material_BaseTexture");
const MATERIAL_ALPHA_CUTOFF = ShaderProperty.getByName("material_AlphaCutoff");
const MATERIAL_BASE_COLOR = ShaderProperty.getByName("material_BaseColor");
const MATERIAL_TILING = ShaderProperty.getByName("material_Tiling");
const MATERIAL_NORMAL_SCALE = ShaderProperty.getByName("material_NormalScale");
const MATERIAL_METALLIC = ShaderProperty.getByName("material_Metallic");
const MATERIAL_SMOOTHNESS = ShaderProperty.getByName("material_Smoothness");
const MATERIAL_LIGHTING_FLATNESS = ShaderProperty.getByName("material_LightingFlatness");
const MATERIAL_TRUNK_VERTICAL_GRADIENT_BOTTOM_COLOR = ShaderProperty.getByName(
  "material_TrunkVerticalGradientBottomColor"
);
const MATERIAL_TRUNK_VERTICAL_GRADIENT_BOTTOM_STRENGTH = ShaderProperty.getByName(
  "material_TrunkVerticalGradientBottomStrength"
);
const MATERIAL_TRUNK_VERTICAL_GRADIENT_TOP_COLOR = ShaderProperty.getByName("material_TrunkVerticalGradientTopColor");
const MATERIAL_TRUNK_VERTICAL_GRADIENT_TOP_STRENGTH = ShaderProperty.getByName(
  "material_TrunkVerticalGradientTopStrength"
);
const MATERIAL_TRUNK_VERTICAL_GRADIENT_BOUNDS = ShaderProperty.getByName("material_TrunkVerticalGradientBounds");
const MATERIAL_SECOND_COLOR = ShaderProperty.getByName("material_SecondColor");
const MATERIAL_SECOND_COLOR_LEVEL = ShaderProperty.getByName("material_SecondColorLevel");
const MATERIAL_SECOND_COLOR_GRADIENT = ShaderProperty.getByName("material_SecondColorGradient");
const MATERIAL_LEAF_ALBEDO_BRIGHTNESS = ShaderProperty.getByName("material_LeafAlbedoBrightness");
const MATERIAL_LEAF_ALBEDO_DESATURATION = ShaderProperty.getByName("material_LeafAlbedoDesaturation");
const MATERIAL_LEAF_ALBEDO_TEXTURE_BLEND = ShaderProperty.getByName("material_LeafAlbedoTextureBlend");
const MATERIAL_LEAF_BASE_AO_INFLUENCE = ShaderProperty.getByName("material_LeafBaseAOInfluence");
const MATERIAL_LEAF_GLANCING_ANGLE_CUT = ShaderProperty.getByName("material_LeafGlancingAngleCut");
const MATERIAL_LEAF_FLIP_BACKFACE_NORMALS = ShaderProperty.getByName("material_LeafFlipBackfaceNormals");
const MATERIAL_TRANSLUCENCY_COLOR = ShaderProperty.getByName("material_TranslucencyColor");
const MATERIAL_TRANSLUCENCY_INTENSITY = ShaderProperty.getByName("material_TranslucencyIntensity");
const MATERIAL_TRANSLUCENCY_AO_INFLUENCE = ShaderProperty.getByName("material_TranslucencyAOInfluence");
const MATERIAL_TRANSLUCENCY_NORMAL_DISTORTION = ShaderProperty.getByName("material_TranslucencyNormalDistortion");
const MATERIAL_TRANSLUCENCY_SCATTERING = ShaderProperty.getByName("material_TranslucencyScattering");
const MATERIAL_TRANSLUCENCY_DIRECT = ShaderProperty.getByName("material_TranslucencyDirect");
const MATERIAL_TRANSLUCENCY_AMBIENT = ShaderProperty.getByName("material_TranslucencyAmbient");
const MATERIAL_TRANSLUCENCY_SHADOW_STRENGTH = ShaderProperty.getByName("material_TranslucencyShadowStrength");
const MATERIAL_PROCEDURAL_TREE_WIND_PARAMS = ShaderProperty.getByName("material_ProceduralTreeWindParams");
const MATERIAL_PROCEDURAL_TREE_HEIGHT = ShaderProperty.getByName("material_ProceduralTreeHeight");
const MATERIAL_CANOPY_OCCLUSION_DENSITY = ShaderProperty.getByName("material_ProceduralTreeCanopyOcclusionDensity");
const MATERIAL_CANOPY_OCCLUSION_COLOR = ShaderProperty.getByName("material_ProceduralTreeCanopyOcclusionColor");

/** Shared mechanical limits for every runtime-generated tree; the Shader and culling bounds consume this source. */
export const PROCEDURAL_TREE_WIND_PARAMS = Object.freeze({
  maximumWholeTreeBendRadians: 0.0523598776,
  wholeTreeFrequencyHz: 0.18,
  maximumLeafFlutterRadians: 0.1047197551,
  leafFlutterFrequencyHz: 0.9
});

/**
 * Resolves the largest source-space lever arm of the GPU-generated leaf cards for one LOD.
 * This consumes the same canonical dimensions and per-LOD scale as the vertex Shader, so public
 * leaf-size and billboard-size authoring cannot outgrow the culling contract.
 */
export function resolveProceduralTreeLeafFlutterRadius(
  frames: readonly ProceduralTreeLeafGpuFrame[],
  scale: ProceduralTreeLeafGpuFrameScale
): number {
  if (scale.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Procedural tree leaf-frame scale must contain finite non-negative values");
  }
  let maximumRadius = 0;
  for (const frame of frames) {
    if (
      !Number.isFinite(frame.width) ||
      frame.width < 0 ||
      !Number.isFinite(frame.height) ||
      frame.height < 0 ||
      frame.right.some((value) => !Number.isFinite(value)) ||
      frame.up.some((value) => !Number.isFinite(value))
    ) {
      throw new RangeError("Procedural tree leaf frames must contain finite non-negative dimensions and axes");
    }
    const halfWidth = (frame.width * scale[0] + scale[2] * 2) * 0.5;
    const height = frame.height * scale[1] + scale[2] * 2;
    for (const side of [-1, 1] as const) {
      maximumRadius = Math.max(
        maximumRadius,
        Math.hypot(
          frame.right[0] * halfWidth * side + frame.up[0] * height,
          frame.right[1] * halfWidth * side + frame.up[1] * height,
          frame.right[2] * halfWidth * side + frame.up[2] * height
        )
      );
    }
  }
  return maximumRadius;
}

/** Pure culling margin derived from the two rotations performed by ProceduralTreeWind.glsl. */
export function resolveProceduralTreeWindBoundsMargin(
  minimum: readonly [x: number, y: number, z: number],
  maximum: readonly [x: number, y: number, z: number],
  maximumLeafFlutterRadius = 0
): number {
  if (
    [...minimum, ...maximum].some((value) => !Number.isFinite(value)) ||
    minimum.some((value, axis) => value > maximum[axis])
  ) {
    throw new RangeError("Procedural tree wind bounds require a finite ordered local AABB");
  }
  if (!Number.isFinite(maximumLeafFlutterRadius) || maximumLeafFlutterRadius < 0) {
    throw new RangeError("Procedural tree leaf flutter radius must be finite and non-negative");
  }
  const structuralRadius = Math.hypot(
    Math.max(Math.abs(minimum[0]), Math.abs(maximum[0])),
    Math.max(Math.abs(minimum[1]), Math.abs(maximum[1])),
    Math.max(Math.abs(minimum[2]), Math.abs(maximum[2]))
  );
  const structuralTravel =
    2 * structuralRadius * Math.sin(PROCEDURAL_TREE_WIND_PARAMS.maximumWholeTreeBendRadians * 0.5);
  const leafLocalTravel =
    2 * maximumLeafFlutterRadius * Math.sin(PROCEDURAL_TREE_WIND_PARAMS.maximumLeafFlutterRadians * 0.5);
  return structuralTravel + leafLocalTravel;
}

/**
 * Returns per-axis local-bound multipliers which contain world-space wind after every supplied scale.
 * For each renderer, scale[axis] * compensation[axis] is at least that transform's largest axis,
 * so the transformed padding contains a sphere covering the Shader's maximum world displacement.
 */
export function resolveProceduralTreeWindScaleCompensation(
  scales: readonly (readonly [x: number, y: number, z: number])[]
): readonly [x: number, y: number, z: number] {
  const compensation: [number, number, number] = [1, 1, 1];
  for (const scale of scales) {
    const absoluteScale = scale.map(Math.abs);
    if (absoluteScale.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new RangeError("Procedural tree renderer scales must be finite and non-zero");
    }
    const maximumAxisScale = Math.max(...absoluteScale);
    for (let axis = 0; axis < 3; axis++) {
      compensation[axis] = Math.max(compensation[axis], maximumAxisScale / absoluteScale[axis]);
    }
  }
  return compensation;
}

/** Expands one generated local bound by the same maximum world-space angular travel used by the Shader. */
export function expandProceduralTreeWindBounds(
  mesh: ModelMesh,
  maximumLeafFlutterRadius = 0,
  scaleCompensation: readonly [x: number, y: number, z: number] = [1, 1, 1]
): void {
  if (scaleCompensation.some((value) => !Number.isFinite(value) || value < 1)) {
    throw new RangeError("Procedural tree scale compensation must contain finite values of at least one");
  }
  const margin = resolveProceduralTreeWindBoundsMargin(
    [mesh.bounds.min.x, mesh.bounds.min.y, mesh.bounds.min.z],
    [mesh.bounds.max.x, mesh.bounds.max.y, mesh.bounds.max.z],
    maximumLeafFlutterRadius
  );
  mesh.bounds.min.set(
    mesh.bounds.min.x - margin * scaleCompensation[0],
    mesh.bounds.min.y - margin * scaleCompensation[1],
    mesh.bounds.min.z - margin * scaleCompensation[2]
  );
  mesh.bounds.max.set(
    mesh.bounds.max.x + margin * scaleCompensation[0],
    mesh.bounds.max.y + margin * scaleCompensation[1],
    mesh.bounds.max.z + margin * scaleCompensation[2]
  );
}

/** Enables the neutral renderer-owned contract shared by every renderer consuming generated tree geometry. */
export function configureAssetAssemblyRendererInstance(renderer: MeshRenderer): void {
  renderer.shaderData.enableMacro(ASSET_ASSEMBLY_INSTANCE_MACRO);
  renderer.shaderData.enableMacro(ASSET_ASSEMBLY_RENDERER_INSTANCE_MACRO);
  renderer.shaderData.setVector4(ASSET_ASSEMBLY_COLOR, new Vector4(1, 1, 1, 1));
}

/** One active procedural tree representation and its exact submitted population. */
export interface TreeAssemblyActiveLodDiagnostics {
  readonly lodIndex: number;
  readonly representation: "procedural-3d";
  readonly coverage: number;
  readonly leafInstances: number;
  readonly treeInstances: number;
}

/** Independent per-tree distance selection and cross-fade evidence. */
export interface TreeAssemblyLodDiagnostics {
  readonly simulatedDistance: number;
  readonly automaticDistance: boolean;
  readonly transitioning: boolean;
  readonly transitionProgress: number;
  readonly activeLevels: readonly TreeAssemblyActiveLodDiagnostics[];
  readonly leafInstancesByLod: readonly number[];
  readonly treeInstancesByLod: readonly number[];
  readonly automaticDistanceRange: readonly [minimum: number, maximum: number];
  readonly profile: TreeAssemblyLodProfile;
}

/** Runtime evidence for the generated tree geometry and its authored material bindings. */
export interface TreeAssemblyDiagnostics {
  readonly trees: number;
  readonly trunkInstances: number;
  readonly leafInstances: number;
  readonly instancedDraws: number;
  readonly recipeId: string;
  readonly geometrySource: "procedural-runtime";
  readonly proceduralAlgorithm: typeof PROCEDURAL_TREE_ALGORITHM;
  readonly proceduralProfile: SaplingTreeParameters["profile"];
  readonly proceduralLeafDensity: typeof PROCEDURAL_TREE_LEAF_DENSITY;
  readonly proceduralLeafCounts: ProceduralTreeLodTuple<number>;
  readonly proceduralLeafCountTuning: TreeLeafCountTuning;
  readonly proceduralDistributionTuning: ProceduralTreeDistributionTuning;
  readonly proceduralStemNodeParameters: readonly ProceduralTreeStemNodeEdit[];
  readonly proceduralLeafNodeParameters: readonly ProceduralTreeLeafNodeEdit[];
  readonly proceduralLeafCastShadows: boolean;
  readonly proceduralLeafMaterialVisible: boolean;
  readonly proceduralLeafDisplayMode: ProceduralTreeLeafDisplayMode;
  readonly proceduralLeafFoldAdjustmentDegrees: number;
  readonly proceduralLeafCardSizePercent: TreeLeafCardTuning;
  readonly proceduralBillboard: TreeBillboardTuning;
  readonly proceduralLeafLighting: TreeLeafLightingTuning;
  readonly proceduralCanopyOcclusion: ProceduralTreeCanopyOcclusionTuning & ProceduralTreeCanopyOcclusionStatistics;
  readonly proceduralTrunkMaterial: TreeTrunkMaterialTuning;
  readonly proceduralLeafMaskId: TreeLeafMaskId;
  readonly proceduralLeafMaskSource: "preset" | "custom";
  readonly proceduralLeafMaskLabel: string;
  readonly proceduralLeafMaskResolution: readonly [number, number];
  readonly proceduralLeafAlphaCutoff: number;
  readonly proceduralLeafColorSource: "base-color";
  readonly proceduralBranchCountsByLod: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number]
  ];
  readonly proceduralTrunkTrianglesByLod: ProceduralTreeLodTuple<number>;
  readonly proceduralLeafTrianglesByLod: ProceduralTreeLodTuple<number>;
  readonly proceduralTrianglesByLod: ProceduralTreeLodTuple<number>;
  readonly proceduralGate?: TreeRecipeSource["proceduralGate"];
  readonly lod: TreeAssemblyLodDiagnostics;
  readonly controls: TreeAssemblyControls;
  readonly variation: AssetPopulationVariationDiagnostics;
}

/** Mutually exclusive production and geometry-inspection surfaces for procedural leaf cards. */
export type ProceduralTreeLeafDisplayMode = "material" | "raw-cards" | "vertex-normals";

/** Initialization boundary for one production tree surface. */
export interface TreeAssemblyRuntimeOptions {
  readonly sourceLibrary: TreeAssemblySourceLibrary;
  readonly controls: TreeAssemblyControls;
  readonly shadows: boolean;
  readonly camera: Camera;
  /** Final uniform XYZ multiplier used to reproduce population-level tree scaling. */
  readonly treeUniformScale?: number;
  /** Compare authored dimensions in standard mode while retaining stress-population variation. */
  readonly sourceScalePreview?: boolean;
}

interface InstancedBatch {
  /** One ordinary MeshRenderer per tree; compatible survivors are batched by the Engine. */
  readonly renderers: readonly MeshRenderer[];
  readonly drawable: boolean;
  readonly authoredCastShadows: boolean;
  readonly leafCount: number;
  readonly ownedMaterial: Material | null;
  readonly rawCardMaterial: Material | null;
  readonly vertexNormalMaterial: Material | null;
  count: number;
}

interface TreeAssemblyBatch {
  readonly root: Entity;
  readonly instanceRoots: readonly Entity[];
  readonly recipe: TreeRecipeSource;
  readonly trunkBatches: ProceduralTreeLodTuple<InstancedBatch>;
  readonly crownBatches: ProceduralTreeLodTuple<InstancedBatch>;
  readonly ownedProceduralMeshes: readonly ModelMesh[];
  readonly ownedLeafGpuData: ProceduralTreeLeafGpuData;
  readonly proceduralProfile: SaplingTreeParameters["profile"];
  readonly proceduralDistributionTuning: ProceduralTreeDistributionTuning;
  readonly proceduralBranchCountsByLod: TreeAssemblyDiagnostics["proceduralBranchCountsByLod"];
  readonly proceduralTrunkTrianglesByLod: ProceduralTreeLodTuple<number>;
  readonly proceduralLeafTrianglesByLod: ProceduralTreeLodTuple<number>;
  readonly proceduralTrianglesByLod: ProceduralTreeLodTuple<number>;
  readonly canopyOpticalDepths: readonly number[];
}

interface OwnedCustomLeafMask {
  readonly texture: Texture2D;
  readonly label: string;
}

/** Leaf cards start without shadow casting while trunks retain the scene-wide shadow setting. */
export const TREE_ASSEMBLY_DEFAULT_LEAF_SHADOWS = false;

/** Renders one deterministic procedural base tree across many independently selected LOD instances. */
export class TreeAssemblyRuntime extends Script {
  private _camera: Camera | null = null;
  private _sourceLibrary: TreeAssemblySourceLibrary | null = null;
  private _ownedCustomLeafMask: OwnedCustomLeafMask | null = null;
  private _plan: TreeAssemblyPlan | null = null;
  private _batch: TreeAssemblyBatch | null = null;
  private _controls: TreeAssemblyControls | null = null;
  private _shadows = true;
  private _treeUniformScale = 1;
  private _sourceScalePreview = false;
  private _leafShadows = TREE_ASSEMBLY_DEFAULT_LEAF_SHADOWS;
  private _leafDisplayMode: ProceduralTreeLeafDisplayMode = "material";
  private _canopyOcclusionTuning: ProceduralTreeCanopyOcclusionTuning = {
    ...DEFAULT_PROCEDURAL_TREE_CANOPY_OCCLUSION_TUNING
  };
  private _lodProfile: TreeAssemblyLodProfile = detachLodProfile(TREE_ASSEMBLY_DEFAULT_LOD_PROFILE);
  private _lodDefinition = createLodDefinition(this._lodProfile);
  private _lodInstances: TerrainLodGroupInstance[] = [];
  private readonly _lodObservation = { timeSeconds: 0, visible: true as const, screenRelativeHeight: 0 };
  private readonly _lodRendererSetScratch = createTerrainLodRendererSetScratch();
  private readonly _trunkCounts = new Uint32Array(PROCEDURAL_TREE_LOD_COUNT);
  private readonly _crownCounts = new Uint32Array(PROCEDURAL_TREE_LOD_COUNT);
  private _simulatedDistance: number = TREE_ASSEMBLY_LOD_PREVIEW_DISTANCES[0];
  private _automaticDistance = true;
  private _elapsedSeconds = 0;
  private _lodLeafCounts = new Uint32Array(PROCEDURAL_TREE_LOD_COUNT);
  private _lodTreeCounts = new Uint32Array(PROCEDURAL_TREE_LOD_COUNT);
  private _lodCoverageSums = new Float32Array(PROCEDURAL_TREE_LOD_COUNT);
  private _automaticDistanceRange: [number, number] = [0, 0];
  private _transitioningTrees = 0;
  private _transitionProgress = 1;
  private _trunkInstances = 0;
  private _leafInstances = 0;
  private _instancedDraws = 0;
  private _lastCameraPosition: [number, number, number] = [Number.NaN, Number.NaN, Number.NaN];
  private _entrancePlayback = 0;

  /**
   * Publishes the initial authored tree surface.
   * @param options Production Prefabs, controls, camera, and shadow state.
   * @returns Nothing.
   */
  initialize(options: TreeAssemblyRuntimeOptions): void {
    if (this._sourceLibrary) throw new Error("Tree Assembly runtime is already initialized");
    const treeUniformScale = options.treeUniformScale ?? 1;
    if (!(treeUniformScale > 0) || !Number.isFinite(treeUniformScale)) {
      throw new RangeError("Tree Assembly uniform scale must be finite and positive");
    }
    this._camera = options.camera;
    this._sourceLibrary = options.sourceLibrary;
    this._shadows = options.shadows;
    this._treeUniformScale = treeUniformScale;
    this._sourceScalePreview = options.sourceScalePreview ?? false;
    this.setControls(options.controls);
  }

  /**
   * Atomically rebuilds one Population Token using its exact authored base-tree recipe.
   * @param controls Population Token and scene-only stand origin.
   * @returns Updated runtime diagnostics.
   */
  setControls(controls: TreeAssemblyControls): TreeAssemblyDiagnostics {
    const sourceLibrary = this._requireSourceLibrary();
    const plan = createTreeAssemblyPlan(controls, sourceLibrary.treeRecipes, {
      scaleVariation: !this._sourceScalePreview || controls.token.population.mode === "stress-1000"
    });
    const recipe = resolveTreeStructureRecipe(sourceLibrary.treeRecipes[plan.recipeIndex], controls.token);
    const leafCardTuning = resolveTreeLeafCardTuning(controls.token);
    const leafCountTuning = resolveTreeLeafCountTuning(controls.token);
    const billboardTuning = resolveTreeBillboardTuning(controls.token);
    const leafLightingTuning = resolveTreeLeafLightingTuning(controls.token);
    const trunkMaterialTuning =
      resolveTreeTrunkMaterialTuning(controls.token) ?? readTrunkMaterialTuning(recipe.trunkMaterial);
    const leafMaskId = resolveTreeLeafMaskId(controls.token);
    const leafMask = this._ownedCustomLeafMask?.texture ?? this._resolveLeafMask(recipe, leafMaskId);
    const distributionTuning = resolveTreeDistributionTuning(controls.token, recipe);
    const nextBatch = this._createBatch(
      plan,
      recipe,
      leafCountTuning,
      distributionTuning,
      leafCardTuning,
      billboardTuning,
      leafLightingTuning,
      trunkMaterialTuning,
      leafMask
    );
    const previousBatch = this._batch;
    this._controls = treeAssemblyControls(controls.token, controls.stageOrigin);
    this._plan = plan;
    this._batch = nextBatch;
    this._lodInstances = Array.from({ length: plan.instances.count }, () => this._lodDefinition.createInstance());
    this._lastCameraPosition = [Number.NaN, Number.NaN, Number.NaN];
    this._applyLod(true);
    nextBatch.root.isActive = true;
    if (previousBatch) {
      previousBatch.root.isActive = false;
      this._disposeBatch(previousBatch);
    }
    return this.getDiagnostics();
  }

  /** Moves the existing base-tree instance without regenerating its procedural meshes. */
  setStageOrigin(stageOrigin: readonly [x: number, y: number, z: number]): TreeAssemblyDiagnostics {
    if (!stageOrigin.every(Number.isFinite)) {
      throw new RangeError("Tree Assembly stage origin must contain three finite values");
    }
    const controls = this._controls;
    const batch = this._batch;
    if (!controls || !batch) throw new Error("Tree Assembly controls are unavailable");
    if (stageOrigin[1] !== controls.stageOrigin[1]) {
      throw new RangeError("Tree Assembly lightweight stage placement cannot change vertical origin");
    }
    const nextControls = treeAssemblyControls(controls.token, stageOrigin);
    const nextPlan = createTreeAssemblyPlan(nextControls, this._requireSourceLibrary().treeRecipes, {
      scaleVariation: !this._sourceScalePreview || nextControls.token.population.mode === "stress-1000"
    });
    if (nextPlan.instances.count !== batch.instanceRoots.length) {
      throw new Error("Tree Assembly stage placement cannot change the population instance count");
    }
    batch.instanceRoots.forEach((root, treeIndex) => {
      const offset = treeIndex * 16;
      root.transform.setPosition(
        nextPlan.instances.records[offset],
        nextPlan.instances.records[offset + 1],
        nextPlan.instances.records[offset + 2]
      );
    });
    this._controls = nextControls;
    this._plan = nextPlan;
    this._lastCameraPosition = [Number.NaN, Number.NaN, Number.NaN];
    this._applyLod(true);
    return this.getDiagnostics();
  }

  /** Includes every source LOD and instance, independently of the currently visible draw level. */
  getPreviewBounds(): BoundingBox {
    const batch = this._batch!;
    const renderers = [...batch.trunkBatches, ...batch.crownBatches].flatMap((part) => part.renderers);
    if (renderers.length === 0) {
      const bounds = new BoundingBox();
      bounds.min.set(...this._controls!.stageOrigin);
      bounds.max.copyFrom(bounds.min);
      return bounds;
    }
    const bounds = renderers[0].bounds.clone();
    for (const renderer of renderers) BoundingBox.merge(bounds, renderer.bounds, bounds);
    return bounds;
  }

  /** Rebuilds foliage selection because final card dimensions participate in collision pruning. */
  setLeafCardTuning(controls: TreeAssemblyControls): TreeAssemblyDiagnostics {
    if (!this._batch || !this._controls) throw new Error("Tree Assembly runtime is not ready");
    if (controls.token.assetId !== this._controls.token.assetId) {
      throw new Error("Tree leaf-card tuning cannot change the active tree recipe");
    }
    return this.setControls(controls);
  }

  /** Switches between production leaf shading and opaque untextured cards without changing geometry. */
  setLeafMaterialVisible(visible: boolean): TreeAssemblyDiagnostics {
    return this.setLeafDisplayMode(visible ? "material" : "raw-cards");
  }

  /** Switches the crown between production shading, raw cards, and view-space vertex-normal RGB. */
  setLeafDisplayMode(mode: ProceduralTreeLeafDisplayMode): TreeAssemblyDiagnostics {
    const batch = this._batch;
    if (!batch) throw new Error("Tree Assembly runtime is not ready");
    if (mode !== "material" && mode !== "raw-cards" && mode !== "vertex-normals") {
      throw new RangeError(`Unknown procedural leaf display mode ${mode}`);
    }
    this._leafDisplayMode = mode;
    batch.crownBatches.forEach((crown) => {
      const material =
        mode === "material"
          ? crown.ownedMaterial
          : mode === "raw-cards"
            ? crown.rawCardMaterial
            : crown.vertexNormalMaterial;
      if (!material) throw new Error("Tree leaf-card validation material is unavailable");
      crown.renderers.forEach((renderer) => renderer.setMaterial(material));
    });
    return this.getDiagnostics();
  }

  /** Returns the active texture, or resolves a requested preset for other renderers borrowing it. */
  getLeafTexture(maskId?: TreeLeafMaskId): Texture2D {
    if (!this._batch || !this._controls) throw new Error("Tree Assembly runtime is not ready");
    return maskId === undefined && this._ownedCustomLeafMask
      ? this._ownedCustomLeafMask.texture
      : this._resolveLeafMask(this._batch.recipe, maskId ?? resolveTreeLeafMaskId(this._controls.token));
  }

  /** Updates only the crown materials; geometry, instances, and leaf count remain unchanged. */
  setLeafMask(controls: TreeAssemblyControls): TreeAssemblyDiagnostics {
    const batch = this._batch;
    if (!batch || !this._controls) throw new Error("Tree Assembly runtime is not ready");
    if (controls.token.assetId !== this._controls.token.assetId) {
      throw new Error("Tree leaf-mask tuning cannot change the active tree recipe");
    }
    const maskId = resolveTreeLeafMaskId(controls.token);
    const texture = this._resolveLeafMask(batch.recipe, maskId);
    this._controls = treeAssemblyControls(controls.token, controls.stageOrigin);
    batch.crownBatches.forEach((crown) => configureProceduralLeafMaterial(crown.ownedMaterial!, texture));
    this._destroyCustomLeafMask();
    return this.getDiagnostics();
  }

  /** Applies and owns a user-supplied Alpha-Test texture without mutating the serializable tree Token. */
  setCustomLeafMask(texture: Texture2D, label: string): TreeAssemblyDiagnostics {
    const batch = this._batch;
    if (!batch || !this._controls) throw new Error("Tree Assembly runtime is not ready");
    if (texture.width < 1 || texture.height < 1) throw new Error("Custom tree leaf mask has no image data");
    const previous = this._ownedCustomLeafMask;
    batch.crownBatches.forEach((crown) => configureProceduralLeafMaterial(crown.ownedMaterial!, texture));
    this._ownedCustomLeafMask = { texture, label };
    if (previous && previous.texture !== texture) previous.texture.destroy();
    return this.getDiagnostics();
  }

  /** Rebuilds foliage selection because fixed-frame growth changes the collision envelope. */
  setBillboardTuning(controls: TreeAssemblyControls): TreeAssemblyDiagnostics {
    if (!this._batch || !this._controls) throw new Error("Tree Assembly runtime is not ready");
    if (controls.token.assetId !== this._controls.token.assetId) {
      throw new Error("Tree billboard tuning cannot change the active tree recipe");
    }
    return this.setControls(controls);
  }

  /** Updates only the procedural leaf PBR uniforms; geometry, instances, and draw count stay unchanged. */
  setLeafLightingTuning(controls: TreeAssemblyControls): TreeAssemblyDiagnostics {
    const batch = this._batch;
    if (!batch || !this._controls) throw new Error("Tree Assembly runtime is not ready");
    if (controls.token.assetId !== this._controls.token.assetId) {
      throw new Error("Tree leaf-lighting tuning cannot change the active tree recipe");
    }
    const tuning = resolveTreeLeafLightingTuning(controls.token);
    this._controls = treeAssemblyControls(controls.token, controls.stageOrigin);
    batch.crownBatches.forEach((crown) => configureLeafLightingTuning(crown.ownedMaterial!, tuning));
    return this.getDiagnostics();
  }

  /** Updates the validation-only Beer-Lambert canopy response without rebuilding geometry or shadow casters. */
  setCanopyOcclusionTuning(tuning: ProceduralTreeCanopyOcclusionTuning): TreeAssemblyDiagnostics {
    validateProceduralTreeCanopyOcclusionTuning(tuning);
    const batch = this._batch;
    if (!batch) throw new Error("Tree Assembly runtime is not ready");
    this._canopyOcclusionTuning = { ...tuning };
    batch.crownBatches.forEach((crown) =>
      configureProceduralTreeCanopyOcclusionMaterial(crown.ownedMaterial!, this._canopyOcclusionTuning)
    );
    return this.getDiagnostics();
  }

  /** Updates only the four procedural trunk PBR materials; geometry and population remain unchanged. */
  setTrunkMaterialTuning(controls: TreeAssemblyControls): TreeAssemblyDiagnostics {
    const batch = this._batch;
    if (!batch || !this._controls) throw new Error("Tree Assembly runtime is not ready");
    if (controls.token.assetId !== this._controls.token.assetId) {
      throw new Error("Tree trunk-material tuning cannot change the active tree recipe");
    }
    const tuning = resolveTreeTrunkMaterialTuning(controls.token);
    if (!tuning) throw new Error("Tree trunk-material tuning requires an explicit Token extension");
    this._controls = treeAssemblyControls(controls.token, controls.stageOrigin);
    batch.trunkBatches.forEach((trunk) => configureTrunkMaterialTuning(trunk.ownedMaterial!, tuning));
    return this.getDiagnostics();
  }

  /**
   * Selects a shared manual distance without mutating the Population Token.
   * @param distanceMeters Non-negative distance in meters.
   * @returns Updated runtime diagnostics.
   */
  setSimulatedDistance(distanceMeters: number): TreeAssemblyDiagnostics {
    treeAssemblyLodProjection(distanceMeters);
    this._automaticDistance = false;
    this._simulatedDistance = distanceMeters;
    this._applyLod(false);
    return this.getDiagnostics();
  }

  /**
   * Enables real per-tree camera distance selection.
   * @param enabled Whether the live camera drives every tree independently.
   * @returns Updated runtime diagnostics.
   */
  setAutomaticDistance(enabled: boolean): TreeAssemblyDiagnostics {
    this._automaticDistance = enabled;
    this._lastCameraPosition = [Number.NaN, Number.NaN, Number.NaN];
    this._applyLod(false);
    return this.getDiagnostics();
  }

  /**
   * Applies a validated renderer-owned LOD policy.
   * @param profile Grasslands authored-LOD distances.
   * @returns Updated runtime diagnostics.
   */
  setLodProfile(profile: TreeAssemblyLodProfile): TreeAssemblyDiagnostics {
    validateTreeAssemblyLodProfile(profile);
    this._lodProfile = detachLodProfile(profile);
    this._lodDefinition = createLodDefinition(profile);
    if (!this._controls) throw new Error("Tree Assembly controls are unavailable");
    return this.setControls(this._controls);
  }

  /**
   * Changes authored 3D shadow casting without rebuilding instance buffers.
   * @param enabled Global preview shadow state.
   * @returns Updated runtime diagnostics.
   */
  setShadows(enabled: boolean): TreeAssemblyDiagnostics {
    this._shadows = enabled;
    if (this._batch) {
      this._batch.trunkBatches.forEach((batch) =>
        batch.renderers.forEach((renderer) => (renderer.castShadows = enabled && batch.authoredCastShadows))
      );
      this._batch.crownBatches.forEach((batch) =>
        batch.renderers.forEach(
          (renderer) => (renderer.castShadows = enabled && this._leafShadows && batch.authoredCastShadows)
        )
      );
    }
    return this.getDiagnostics();
  }

  /** Toggles only procedural leaf-card shadow casting for direct lighting A/B comparison. */
  setLeafShadows(enabled: boolean): TreeAssemblyDiagnostics {
    this._leafShadows = enabled;
    this._batch?.crownBatches.forEach((batch) =>
      batch.renderers.forEach(
        (renderer) => (renderer.castShadows = this._shadows && enabled && batch.authoredCastShadows)
      )
    );
    return this.getDiagnostics();
  }

  /** @returns Promise resolved after the current tree population finishes its bottom-up reveal. */
  playEntranceEffect(durationMs = ASSET_ASSEMBLY_ENTRANCE_DURATION_MS): Promise<void> {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return Promise.reject(new RangeError("Tree Assembly entrance duration must be positive"));
    }
    const playback = ++this._entrancePlayback;
    this._setReveal(0);
    return new Promise((resolve) => {
      let start: number | undefined;
      const advance = (now: number): void => {
        if (playback !== this._entrancePlayback) return resolve();
        start ??= now;
        const progress = Math.min(1, (now - start) / durationMs);
        this._setReveal(progress);
        progress >= 1 ? resolve() : requestAnimationFrame(advance);
      };
      requestAnimationFrame(advance);
    });
  }

  /** @returns Detached material-source, generated-geometry, draw, population, and LOD evidence. */
  getDiagnostics(): TreeAssemblyDiagnostics {
    const sourceLibrary = this._requireSourceLibrary();
    const batch = this._batch;
    const controls = this._controls;
    if (!batch || !controls || !this._plan) throw new Error("Tree Assembly runtime is not ready");
    const presetLeafMaskId = resolveTreeLeafMaskId(controls.token);
    const activeLeafMask = this._ownedCustomLeafMask?.texture ?? this._resolveLeafMask(batch.recipe, presetLeafMaskId);
    return {
      trees: this._plan.instances.count,
      trunkInstances: this._trunkInstances,
      leafInstances: this._leafInstances,
      instancedDraws: this._instancedDraws,
      recipeId: batch.recipe.id,
      geometrySource: "procedural-runtime",
      proceduralAlgorithm: PROCEDURAL_TREE_ALGORITHM,
      proceduralProfile: batch.proceduralProfile,
      proceduralLeafDensity: PROCEDURAL_TREE_LEAF_DENSITY,
      proceduralLeafCounts: batch.crownBatches.map((lod) => lod.leafCount) as unknown as ProceduralTreeLodTuple<number>,
      proceduralLeafCountTuning: resolveTreeLeafCountTuning(controls.token),
      proceduralDistributionTuning: detachTreeDistributionTuning(batch.proceduralDistributionTuning),
      proceduralStemNodeParameters: treeStructureStemNodes(batch.recipe.structureParameters!),
      proceduralLeafNodeParameters: treeStructureLeafNodes(batch.recipe.structureParameters!).filter((leaf) =>
        batch.recipe.structureParameters!.leafIdsByLod[0].includes(leaf.leafId)
      ),
      proceduralLeafCastShadows: this._leafShadows,
      proceduralLeafMaterialVisible: this._leafDisplayMode === "material",
      proceduralLeafDisplayMode: this._leafDisplayMode,
      proceduralLeafFoldAdjustmentDegrees: batch.recipe.structureParameters?.leafFoldAdjustmentDegrees ?? 0,
      proceduralLeafCardSizePercent: resolveTreeLeafCardTuning(controls.token),
      proceduralBillboard: resolveTreeBillboardTuning(controls.token),
      proceduralLeafLighting: resolveTreeLeafLightingTuning(controls.token),
      proceduralCanopyOcclusion: {
        ...this._canopyOcclusionTuning,
        ...summarizeProceduralTreeCanopyOcclusion(batch.canopyOpticalDepths, this._canopyOcclusionTuning)
      },
      proceduralTrunkMaterial: readTrunkMaterialTuning(batch.trunkBatches[0].ownedMaterial!),
      proceduralLeafMaskId: presetLeafMaskId,
      proceduralLeafMaskSource: this._ownedCustomLeafMask ? "custom" : "preset",
      proceduralLeafMaskLabel:
        this._ownedCustomLeafMask?.label ??
        (presetLeafMaskId === batch.recipe.leafMaskId ? batch.recipe.leafMaskLabel : undefined) ??
        presetLeafMaskId,
      proceduralLeafMaskResolution: [activeLeafMask.width, activeLeafMask.height],
      proceduralLeafAlphaCutoff: batch.crownBatches[0].ownedMaterial?.shaderData.getFloat(MATERIAL_ALPHA_CUTOFF) ?? 0,
      proceduralLeafColorSource: "base-color",
      proceduralBranchCountsByLod: batch.proceduralBranchCountsByLod,
      proceduralTrunkTrianglesByLod: [...batch.proceduralTrunkTrianglesByLod],
      proceduralLeafTrianglesByLod: [...batch.proceduralLeafTrianglesByLod],
      proceduralTrianglesByLod: [...batch.proceduralTrianglesByLod],
      ...(batch.recipe.proceduralGate ? { proceduralGate: { ...batch.recipe.proceduralGate } } : {}),
      lod: {
        simulatedDistance: this._simulatedDistance,
        automaticDistance: this._automaticDistance,
        transitioning: this._transitioningTrees > 0,
        transitionProgress: this._transitionProgress,
        activeLevels: [...this._lodTreeCounts]
          .map((treeInstances, lodIndex) => ({ treeInstances, lodIndex }))
          .filter(({ treeInstances }) => treeInstances > 0)
          .map(({ treeInstances, lodIndex }) => ({
            lodIndex,
            representation: "procedural-3d" as const,
            coverage: this._lodCoverageSums[lodIndex] / treeInstances,
            leafInstances: this._lodLeafCounts[lodIndex],
            treeInstances
          })),
        leafInstancesByLod: [...this._lodLeafCounts],
        treeInstancesByLod: [...this._lodTreeCounts],
        automaticDistanceRange: [...this._automaticDistanceRange] as [number, number],
        profile: detachLodProfile(this._lodProfile)
      },
      controls: treeAssemblyControls(controls.token, controls.stageOrigin),
      variation: assetPopulationVariationDiagnostics(controls.token.rootSeed, this._plan.instances)
    };
  }

  override onUpdate(deltaTime: number): void {
    if (!this._batch) return;
    this._elapsedSeconds += deltaTime;
    if (!this._automaticDistance && this._transitioningTrees === 0) return;
    if (this._automaticDistance && !this._cameraMoved() && this._transitioningTrees === 0) return;
    this._applyLod(false);
  }

  override onDestroy(): void {
    this._entrancePlayback++;
    if (this._batch) this._disposeBatch(this._batch);
    this._destroyCustomLeafMask();
    this._batch = null;
    this._plan = null;
    this._controls = null;
    this._sourceLibrary = null;
    this._camera = null;
    this._lodInstances = [];
  }

  private _createBatch(
    plan: TreeAssemblyPlan,
    recipe: TreeRecipeSource,
    leafCountTuning: TreeLeafCountTuning,
    distributionTuning: ProceduralTreeDistributionTuning,
    leafCardTuning: TreeLeafCardTuning,
    billboardTuning: TreeBillboardTuning,
    leafLightingTuning: TreeLeafLightingTuning,
    trunkMaterialTuning: TreeTrunkMaterialTuning,
    leafMask: Texture2D
  ): TreeAssemblyBatch {
    const root = this.entity.createChild(`${recipe.label} procedural batches`);
    root.isActive = false;
    const instanceRoots = createTreeInstanceRoots(root, plan, this._treeUniformScale);
    const foliageTuning = createProceduralTreeFoliageGeometryTuning(leafCardTuning, billboardTuning);
    const proceduralLods = createProceduralTreeMeshes(
      this.engine,
      recipe,
      leafCountTuning,
      distributionTuning,
      recipe.proceduralRuntime
        ? { ...foliageTuning, lodScales: recipe.proceduralRuntime.foliageLodScales }
        : foliageTuning,
      recipe.proceduralRuntime?.triangleBudget
    );
    const revealLocalMinimumY = Math.min(
      ...proceduralLods.flatMap((lod) => [lod.trunk.bounds.min.y, lod.crown.bounds.min.y])
    );
    const revealLocalMaximumY = Math.max(
      ...proceduralLods.flatMap((lod) => [lod.trunk.bounds.max.y, lod.crown.bounds.max.y])
    );
    const revealLocalHeight = Math.max(1, revealLocalMaximumY - revealLocalMinimumY);
    const windScaleCompensation = resolveProceduralTreeWindScaleCompensation(
      Array.from({ length: plan.instances.count }, (_, index) => {
        const offset = index * 16;
        return [
          plan.instances.records[offset + 8],
          plan.instances.records[offset + 9],
          plan.instances.records[offset + 10]
        ] as const;
      })
    );
    proceduralLods.forEach((lod) => {
      expandProceduralTreeWindBounds(lod.trunk, 0, windScaleCompensation);
      expandProceduralTreeWindBounds(
        lod.crown,
        resolveProceduralTreeLeafFlutterRadius(lod.leafGpuFrames, lod.leafGpuFrameScale),
        windScaleCompensation
      );
    });
    const ownedProceduralMeshes = proceduralLods.flatMap((lod) => [lod.trunk, lod.crown]);
    const trunkBatches: InstancedBatch[] = [];
    const crownBatches: InstancedBatch[] = [];
    let ownedLeafGpuData: ProceduralTreeLeafGpuData | null = null;
    try {
      ownedLeafGpuData = new ProceduralTreeLeafGpuData(
        this.engine,
        proceduralLods[0].leafGpuFrames,
        `${recipe.label} Asset Assembly population`,
        proceduralLods[0].leafNormalField
      );
      for (let lodIndex = 0; lodIndex < proceduralLods.length; lodIndex++) {
        const trunkBatch = this._createProceduralMeshBatch(
          instanceRoots,
          plan,
          recipe.trunkMaterial,
          "trunk",
          lodIndex,
          0,
          proceduralLods[lodIndex].trunk,
          proceduralLods[lodIndex].generatedHeight
        );
        configureTrunkMaterialTuning(trunkBatch.ownedMaterial!, trunkMaterialTuning);
        configureTrunkVerticalGradientBounds(
          trunkBatch.ownedMaterial!,
          proceduralLods[lodIndex].trunk.bounds.min.y,
          proceduralLods[lodIndex].trunk.bounds.max.y
        );
        trunkBatches.push(trunkBatch);
        const crownBatch = this._createProceduralMeshBatch(
          instanceRoots,
          plan,
          recipe.leafMaterial,
          "crown",
          lodIndex,
          proceduralLods[lodIndex].leafCount,
          proceduralLods[lodIndex].crown,
          proceduralLods[lodIndex].generatedHeight,
          leafMask,
          recipe.proceduralRuntime?.preserveLeafMaterialFeatures ?? false,
          recipe.proceduralRuntime?.leafCardFacingMode ?? "fixed",
          ownedLeafGpuData,
          proceduralLods[lodIndex].leafGpuFrameScale
        );
        configureLeafLightingTuning(crownBatch.ownedMaterial!, leafLightingTuning);
        crownBatches.push(crownBatch);
      }
      [...trunkBatches, ...crownBatches].forEach((batch) =>
        batch.renderers.forEach((renderer, treeIndex) => {
          const sourceOffset = treeIndex * 16;
          const verticalScale = plan.instances.records[sourceOffset + 9];
          configureRevealRenderer(
            renderer,
            plan.instances.records[sourceOffset + 1] + revealLocalMinimumY * verticalScale,
            revealLocalHeight * Math.abs(verticalScale),
            1.8 * Math.abs(verticalScale)
          );
        })
      );
      const diagnosticLod = proceduralLods[0];
      const diagnosticFrameById = new Map(diagnosticLod.leafGpuFrames.map((frame) => [frame.leafId, frame]));
      const diagnosticSourceLodIndex = diagnosticLod.leafGpuFrameScale[3];
      return {
        root,
        instanceRoots,
        recipe,
        trunkBatches: trunkBatches as unknown as ProceduralTreeLodTuple<InstancedBatch>,
        crownBatches: crownBatches as unknown as ProceduralTreeLodTuple<InstancedBatch>,
        ownedProceduralMeshes,
        ownedLeafGpuData,
        canopyOpticalDepths: diagnosticLod.leafCardIds.map(
          (leafId) => diagnosticFrameById.get(leafId)!.canopyOpticalDepthByLod[diagnosticSourceLodIndex]
        ),
        proceduralProfile: resolveSaplingTreeParameters(recipe).profile,
        proceduralDistributionTuning: detachTreeDistributionTuning(distributionTuning),
        proceduralBranchCountsByLod: proceduralLods.map((lod) => lod.branchCounts) as [
          readonly [number, number, number],
          readonly [number, number, number],
          readonly [number, number, number],
          readonly [number, number, number]
        ],
        proceduralTrunkTrianglesByLod: proceduralLods.map(
          (lod) => lod.trunkTriangleCount
        ) as unknown as ProceduralTreeLodTuple<number>,
        proceduralLeafTrianglesByLod: proceduralLods.map(
          (lod) => lod.leafTriangleCount
        ) as unknown as ProceduralTreeLodTuple<number>,
        proceduralTrianglesByLod: proceduralLods.map(
          (lod) => lod.triangleCount
        ) as unknown as ProceduralTreeLodTuple<number>
      };
    } catch (error) {
      [...trunkBatches, ...crownBatches].forEach(disposeBatch);
      ownedProceduralMeshes.forEach((mesh) => mesh.destroy());
      ownedLeafGpuData?.destroy();
      root.destroy();
      throw error;
    }
  }

  private _createProceduralMeshBatch(
    instanceRoots: readonly Entity[],
    plan: TreeAssemblyPlan,
    sourceMaterial: Material,
    kind: "trunk" | "crown",
    lodIndex: number,
    leafCount: number,
    sourceMesh: ModelMesh,
    generatedHeight: number,
    leafMask: Texture2D | null = null,
    preserveLeafMaterialFeatures = false,
    leafCardFacingMode: "fixed" | "camera-facing" = "fixed",
    leafGpuData?: ProceduralTreeLeafGpuData,
    leafGpuFrameScale?: ProceduralTreeLeafGpuFrameScale
  ): InstancedBatch {
    if (kind === "crown" && (!leafGpuData || !leafGpuFrameScale)) {
      throw new Error("Procedural tree crown batches require their canonical GPU leaf frames");
    }
    const ownedMaterial = leafMask
      ? createProceduralLeafPbrMaterial(
          sourceMaterial,
          leafMask,
          generatedHeight,
          preserveLeafMaterialFeatures,
          this._canopyOcclusionTuning
        )
      : createProceduralBarkPbrMaterial(sourceMaterial, generatedHeight);
    const rawCardMaterial = leafMask ? createProceduralRawLeafCardMaterial(sourceMaterial) : null;
    const vertexNormalMaterial = leafMask ? createProceduralLeafVertexNormalMaterial(sourceMaterial) : null;
    const renderers = instanceRoots.map((instanceRoot, treeIndex) => {
      const entity = instanceRoot.createChild(`${kind} LOD${lodIndex}`);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = sourceMesh;
      const displayMaterial =
        kind !== "crown" || this._leafDisplayMode === "material"
          ? ownedMaterial
          : this._leafDisplayMode === "raw-cards"
            ? rawCardMaterial
            : vertexNormalMaterial;
      renderer.setMaterial(displayMaterial ?? ownedMaterial);
      renderer.castShadows = this._shadows && (kind !== "crown" || this._leafShadows);
      renderer.receiveShadows = true;
      renderer.enableVertexColor = true;
      configurePrefabInstanceRenderer(renderer);
      configureTreeRendererColor(renderer, plan, treeIndex, kind === "trunk");
      if (kind === "crown") leafGpuData!.bind(renderer, leafGpuFrameScale!);
      if (leafMask && leafCardFacingMode === "camera-facing") {
        renderer.shaderData.enableMacro(PROCEDURAL_TREE_LEAF_BILLBOARD_MACRO);
      }
      renderer.enabled = false;
      return renderer;
    });
    return {
      renderers,
      drawable: sourceMesh.subMeshes[0].count > 0,
      authoredCastShadows: true,
      leafCount,
      ownedMaterial,
      rawCardMaterial,
      vertexNormalMaterial,
      count: 0
    };
  }

  private _applyLod(snap: boolean): void {
    const batch = this._batch;
    const plan = this._plan;
    const camera = this._camera;
    if (!batch || !plan || !camera) return;
    const trunkCounts = this._trunkCounts;
    const crownCounts = this._crownCounts;
    trunkCounts.fill(0);
    crownCounts.fill(0);
    for (let lodIndex = 0; lodIndex < PROCEDURAL_TREE_LOD_COUNT; lodIndex++) {
      resetBatchRenderers(batch.trunkBatches[lodIndex]);
      resetBatchRenderers(batch.crownBatches[lodIndex]);
    }
    this._lodLeafCounts.fill(0);
    this._lodTreeCounts.fill(0);
    this._lodCoverageSums.fill(0);
    let minimumDistance = Number.POSITIVE_INFINITY;
    let maximumDistance = 0;
    let distanceSum = 0;
    let transitioningTrees = 0;
    let transitionProgressSum = 0;
    const cameraPosition = camera.entity.transform.worldPosition;
    this._lastCameraPosition[0] = cameraPosition.x;
    this._lastCameraPosition[1] = cameraPosition.y;
    this._lastCameraPosition[2] = cameraPosition.z;

    for (let treeIndex = 0; treeIndex < plan.instances.count; treeIndex++) {
      const sourceOffset = treeIndex * 16;
      const treeX = plan.instances.records[sourceOffset];
      const treeY = plan.instances.records[sourceOffset + 1];
      const treeZ = plan.instances.records[sourceOffset + 2];
      const distance = this._automaticDistance
        ? Math.hypot(cameraPosition.x - treeX, cameraPosition.y - treeY, cameraPosition.z - treeZ)
        : this._simulatedDistance;
      minimumDistance = Math.min(minimumDistance, distance);
      maximumDistance = Math.max(maximumDistance, distance);
      distanceSum += distance;
      const observation = this._lodObservation;
      observation.timeSeconds = this._elapsedSeconds;
      observation.screenRelativeHeight = treeAssemblyLodProjection(distance);
      const states = snap
        ? this._lodInstances[treeIndex].snap(observation)
        : this._lodInstances[treeIndex].updateInto(observation, this._lodRendererSetScratch);
      if (states.length > 1) {
        transitioningTrees++;
        transitionProgressSum += stateCoverage(states[1]);
      }
      for (let stateIndex = 0; stateIndex < states.length; stateIndex++) {
        const state = states[stateIndex]!;
        const coverage = stateCoverage(state);
        const lodIndex = state.lodIndex;
        this._lodTreeCounts[lodIndex]++;
        this._lodCoverageSums[lodIndex] += coverage;
        activateBatchRenderer(batch.trunkBatches[lodIndex], treeIndex, state.signedFade);
        activateBatchRenderer(batch.crownBatches[lodIndex], treeIndex, state.signedFade);
        trunkCounts[lodIndex]++;
        crownCounts[lodIndex]++;
        this._lodLeafCounts[lodIndex] += batch.crownBatches[lodIndex].leafCount;
      }
    }

    let draws = 0;
    for (let lodIndex = 0; lodIndex < PROCEDURAL_TREE_LOD_COUNT; lodIndex++) {
      draws += publishBatch(batch.trunkBatches[lodIndex], trunkCounts[lodIndex]);
      draws += publishBatch(batch.crownBatches[lodIndex], crownCounts[lodIndex]);
    }
    this._simulatedDistance = this._automaticDistance ? distanceSum / plan.instances.count : this._simulatedDistance;
    this._automaticDistanceRange[0] = minimumDistance;
    this._automaticDistanceRange[1] = maximumDistance;
    this._transitioningTrees = transitioningTrees;
    this._transitionProgress = transitioningTrees > 0 ? transitionProgressSum / transitioningTrees : 1;
    this._trunkInstances = sumCounts(trunkCounts);
    this._leafInstances = sumCounts(this._lodLeafCounts);
    this._instancedDraws = draws;
  }

  private _disposeBatch(batch: TreeAssemblyBatch): void {
    [...batch.trunkBatches, ...batch.crownBatches].forEach(disposeBatch);
    batch.ownedProceduralMeshes.forEach((mesh) => mesh.destroy());
    batch.ownedLeafGpuData.destroy();
    batch.root.destroy();
  }

  private _setReveal(progress: number): void {
    const batch = this._batch;
    if (!batch) return;
    for (let lodIndex = 0; lodIndex < PROCEDURAL_TREE_LOD_COUNT; lodIndex++) {
      setBatchRevealProgress(batch.trunkBatches[lodIndex], progress);
      setBatchRevealProgress(batch.crownBatches[lodIndex], progress);
    }
  }

  private _cameraMoved(): boolean {
    const position = this._camera?.entity.transform.worldPosition;
    return Boolean(
      position &&
        (Math.abs(position.x - this._lastCameraPosition[0]) > 0.0001 ||
          Math.abs(position.y - this._lastCameraPosition[1]) > 0.0001 ||
          Math.abs(position.z - this._lastCameraPosition[2]) > 0.0001)
    );
  }

  private _requireSourceLibrary(): TreeAssemblySourceLibrary {
    if (!this._sourceLibrary) throw new Error("Tree Assembly source library is unavailable");
    return this._sourceLibrary;
  }

  private _resolveLeafMask(recipe: TreeRecipeSource, maskId: TreeLeafMaskId): Texture2D {
    if (maskId === recipe.leafMaskId) return recipe.leafMask;
    const source = this._requireSourceLibrary().treeLeafMasks.find((candidate) => candidate.id === maskId);
    if (!source) throw new Error(`Tree leaf mask "${maskId}" is unavailable in the production catalog`);
    return source.texture;
  }

  private _destroyCustomLeafMask(): void {
    this._ownedCustomLeafMask?.texture.destroy();
    this._ownedCustomLeafMask = null;
  }
}

function createLodDefinition(profile: TreeAssemblyLodProfile): TerrainLodGroupRuntime {
  return new TerrainLodGroupRuntime(
    {
      fadeMode: "CrossFade",
      animateCrossFading: true,
      localReferencePoint: [0, 0, 0],
      size: 1,
      lods: [
        { screenRelativeTransitionHeight: 1 / profile.switchDistances[0] },
        { screenRelativeTransitionHeight: 1 / profile.switchDistances[1] },
        { screenRelativeTransitionHeight: 1 / profile.switchDistances[2] },
        { screenRelativeTransitionHeight: 0 }
      ]
    },
    TREE_ASSEMBLY_LOD_CROSS_FADE_SECONDS
  );
}

function createTreeInstanceRoots(root: Entity, plan: TreeAssemblyPlan, treeUniformScale: number): readonly Entity[] {
  return Array.from({ length: plan.instances.count }, (_, treeIndex) => {
    const offset = treeIndex * 16;
    const instance = root.createChild(`tree ${treeIndex}`);
    instance.transform.setPosition(
      plan.instances.records[offset],
      plan.instances.records[offset + 1],
      plan.instances.records[offset + 2]
    );
    instance.transform.setRotationQuaternion(
      plan.instances.records[offset + 4],
      plan.instances.records[offset + 5],
      plan.instances.records[offset + 6],
      plan.instances.records[offset + 7]
    );
    instance.transform.setScale(
      plan.instances.records[offset + 8] * treeUniformScale,
      plan.instances.records[offset + 9] * treeUniformScale,
      plan.instances.records[offset + 10] * treeUniformScale
    );
    return instance;
  });
}

function configureTreeRendererColor(
  renderer: MeshRenderer,
  plan: TreeAssemblyPlan,
  treeIndex: number,
  neutralColor: boolean
): void {
  const offset = treeIndex * 16;
  renderer.shaderData.setVector4(
    ASSET_ASSEMBLY_COLOR,
    neutralColor
      ? new Vector4(1, 1, 1, 1)
      : new Vector4(
          plan.instances.records[offset + 12],
          plan.instances.records[offset + 13],
          plan.instances.records[offset + 14],
          1
        )
  );
}

function publishBatch(batch: InstancedBatch, count: number): number {
  const submittedCount = batch.drawable ? count : 0;
  batch.count = submittedCount;
  return Number(submittedCount > 0);
}

function resetBatchRenderers(batch: InstancedBatch): void {
  batch.count = 0;
  for (let index = 0; index < batch.renderers.length; index++) batch.renderers[index]!.enabled = false;
}

function setBatchRevealProgress(batch: InstancedBatch, progress: number): void {
  for (let index = 0; index < batch.renderers.length; index++) {
    batch.renderers[index]!.shaderData.setFloat(REVEAL_PROGRESS, progress);
  }
}

function activateBatchRenderer(batch: InstancedBatch, treeIndex: number, signedFade: number): void {
  const renderer = batch.renderers[treeIndex];
  if (!renderer) throw new RangeError(`Tree renderer index ${treeIndex} exceeds its batch capacity`);
  renderer.shaderData.setFloat(LOD_FADE, signedFade);
  renderer.enabled = batch.drawable;
}

function disposeBatch(batch: InstancedBatch): void {
  batch.renderers.forEach((renderer) => {
    renderer.mesh = null!;
    renderer.setMaterials([]);
  });
  batch.ownedMaterial?.destroy();
  batch.rawCardMaterial?.destroy();
  batch.vertexNormalMaterial?.destroy();
}

export function createProceduralBarkPbrMaterial(source: Material, generatedHeight: number): Material {
  const material = source.clone();
  material.name = `${source.name} procedural bark PBR`;
  configureProceduralTreeWindMaterial(material, generatedHeight, false);
  material.shaderData.enableMacro(TRUNK_VERTICAL_GRADIENT_MACRO);
  material.shaderData.setColor(MATERIAL_TRUNK_VERTICAL_GRADIENT_BOTTOM_COLOR, new Color(1, 1, 1, 1));
  material.shaderData.setFloat(MATERIAL_TRUNK_VERTICAL_GRADIENT_BOTTOM_STRENGTH, 0);
  material.shaderData.setColor(MATERIAL_TRUNK_VERTICAL_GRADIENT_TOP_COLOR, new Color(0, 0, 0, 1));
  material.shaderData.setFloat(MATERIAL_TRUNK_VERTICAL_GRADIENT_TOP_STRENGTH, 0);
  return material;
}

export function createProceduralLeafPbrMaterial(
  source: Material,
  texture: Texture2D,
  generatedHeight: number,
  preserveSourceFeatures = false,
  canopyOcclusionTuning: ProceduralTreeCanopyOcclusionTuning = DEFAULT_PROCEDURAL_TREE_CANOPY_OCCLUSION_TUNING
): Material {
  const material = source.clone();
  material.name = `${source.name} procedural leaf PBR alpha-test`;
  // The source material's authored crown detail macros require its original atlas and vertex
  // payload. A procedural card owns only Base Color plus its catalog leaf mask.
  if (!preserveSourceFeatures) {
    for (const macro of [
      SMOOTHNESS_TEXTURE_MACRO,
      SECOND_COLOR_MACRO,
      SECOND_COLOR_VERTEX_GRADIENT_MACRO,
      SECOND_COLOR_WORLD_NOISE_MACRO,
      WIND_MACRO
    ]) {
      material.shaderData.disableMacro(macro);
    }
  }
  configureProceduralLeafMaterial(material, texture);
  configureProceduralTreeWindMaterial(material, generatedHeight, true);
  configureProceduralTreeCanopyOcclusionMaterial(material, canopyOcclusionTuning);
  return material;
}

/**
 * Binds one shared procedural-tree wind contract to bark or foliage.
 * The material remains shared by every instance; only the existing Scene wind uniforms animate it.
 */
export function configureProceduralTreeWindMaterial(material: Material, generatedHeight: number, leaf: boolean): void {
  if (!Number.isFinite(generatedHeight) || generatedHeight <= 0) {
    throw new RangeError("Procedural tree wind requires a positive generated height");
  }
  configureProceduralWindMaterial(material, leaf);
  material.shaderData.disableMacro("MATERIAL_WIND_PROCEDURAL_PLANT");
  material.shaderData.setFloat(MATERIAL_PROCEDURAL_TREE_HEIGHT, generatedHeight);
}

/** Plant compilation normalizes wind height in the mesh, retaining shared materials across species and LODs. */
export function configureProceduralPlantWindMaterial(material: Material, leaf: boolean): void {
  configureProceduralWindMaterial(material, leaf);
  material.shaderData.enableMacro("MATERIAL_WIND_PROCEDURAL_PLANT");
}

function configureProceduralWindMaterial(material: Material, leaf: boolean): void {
  material.shaderData.enableMacro(WIND_MACRO);
  material.shaderData.enableMacro(PROCEDURAL_TREE_WIND_MACRO);
  if (leaf) {
    material.shaderData.enableMacro(LEAF_CLIMATE_MACRO);
    material.shaderData.disableMacro(BRANCH_CLIMATE_MACRO);
  } else {
    material.shaderData.enableMacro(BRANCH_CLIMATE_MACRO);
    material.shaderData.disableMacro(LEAF_CLIMATE_MACRO);
  }
  material.shaderData.setVector4(
    MATERIAL_PROCEDURAL_TREE_WIND_PARAMS,
    new Vector4(
      PROCEDURAL_TREE_WIND_PARAMS.maximumWholeTreeBendRadians,
      PROCEDURAL_TREE_WIND_PARAMS.wholeTreeFrequencyHz,
      PROCEDURAL_TREE_WIND_PARAMS.maximumLeafFlutterRadians,
      PROCEDURAL_TREE_WIND_PARAMS.leafFlutterFrequencyHz
    )
  );
}

/** Enables the mobile canopy coefficient without adding leaf-card ShadowCaster submissions. */
export function configureProceduralTreeCanopyOcclusionMaterial(
  material: Material,
  tuning: ProceduralTreeCanopyOcclusionTuning
): void {
  validateProceduralTreeCanopyOcclusionTuning(tuning);
  if (tuning.enabled) {
    material.shaderData.enableMacro(CANOPY_OCCLUSION_MACRO);
  } else {
    material.shaderData.disableMacro(CANOPY_OCCLUSION_MACRO);
  }
  material.shaderData.setFloat(MATERIAL_CANOPY_OCCLUSION_DENSITY, tuning.density);
  material.shaderData.setColor(
    MATERIAL_CANOPY_OCCLUSION_COLOR,
    new Color(
      srgb8ToLinear(tuning.colorRgb[0]),
      srgb8ToLinear(tuning.colorRgb[1]),
      srgb8ToLinear(tuning.colorRgb[2]),
      1
    )
  );
}

export function createProceduralRawLeafCardMaterial(source: Material): Material {
  const material = source.clone();
  material.name = `${source.name} procedural raw orientation cards`;
  for (const macro of [
    BASE_TEXTURE_MACRO,
    SMOOTHNESS_TEXTURE_MACRO,
    SECOND_COLOR_MACRO,
    TRANSLUCENCY_MACRO,
    LEAF_CLIMATE_MACRO,
    SECOND_COLOR_VERTEX_GRADIENT_MACRO,
    SECOND_COLOR_WORLD_NOISE_MACRO
  ]) {
    material.shaderData.disableMacro(macro);
  }
  material.shaderData.disableMacro(WIND_MACRO);
  material.shaderData.setColor(MATERIAL_BASE_COLOR, new Color(0.82, 0.88, 0.86, 1));
  material.shaderData.setFloat(MATERIAL_SMOOTHNESS, 0);
  material.shaderData.setFloat(MATERIAL_LIGHTING_FLATNESS, 0);
  return material;
}

export function createProceduralLeafVertexNormalMaterial(source: Material): Material {
  const material = createProceduralRawLeafCardMaterial(source);
  material.name = `${source.name} procedural leaf vertex normals`;
  material.shaderData.enableMacro(LEAF_VERTEX_NORMAL_DEBUG_MACRO);
  return material;
}

export function configureProceduralLeafMaterial(material: Material, texture: Texture2D): void {
  material.shaderData.enableMacro(BASE_TEXTURE_MACRO);
  material.shaderData.setTexture(MATERIAL_BASE_TEXTURE, texture);
}

function configurePrefabInstanceRenderer(renderer: MeshRenderer): void {
  configureAssetAssemblyRendererInstance(renderer);
  renderer.shaderData.enableMacro(LOD_DITHER_MACRO);
  renderer.shaderData.enableMacro(GENERATION_REVEAL_MACRO);
  renderer.shaderData.setFloat(LOD_FADE, 1);
}

export function configureLeafLightingTuning(material: Material, tuning: TreeLeafLightingTuning): void {
  const shaderData = material.shaderData;
  shaderData.setColor(
    MATERIAL_BASE_COLOR,
    new Color(
      srgb8ToLinear(tuning.baseColorRgb[0]),
      srgb8ToLinear(tuning.baseColorRgb[1]),
      srgb8ToLinear(tuning.baseColorRgb[2]),
      0
    )
  );
  shaderData.setColor(
    MATERIAL_SECOND_COLOR,
    new Color(
      srgb8ToLinear(tuning.secondColorRgb[0]),
      srgb8ToLinear(tuning.secondColorRgb[1]),
      srgb8ToLinear(tuning.secondColorRgb[2]),
      0
    )
  );
  shaderData.setColor(
    MATERIAL_TRANSLUCENCY_COLOR,
    new Color(
      srgb8ToLinear(tuning.translucencyColorRgb[0]),
      srgb8ToLinear(tuning.translucencyColorRgb[1]),
      srgb8ToLinear(tuning.translucencyColorRgb[2]),
      0
    )
  );
  shaderData.setFloat(MATERIAL_SECOND_COLOR_LEVEL, tuning.secondColorLevel);
  shaderData.setFloat(MATERIAL_SECOND_COLOR_GRADIENT, tuning.secondColorGradient);
  shaderData.setFloat(MATERIAL_LEAF_ALBEDO_BRIGHTNESS, tuning.albedoBrightness);
  shaderData.setFloat(MATERIAL_LEAF_ALBEDO_DESATURATION, tuning.albedoDesaturation);
  shaderData.setFloat(MATERIAL_LEAF_ALBEDO_TEXTURE_BLEND, tuning.albedoTextureBlend);
  shaderData.setFloat(MATERIAL_LEAF_BASE_AO_INFLUENCE, tuning.baseAoInfluence);
  shaderData.setFloat(MATERIAL_LEAF_GLANCING_ANGLE_CUT, tuning.glancingAngleCut);
  shaderData.setFloat(MATERIAL_LEAF_FLIP_BACKFACE_NORMALS, tuning.flipBackfaceNormals ? 1 : 0);
  shaderData.setFloat(MATERIAL_TRANSLUCENCY_INTENSITY, tuning.translucencyIntensity);
  shaderData.setFloat(MATERIAL_TRANSLUCENCY_AO_INFLUENCE, tuning.translucencyAoInfluence);
  shaderData.setFloat(MATERIAL_TRANSLUCENCY_NORMAL_DISTORTION, tuning.normalDistortion);
  shaderData.setFloat(MATERIAL_TRANSLUCENCY_SCATTERING, tuning.scatteringExponent);
  shaderData.setFloat(MATERIAL_TRANSLUCENCY_DIRECT, tuning.directStrength);
  shaderData.setFloat(MATERIAL_TRANSLUCENCY_AMBIENT, tuning.ambientStrength);
  shaderData.setFloat(MATERIAL_TRANSLUCENCY_SHADOW_STRENGTH, tuning.shadowStrength);
}

export function configureTrunkMaterialTuning(material: Material, tuning: TreeTrunkMaterialTuning): void {
  const shaderData = material.shaderData;
  shaderData.setColor(
    MATERIAL_BASE_COLOR,
    new Color(
      srgb8ToLinear(tuning.baseColorRgb[0]),
      srgb8ToLinear(tuning.baseColorRgb[1]),
      srgb8ToLinear(tuning.baseColorRgb[2]),
      1
    )
  );
  shaderData.setFloat(MATERIAL_TILING, tuning.tiling);
  shaderData.setFloat(MATERIAL_NORMAL_SCALE, tuning.normalStrength);
  shaderData.setFloat(MATERIAL_SMOOTHNESS, tuning.smoothness);
  shaderData.setFloat(MATERIAL_METALLIC, tuning.metallic);
  shaderData.setColor(
    MATERIAL_TRUNK_VERTICAL_GRADIENT_BOTTOM_COLOR,
    new Color(
      srgb8ToLinear(tuning.verticalGradientBottomColorRgb[0]),
      srgb8ToLinear(tuning.verticalGradientBottomColorRgb[1]),
      srgb8ToLinear(tuning.verticalGradientBottomColorRgb[2]),
      1
    )
  );
  shaderData.setFloat(MATERIAL_TRUNK_VERTICAL_GRADIENT_BOTTOM_STRENGTH, tuning.verticalGradientBottomStrength);
  shaderData.setColor(
    MATERIAL_TRUNK_VERTICAL_GRADIENT_TOP_COLOR,
    new Color(
      srgb8ToLinear(tuning.verticalGradientTopColorRgb[0]),
      srgb8ToLinear(tuning.verticalGradientTopColorRgb[1]),
      srgb8ToLinear(tuning.verticalGradientTopColorRgb[2]),
      1
    )
  );
  shaderData.setFloat(MATERIAL_TRUNK_VERTICAL_GRADIENT_TOP_STRENGTH, tuning.verticalGradientTopStrength);
}

/** Normalizes the object-space gradient independently for every authored tree height. */
export function configureTrunkVerticalGradientBounds(material: Material, minimumY: number, maximumY: number): void {
  if (!Number.isFinite(minimumY) || !Number.isFinite(maximumY) || maximumY <= minimumY) {
    throw new RangeError("Tree trunk vertical-gradient bounds must define a finite positive height");
  }
  material.shaderData.setVector4(
    MATERIAL_TRUNK_VERTICAL_GRADIENT_BOUNDS,
    new Vector4(minimumY, 1 / (maximumY - minimumY), 0, 0)
  );
}

function readTrunkMaterialTuning(material: Material): TreeTrunkMaterialTuning {
  const shaderData = material.shaderData;
  const baseColor = shaderData.getColor(MATERIAL_BASE_COLOR);
  const gradientBottomColor = shaderData.getColor(MATERIAL_TRUNK_VERTICAL_GRADIENT_BOTTOM_COLOR);
  const gradientTopColor = shaderData.getColor(MATERIAL_TRUNK_VERTICAL_GRADIENT_TOP_COLOR);
  return {
    baseColorRgb: [linearToSrgb8(baseColor.r), linearToSrgb8(baseColor.g), linearToSrgb8(baseColor.b)],
    tiling: readableMaterialFloat(shaderData.getFloat(MATERIAL_TILING)),
    normalStrength: readableMaterialFloat(shaderData.getFloat(MATERIAL_NORMAL_SCALE)),
    smoothness: readableMaterialFloat(shaderData.getFloat(MATERIAL_SMOOTHNESS)),
    metallic: readableMaterialFloat(shaderData.getFloat(MATERIAL_METALLIC)),
    verticalGradientBottomColorRgb: gradientBottomColor
      ? [
          linearToSrgb8(gradientBottomColor.r),
          linearToSrgb8(gradientBottomColor.g),
          linearToSrgb8(gradientBottomColor.b)
        ]
      : [255, 255, 255],
    verticalGradientBottomStrength: readableMaterialFloat(
      shaderData.getFloat(MATERIAL_TRUNK_VERTICAL_GRADIENT_BOTTOM_STRENGTH) ?? 0
    ),
    verticalGradientTopColorRgb: gradientTopColor
      ? [linearToSrgb8(gradientTopColor.r), linearToSrgb8(gradientTopColor.g), linearToSrgb8(gradientTopColor.b)]
      : [0, 0, 0],
    verticalGradientTopStrength: readableMaterialFloat(
      shaderData.getFloat(MATERIAL_TRUNK_VERTICAL_GRADIENT_TOP_STRENGTH) ?? 0
    )
  };
}

function readableMaterialFloat(value: number): number {
  return Number(value.toFixed(6));
}

function srgb8ToLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

function linearToSrgb8(channel: number): number {
  const linear = Math.max(0, Math.min(1, channel));
  const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

function configureRevealRenderer(renderer: MeshRenderer, originY: number, height: number, lift: number): void {
  renderer.shaderData.setFloat(REVEAL_PROGRESS, 1);
  renderer.shaderData.setFloat(REVEAL_ORIGIN_Y, originY);
  renderer.shaderData.setFloat(REVEAL_HEIGHT, height);
  renderer.shaderData.setFloat(REVEAL_LIFT, lift);
}

function stateCoverage(state: { readonly crossFading: boolean; readonly signedFade: number }): number {
  if (!state.crossFading) return 1;
  return state.signedFade >= 0 ? state.signedFade : 1 + state.signedFade;
}

function sumCounts(counts: Uint32Array): number {
  let total = 0;
  for (let index = 0; index < counts.length; index++) total += counts[index];
  return total;
}

function detachLodProfile(profile: TreeAssemblyLodProfile): TreeAssemblyLodProfile {
  return {
    switchDistances: [...profile.switchDistances] as [number, number, number]
  };
}
