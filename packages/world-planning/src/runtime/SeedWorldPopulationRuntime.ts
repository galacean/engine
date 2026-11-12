import {
  DETAIL_TRANSFORM_FLOATS,
  DETAIL_TRANSFORM_STRIDE_BYTES,
  createSeedWorldDetailInstancedMesh,
  type SeedWorldDetailInstancedMesh
} from "./SeedWorldDetailInstancedMesh.ts";
import {
  GrassRockAppearance,
  GRASS_ROCK_APPEARANCE_STRIDE
} from "../integrations/terrain/rock-formation/GrassRockAppearance.ts";
import type { PreparedTerrainUpdate } from "@galacean/engine-terrain/terrain/clipmap/TerrainPreparedUpdate";
import { yieldSeedWorldPreparationTask } from "../world/SeedWorldPreparationTask.ts";
import { seedWorldWaterDetailCellChanged } from "./SeedWorldPopulationWaterImpact.ts";
import { RockGrassPatches, type RockGrassPlacement } from "@galacean/engine-terrain/rock-formation/GrassPatches";
import type { RockGrassSampling } from "@galacean/engine-terrain/rock-formation/GrassSurface";
import { bindRockGrassGroundMaterial } from "../integrations/terrain/rock-formation/RockMaterial";
import type { RockFormationSettings } from "../integrations/terrain/rock-formation/Settings.ts";
import {
  excludeSeedWorldGroundCover,
  groundCoverChangeBounds,
  groundCoverSampleCount,
  groundCoverDensityReader
} from "../world/SeedWorldGroundCoverExclusions.ts";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import {
  grassDensityLodFraction,
  createGrassDensityShuffle,
  advanceGrassDensityShuffle,
  type GrassDensityShuffle
} from "@galacean/engine-vegetation/world/SeedWorldGrassDensityLod";
import { bindSeedWorldGrassRendererColorField as bindGrassColorField } from "@galacean/engine-vegetation/world/SeedWorldGrassColorFieldUniforms";
import { playSeedWorldAuthoringPresentation } from "../world/SeedWorldAuthoringPresentation.ts";
import {
  bindSeedWorldGrassTerrainMaterial,
  bindSeedWorldGrassTerrainSurface,
  type SeedWorldGrassCoverageSampler
} from "./SeedWorldGrassTerrainSurface.ts";
import { WORLD_GENERATION_PRESENTATION } from "../presentation/WorldGenerationPresentation.ts";
import {
  type PopulationInstanceUploadState,
  type PrefabInstanceViewBatch,
  createPopulationViewCaches,
  populationViewCacheMatches,
  capturePopulationViewCache,
  readPopulationWorldBounds,
  extendPopulationWorldBounds,
  appendPrefabInstance,
  createPrefabInstanceViewBatch,
  ensurePrefabInstanceViewBatchCapacity,
  uploadChangedPopulationInstances,
  publishPrefabInstanceViewBatch,
  disposePrefabInstanceViewBatch,
  POPULATION_RENDER_VIEW_COUNT,
  POPULATION_CAMERA_VIEW_INDEX,
  POPULATION_WORLD_BOUNDS_FLOATS
} from "../world/SeedWorldInstanceBatch.ts";
import {
  BoundingFrustum,
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Camera,
  ContainmentType,
  type Engine,
  Entity,
  type Material,
  Matrix,
  MeshRenderer,
  RenderViewType,
  SetDataOptions,
  type RenderViewCullingContext,
  type RenderViewCullingSource,
  type RenderViewCullingSourceRegistration,
  type ModelMesh,
  ShaderMacro,
  ShaderProperty,
  VertexElement,
  VertexElementFormat,
  Vector4,
  Vector3
} from "@galacean/engine";
import {
  createTerrainLodRendererSetScratch,
  TerrainLodGroupRuntime,
  type TerrainLodGroupInstance
} from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRuntime";
import type { TerrainLodRendererTuning } from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import {
  ASSET_ENTRANCE_LIFT_METRES,
  playRendererAssetEntranceEffect,
  setRendererAssetEntranceProgressValues,
  settleRendererAssetEntranceEffect,
  setAssetEntranceRevealRangeValues
} from "@galacean/engine-vegetation/asset-assembly/AssetEntranceEffect";
import {
  ASSET_ASSEMBLY_ENTRANCE_DURATION_MS,
  VEGETATION_AUTHORING_REFERENCE_SCALE
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyRenderProfile";
import { createSeedWorldDetailEntranceRecords, positionKey } from "../world/SeedWorldDetailEntrance.ts";
import type {
  AtomicAssemblySource,
  AtomicAssemblySourceFamily,
  AssetAssemblySourceLibrary,
  ProductionLodGroupProfile,
  TreeRecipeSource
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import { productionPrefabDistanceFade } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import type { ProceduralTreeRuntimeAuthoringProfile } from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeAuthoringState";
import {
  validateTreeLeafLightingTuning,
  type TreeLeafLightingTuning
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyPresetFactory";
import {
  configureLeafLightingTuning,
  configureTrunkMaterialTuning,
  configureTrunkVerticalGradientBounds,
  createProceduralBarkPbrMaterial,
  createProceduralLeafPbrMaterial,
  expandProceduralTreeWindBounds,
  resolveProceduralTreeLeafFlutterRadius,
  resolveProceduralTreeWindScaleCompensation
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyRuntime";
import {
  createTreeAssemblyInstanceStorage,
  createTreeAssemblyInstancedMesh,
  TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS,
  TREE_ASSEMBLY_COMPACT_LOD_FADE_FLOAT_OFFSET,
  TREE_ASSEMBLY_INSTANCE_FLOATS,
  type TreeAssemblyInstanceStorage,
  type TreeAssemblyInstancedMesh
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyInstancedMesh";
import {
  createProceduralTreeFoliageGeometryTuning,
  createProceduralTreeMeshesForLods,
  PROCEDURAL_TREE_LOD_COUNT,
  resolveSaplingTreeParameters,
  type ProceduralTreeLodTuple
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeGenerator";
import {
  ProceduralTreeLeafGpuData,
  type ProceduralTreeLeafGpuFrameScale
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeLeafGpuData";
import { DEFAULT_PROCEDURAL_TREE_CANOPY_OCCLUSION_TUNING } from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeCanopyOcclusion";
import {
  createInstancedBirchPopulationVariationCatalog,
  createInstancedBirchVariationLocalBounds,
  INSTANCED_BIRCH_POPULATION_VARIATION_COUNT,
  instancedBirchVariationSilhouetteScale,
  validateInstancedBirchVariationControls,
  type InstancedBirchPopulationVariation,
  type InstancedBirchVariationControls
} from "@galacean/engine-vegetation/asset-assembly/InstancedBirchVariationRow";
import {
  sampleSeedWorldHeight,
  seedWorldOriginX,
  seedWorldOriginZ,
  decodeSeedWorldHeight,
  sampleSeedWorldPopulation,
  type SeedWorldFields
} from "./SeedWorldFields.ts";
import { SeedWorldLandCover, type SeedWorldPlan } from "../world/SeedWorldPlanner.ts";
import {
  SEED_WORLD_POPULATION_CELL_METRES,
  type SeedWorldDetailDensityField,
  type SeedWorldPopulationInstance,
  type SeedWorldPopulationPreview
} from "./SeedWorldPopulationPlan.ts";
import {
  createSeedWorldDetailCandidateLattice,
  createSeedWorldDetailCandidateRanges,
  createSeedWorldDetailDensitySampler,
  sampleSeedWorldDetailCandidate,
  sampleSeedWorldDetailOwner,
  sampleSeedWorldDetailHeight,
  seedWorldDetailCandidatePassesDensity,
  seedWorldDetailUnitFloat
} from "../world/SeedWorldDetailCandidateLattice.ts";
import {
  getSeedWorldAssetPlacementProfile,
  GRASS_AUTHORED_HEIGHT_METRES,
  DETAIL_HORIZONTAL_SCALE_VARIATION_MINIMUM,
  DETAIL_HORIZONTAL_SCALE_VARIATION_RANGE,
  DETAIL_HORIZONTAL_SCALE_VARIATION_MAXIMUM
} from "../world/SeedWorldAssetPlacementProfile.ts";
import {
  freezeSeedWorldGrassColorFieldTuning,
  type SeedWorldGrassColorFieldBinding,
  type SeedWorldGrassColorFieldTuning
} from "@galacean/engine-vegetation/world/SeedWorldGrassColorField";
import {
  SEED_WORLD_GRASS_DENSITY_PER_SQUARE_METRE,
  SEED_WORLD_GRASS_UNIFORM_SCALE,
  seedWorldGrassCoverageScale,
  seedWorldTerrestrialGrassDensityMultiplier
} from "./SeedWorldGrassAppearance.ts";
import { resolveSeedWorldGrassSurfaceWeight } from "./SeedWorldSurfaceIntent.ts";
import {
  resolveSeedWorldTreeTransitionHeights,
  SEED_WORLD_TREE_SOURCE_LOD_INDICES
} from "../world/SeedWorldRuntimeLodProfile.ts";
import {
  SEED_WORLD_POPULATION_RUNTIME_PROFILE,
  SeedWorldPopulationCellSet,
  seedWorldPopulationDetailFadeTerminalDistance,
  seedWorldPopulationDetailBoundsIsActive,
  validateSeedWorldPopulationRuntimeInputs,
  type SeedWorldPopulationWorld,
  type SeedWorldGroundedPopulationInstance,
  type SeedWorldPopulationRuntimeCategory,
  type SeedWorldPopulationRuntimeCell,
  type SeedWorldResidentPopulationCell
} from "./SeedWorldPopulationRuntimeCell.ts";
import type { SeedWorldAuthoringRuntimeBoundsV1 } from "../world/SeedWorldAuthoringRuntimeDelta.ts";
import type { SeedWorldTreeVariationEditV1 } from "../world/SeedWorldWorldEdit.ts";
import {
  applySeedWorldTreeShapePatch,
  readSeedWorldTreeShapeControls,
  type SeedWorldTreeShapePatch
} from "@galacean/engine-vegetation/world/SeedWorldTreeShapeControls";
import {
  SEED_WORLD_DEFAULT_ROCK_GRASS_TRANSITION_STYLE,
  type SeedWorldRockGrassTransitionStyle
} from "./SeedWorldRockSurfaceStyle.ts";
import type { SeedWorldSolvedRockObb } from "./SeedWorldRockAssemblySolver.ts";
import {
  compileSeedWorldRockSurfaceTrees,
  createSeedWorldRockSurfaceGrassCompiler,
  readSeedWorldGrassRootRadius,
  SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES,
  SEED_WORLD_ROCK_SURFACE_GRASS_TRANSFORM_FLOATS,
  type SeedWorldRockSurfaceGrassCompiler,
  type SeedWorldRockSurfaceGrassDensity,
  type SeedWorldRockSurfaceGrassPatch,
  type SeedWorldRockSurfaceTreeCompilation,
  type SeedWorldRockSurfaceTreePlacement
} from "./SeedWorldRockSurfaceGrass.ts";
import {
  SeedWorldTerrainOcclusionCuller,
  type SeedWorldTerrainOcclusionDiagnostics
} from "./SeedWorldTerrainOcclusionCuller.ts";

type SeedWorldSavedTreeVariation = Readonly<{ instanceId: string; recipeId: string; variationIndex: number }>;

const PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY = 8;
/** Exact share reserved for the undeformed recipe tree; seven authored shapes share the remainder. */
export const SEED_WORLD_PRIMARY_TREE_VARIATION_SHARE = 0.1;
// The initial orbit camera is offset 360m along each horizontal axis; retain a 72m terrain margin beyond it.
const INITIAL_ORBIT_VIEW_CLEARANCE_METRES = 432;
const INSTANCE_MACRO = ShaderMacro.getByName("RENDERER_ASSET_ASSEMBLY_INSTANCE");
const LOD_DITHER_MACRO = ShaderMacro.getByName("RENDERER_LOD_DITHER");
export interface SeedWorldTreeDissolveStyle {
  readonly colorRgb: readonly [number, number, number];
  readonly followLeafHue: boolean;
  readonly spectrum: number;
  readonly brightness: number;
  readonly widthRatio: number;
  readonly minimumWidth: number;
  readonly colorFrequency: number;
  readonly lift: number;
  readonly spectrumBase: number;
  readonly spectrumAmplitude: number;
  readonly phaseR: number;
  readonly phaseG: number;
  readonly phaseB: number;
}

/** Retain the artist's edge saturation/value, taking hue from each variation's authored leaf color. */
export function resolveTreeDissolveEdgeColor(
  edge: readonly number[],
  leaf: readonly number[],
  follow: boolean
): readonly [number, number, number] {
  if (!follow) return [edge[0], edge[1], edge[2]];
  const minimum = Math.min(...leaf),
    maximum = Math.max(...leaf),
    chroma = maximum - minimum;
  const value = Math.max(...edge);
  if (chroma === 0) return [value, value, value];
  const hue =
    ((maximum === leaf[0]
      ? (leaf[1] - leaf[2]) / chroma
      : maximum === leaf[1]
        ? (leaf[2] - leaf[0]) / chroma + 2
        : (leaf[0] - leaf[1]) / chroma + 4) +
      6) %
    6;
  const edgeChroma = value - Math.min(...edge);
  const secondary = edgeChroma * (1 - Math.abs((hue % 2) - 1));
  const sector = Math.floor(hue);
  const rgb = [
    [edgeChroma, secondary, 0],
    [secondary, edgeChroma, 0],
    [0, edgeChroma, secondary],
    [0, secondary, edgeChroma],
    [secondary, 0, edgeChroma],
    [edgeChroma, 0, secondary]
  ][sector];
  return rgb.map((channel) => channel + value - edgeChroma) as [number, number, number];
}

const DEFAULT_TREE_DISSOLVE_STYLE: SeedWorldTreeDissolveStyle = Object.freeze({
  colorRgb: [105, 248, 96] as const,
  followLeafHue: true,
  spectrum: 0.52,
  brightness: 1.44,
  widthRatio: 0.06,
  minimumWidth: 1.19,
  colorFrequency: 0.73,
  lift: 0.74,
  spectrumBase: 0.6,
  spectrumAmplitude: 0.45,
  phaseR: 0.17,
  phaseG: 0.26,
  phaseB: 0.42
});

const GENERATION_REVEAL_MACRO = ShaderMacro.getByName("RENDERER_GENERATION_REVEAL");
const PROCEDURAL_TREE_LEAF_BILLBOARD_MACRO = ShaderMacro.getByName("RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD");
const PROCEDURAL_TREE_GPU_VARIATION_MACRO = ShaderMacro.getByName("RENDERER_PROCEDURAL_TREE_GPU_VARIATION");
const PROCEDURAL_TREE_GPU_BRANCH_VARIATION_MACRO = ShaderMacro.getByName(
  "RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION"
);
const PROCEDURAL_TREE_BARK_UV_SCALE_MACRO = ShaderMacro.getByName("RENDERER_PROCEDURAL_TREE_BARK_UV_SCALE");
const PROCEDURAL_TREE_VARIATION_CATALOG_MACRO = ShaderMacro.getByName("RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG");
const REVEAL_LIFT = ShaderProperty.getByName("renderer_GenerationRevealLift");
const MATERIAL_PROCEDURAL_TREE_VARIATION_CATALOG = ShaderProperty.getByName("material_ProceduralTreeVariationCatalog");
const MATERIAL_PROCEDURAL_TREE_BRANCH_SHAPE_CATALOG = ShaderProperty.getByName(
  "material_ProceduralTreeBranchShapeCatalog"
);
const MATERIAL_PROCEDURAL_TREE_COLOR_CATALOG = ShaderProperty.getByName("material_ProceduralTreeColorCatalog");
const MATERIAL_PROCEDURAL_TREE_LEAF_TONE_VARIATION = ShaderProperty.getByName(
  "material_ProceduralTreeLeafToneVariation"
);
const SEED_WORLD_DETAIL_COMPACT_MACRO = ShaderMacro.getByName("RENDERER_SEED_WORLD_DETAIL_COMPACT");
const DETAIL_INSTANCE_REVEAL_MACRO = ShaderMacro.getByName("RENDERER_INSTANCE_GENERATION_REVEAL");
const SURFACE_GRASS_ATTACHMENT_MACRO = ShaderMacro.getByName("RENDERER_SURFACE_GRASS_ATTACHMENT");
const DETAIL_LOCAL_MATRIX = ShaderProperty.getByName("renderer_DetailLocalMatrix");
const DETAIL_LOCAL_NORMAL_MATRIX = ShaderProperty.getByName("renderer_DetailLocalNormalMat");
const RENDERER_GRASS_ROAD_COLOR = ShaderProperty.getByName("renderer_GrassRoadColor");
const DETAIL_FADE_DISTANCE = ShaderProperty.getByName("material_GrassFadeDistance");
// Position + yaw, anisotropic scale, Terrain surface weights, and Terrain normal. The compact
// record replaces density, hash, height, scale, coverage, and terrain-normal work in every vertex.
const DETAIL_SURFACE_WEIGHTS_FLOAT_OFFSET = 7;
const DETAIL_TERRAIN_NORMAL_FLOAT_OFFSET = 10;
// Ground vegetation wind is a pure rotation around the authored pivot. A pivot-relative sphere
// therefore remains conservative at every wind phase without an arbitrary bounds multiplier.
const DETAIL_WIND_BOUNDS_RADIUS_SCALE = 1;
const DETAIL_COMPACTION_CHUNK_CANDIDATES = 64;
const WATER_PREPARATION_SLICE_MILLISECONDS = 8;
const DETAIL_TRANSFORM_POOL_INSTANCE_GRANULARITY = 64;
const DETAIL_TRANSFORM_POOL_MAXIMUM_BYTES = 12 * 1024 * 1024;
const DETAIL_TRANSFORM_DIRECT_TRANSFER_CAPACITY_RATIO = 1.25;
const DETAIL_TRANSFORM_POOL_REUSE_CAPACITY_RATIO = 2;
const ROCK_SURFACE_GRASS_BATCH_POOL_CAPACITY = 32;
const EMPTY_DETAIL_TRANSFORMS = new Float32Array(0);
const SPARSE_OCCLUSION_SUBCELL_MINIMUM_INSTANCES = 8;
const POPULATION_LOD_STATE_CAPACITY = 2;
const TREE_PART_COUNT = 2;
const TREE_LOD_BOUNDS_RECORDS = SEED_WORLD_TREE_SOURCE_LOD_INDICES.length * TREE_PART_COUNT;
const GRASS_DENSITY_MULTIPLIER_MAXIMUM = 2;
type DetailCategory = (typeof SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.categories)[number];
type GrassRoadColor = readonly [red: number, green: number, blue: number];
const DETAIL_LOCAL_BOUNDS_BY_SOURCE = new WeakMap<AtomicAssemblySource, BoundingBox>();

/** One fixed `recipe x LOD x view` batch whose trunk and crown share one instance record buffer. */
interface ProceduralTreeViewBatch extends PopulationInstanceUploadState {
  readonly root: Entity;
  readonly trunkRenderer: MeshRenderer;
  readonly crownRenderer: MeshRenderer;
  /** Stable identities in the same packed order as the shared GPU instance records. */
  readonly instanceIds: string[];
  trunkResources: TreeAssemblyInstancedMesh;
  crownResources: TreeAssemblyInstancedMesh;
  crownVertexElements: VertexElement[];
  storage: TreeAssemblyInstanceStorage;
  capacity: number;
  count: number;
  trunkCount: number;
  crownCount: number;
  revealRequired: boolean;
  revealEnabled: boolean;
  destroyed: boolean;
}

interface ProceduralTreeLodBatch {
  readonly trunkSourceMesh: ModelMesh;
  readonly crownSourceMesh: ModelMesh;
  readonly views: readonly ProceduralTreeViewBatch[];
  /** Selection scratch is reused sequentially by camera and shadow views, never retained by a draw. */
  readonly visible: ProceduralTreeVisibleInstances;
}

interface ProceduralTreeVisibleInstances {
  readonly cells: (SeedWorldResidentPopulationCell<SparsePopulationCellResource> | undefined)[];
  stateOffsets: Uint32Array;
  partMasks: Uint8Array;
}

interface ProceduralTreeVariationBounds {
  readonly combined: BoundingBox;
  /** Current-LOD trunk/crown pairs, including wind and this GPU variation. */
  readonly parts: readonly BoundingBox[];
}

interface ProceduralTreeCellStaticData {
  readonly treeProjectionData: Float64Array;
  readonly treeInstanceData: Float32Array;
  readonly treeWorldBoundsData: Float32Array;
  readonly treeLodWorldBoundsData: Float32Array;
  readonly treeRecipeIndices: Uint8Array;
  readonly treeLodStateCounts: Uint8Array;
  readonly treeLodStateIndices: Uint8Array;
  readonly treeLodStateFades: Float32Array;
  readonly treeCameraCandidateEpochs: Uint32Array;
  readonly treeBounds: BoundingBox;
}

interface SeedWorldTreeEntrancePlayback {
  readonly instanceIds: ReadonlySet<string>;
  readonly durationSeconds: number;
  readonly startedAtSeconds: number;
  readonly signal?: AbortSignal;
  readonly abort: () => void;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  progress: number;
  settled: boolean;
}

/** Entrance presentation owned by already-published canonical sparse vegetation Renderers. */
export interface SeedWorldAuthoringPopulationEntrance {
  /** Reveals only the newly introduced sparse instances without duplicating runtime resources. */
  play(durationMs?: number, signal?: AbortSignal): Promise<void>;
}

interface ShrubCellStaticData {
  readonly shrubProjectionData: Float64Array;
  readonly shrubInstanceData: Float32Array;
  readonly shrubWorldBoundsData: Float32Array;
  readonly shrubLodWorldBoundsData: Float32Array;
  readonly shrubBounds: BoundingBox;
  readonly shrubLodStateCounts: Uint8Array;
  readonly shrubLodStateIndices: Uint8Array;
  readonly shrubLodStateFades: Float32Array;
  readonly shrubLodStateEpochs: Uint32Array;
  readonly shrubCameraCandidateEpochs: Uint32Array;
}

interface SparsePopulationCellResource extends ProceduralTreeCellStaticData, ShrubCellStaticData {
  readonly treeLodInstances: readonly TerrainLodGroupInstance[];
  readonly shrubLodInstances: readonly TerrainLodGroupInstance[];
  readonly treeSubCells: readonly SparsePopulationSubCell[];
  readonly shrubSubCells: readonly SparsePopulationSubCell[];
}

/** One non-empty quadrant of a sparse Population Cell, retaining stable canonical instance indices. */
interface SparsePopulationSubCell {
  readonly occlusionKey: string;
  readonly instanceIndices: Uint32Array;
  readonly bounds: BoundingBox;
}

interface DetailPopulationCellResource {
  readonly root: Entity;
  readonly detailBatches: Map<DetailCategory, readonly DetailPopulationBatch[]>;
  expectedCounts: Readonly<Record<DetailCategory, number>>;
  readonly detailBounds: BoundingBox;
  compactionTask?: DetailCellCompactionTask;
  detailsLoaded: boolean;
  detailsActive: boolean;
}

interface DetailPopulationBatch {
  readonly entity: Entity;
  readonly renderer: MeshRenderer;
  readonly resources: SeedWorldDetailInstancedMesh;
  transforms: Float32Array;
  readonly localBounds: BoundingBox;
  readonly bounds: BoundingBox;
  instanceCount: number;
  candidateCount: number;
  prototypeFamily?: SeedWorldDetailDensityField["prototypeFamily"];
  owners?: readonly (string | undefined)[];
  readonly detailPatch?: Readonly<{ x: number; z: number; assetProfileKey: string }>;
  entranceBuffer?: Buffer;
  rockAppearanceBuffer?: Buffer;
  entrance?: { owner: DetailAuthoringEntrance; startedAtSeconds?: number };
  rockSurfacePatch?: SeedWorldRockSurfaceGrassPatch;
  grassScaleMinimum?: number;
  grassScaleMaximum?: number;
  destroyed: boolean;
}

interface DetailCompactionPatch {
  readonly patchX: number;
  readonly patchZ: number;
  transforms: Float32Array;
  readonly instanceCount: number;
  readonly candidateCount: number;
}

interface DetailFieldCompactionState {
  readonly field: SeedWorldDetailDensityField;
  readonly sampleDensity: (worldX: number, worldZ: number) => number;
  readonly useEcologicalHeight: boolean;
  readonly cell: SeedWorldPopulationRuntimeCell;
  readonly fields: SeedWorldFields;
  readonly candidateGridSide: number;
  readonly candidateCount: number;
  readonly candidateDensity: number;
  readonly patchesPerAxis: number;
  readonly staging: readonly Float32Array[];
  readonly acceptedCounts: Uint32Array;
  readonly candidateCounts: Uint32Array;
  readonly horizontalScaleRange: Readonly<{ minimum: number; maximum: number }>;
  readonly verticalScaleRange: Readonly<{ minimum: number; maximum: number }>;
  readonly densityMultiplier: number;
  readonly usesTerrainGrassCoverage: boolean;
  readonly cellSeed: number;
  readonly candidateRanges?: Uint32Array;
  readonly dirtyPatches?: ReadonlySet<number>;
  rangeIndex: number;
  nextOrdinal: number;
}

interface DetailCellCompactionTask {
  readonly fields: readonly SeedWorldDetailDensityField[];
  /** Occupancy-only patch replacement. Absent retains full-cell authoring/water publication. */
  readonly dirtyPatches?: ReadonlySet<number>;
  readonly completed: Array<
    Readonly<{ field: SeedWorldDetailDensityField; patches: readonly DetailCompactionPatch[] }>
  >;
  fieldIndex: number;
  current?: DetailFieldCompactionState;
  publication?: DetailCompactionPublicationState;
  ready: boolean;
  entrance?: DetailAuthoringEntrance;
  previousPositions?: ReadonlyMap<string, ReadonlySet<string>>;
}

interface DetailAuthoringEntrance {
  readonly previousFields: readonly SeedWorldDetailDensityField[];
  readonly pendingCells: Set<DetailPopulationCellResource>;
  readonly batches: Set<DetailPopulationBatch>;
  readonly completion: Promise<void>;
  readonly finish: (error?: unknown) => void;
  settled: boolean;
}

interface DetailCompactionPublicationState {
  readonly workItems: readonly DetailCompactionPublicationWorkItem[];
  readonly grassBatches: DetailPopulationBatch[];
  readonly flowerBatches: DetailPopulationBatch[];
  workIndex: number;
}

interface DetailCompactionPublicationWorkItem {
  readonly field: SeedWorldDetailDensityField;
  readonly patch: DetailCompactionPatch;
  readonly copySources?: readonly DetailCompactionPatch[];
  sourceIndex: number;
  sourceOffset: number;
  targetOffset: number;
  readonly shuffle?: GrassDensityShuffle;
  bounds?: BoundingBox;
  owners?: (string | undefined)[];
  rockAppearanceRecords?: Float32Array;
  rockAppearanceTask?: ReturnType<GrassRockAppearance["compileIncrementally"]>;
  rockAppearanceSource?: GrassRockAppearance;
  rockAppearanceMaterial?: Material;
  preparedInstances: number;
  prepared: boolean;
}

/** Bounded CPU transform storage reused by rolling Detail Cells after their GPU resources are released. */
class DetailTransformBufferPool {
  private readonly _available: Float32Array[] = [];
  private _availableBytes = 0;
  private _largestFloatCount = 0;

  acquire(minimumInstanceCount: number, maximumCapacityRatio = Number.POSITIVE_INFINITY): Float32Array {
    const minimumFloatCount = minimumInstanceCount * DETAIL_TRANSFORM_FLOATS;
    const maximumFloatCount = Math.floor(minimumFloatCount * maximumCapacityRatio);
    const capacity =
      Math.ceil(minimumInstanceCount / DETAIL_TRANSFORM_POOL_INSTANCE_GRANULARITY) *
      DETAIL_TRANSFORM_POOL_INSTANCE_GRANULARITY;
    const capacityFloatCount = capacity * DETAIL_TRANSFORM_FLOATS;
    this._largestFloatCount = Math.max(this._largestFloatCount, capacityFloatCount);
    let bestIndex = -1;
    let bestFloatCount = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this._available.length; index++) {
      const floatCount = this._available[index]!.length;
      if (floatCount < minimumFloatCount || floatCount > maximumFloatCount || floatCount >= bestFloatCount) continue;
      bestIndex = index;
      bestFloatCount = floatCount;
    }
    if (bestIndex >= 0) {
      const buffers = this._available;
      const buffer = buffers[bestIndex]!;
      const lastIndex = buffers.length - 1;
      buffers[bestIndex] = buffers[lastIndex]!;
      buffers.length = lastIndex;
      this._availableBytes -= buffer.byteLength;
      return buffer;
    }
    return new Float32Array(capacityFloatCount);
  }

  release(buffer: Float32Array): void {
    if (!buffer.byteLength || buffer.byteLength > DETAIL_TRANSFORM_POOL_MAXIMUM_BYTES) return;
    const buffers = this._available;
    const overflowBytes = this._availableBytes + buffer.byteLength - DETAIL_TRANSFORM_POOL_MAXIMUM_BYTES;
    if (overflowBytes > 0) {
      let reclaimableBytes = 0;
      for (let index = 0; index < buffers.length; index++) {
        const candidateBytes = buffers[index]!.byteLength;
        if (candidateBytes < buffer.byteLength) reclaimableBytes += candidateBytes;
      }
      if (reclaimableBytes < overflowBytes) return;
      while (this._availableBytes + buffer.byteLength > DETAIL_TRANSFORM_POOL_MAXIMUM_BYTES) {
        let smallestIndex = -1;
        let smallestBytes = buffer.byteLength;
        for (let index = 0; index < buffers.length; index++) {
          const candidateBytes = buffers[index]!.byteLength;
          if (candidateBytes >= smallestBytes) continue;
          smallestIndex = index;
          smallestBytes = candidateBytes;
        }
        const lastIndex = buffers.length - 1;
        buffers[smallestIndex] = buffers[lastIndex]!;
        buffers.length = lastIndex;
        this._availableBytes -= smallestBytes;
      }
    }
    buffers.push(buffer);
    this._availableBytes += buffer.byteLength;
  }

  /** Preallocates the bounded rolling high-water mark after initial Detail residency settles. */
  prime(): void {
    if (this._largestFloatCount === 0) return;
    const bufferBytes = this._largestFloatCount * Float32Array.BYTES_PER_ELEMENT;
    while (this._availableBytes + bufferBytes <= DETAIL_TRANSFORM_POOL_MAXIMUM_BYTES) {
      this._available.push(new Float32Array(this._largestFloatCount));
      this._availableBytes += bufferBytes;
    }
  }

  clear(): void {
    this._available.length = 0;
    this._availableBytes = 0;
    this._largestFloatCount = 0;
  }
}

interface TreeRecipeBatches {
  readonly recipe: TreeRecipeSource;
  readonly lodDefinition: TerrainLodGroupRuntime;
  readonly sourceLodIndices: typeof SEED_WORLD_TREE_SOURCE_LOD_INDICES;
  readonly lods: readonly ProceduralTreeLodBatch[];
  variations: readonly InstancedBirchPopulationVariation[];
  readonly baseTrunkBounds: readonly BoundingBox[];
  readonly baseCrownBounds: readonly BoundingBox[];
  variationLocalBounds: readonly ProceduralTreeVariationBounds[];
  readonly sizeScale: number;
  readonly trunkMaterial: Material;
  readonly leafMaterial: Material;
  readonly worldBounds: BoundingBox;
  readonly ownedProceduralMeshes: readonly ModelMesh[];
  readonly ownedMaterials: readonly Material[];
  readonly ownedLeafGpuData: ProceduralTreeLeafGpuData;
}

/** Material-owned low-cardinality tree data addressed by one scalar instance index. */
export interface SeedWorldProceduralTreeVariationCatalog {
  readonly variation: Float32Array;
  readonly branchShape: Float32Array;
  readonly barkColor: Float32Array;
  readonly leafColor: Float32Array;
}

/** One live procedural-tree leaf material exposed to debug authoring. */
export interface SeedWorldProceduralTreeLeafMaterial {
  readonly recipeId: string;
  readonly label: string;
  readonly tuning: TreeLeafLightingTuning;
}

/** One recipe's seven independently editable renderer variations. */
export interface SeedWorldProceduralTreeVariationSet {
  readonly recipeId: string;
  readonly label: string;
  readonly controls: readonly InstancedBirchVariationControls[];
}

/** Restricts a diagnostic population preview to one inclusive 64m Cell range. */
export interface SeedWorldPopulationInspectionRange {
  /** Inclusive horizontal Cell minimum. */
  readonly minimumX: number;
  /** Inclusive horizontal Cell maximum. */
  readonly maximumX: number;
  /** Inclusive depth Cell minimum. */
  readonly minimumZ: number;
  /** Inclusive depth Cell maximum. */
  readonly maximumZ: number;
}

/**
 * Camera-resident Population Cell runtime backed exclusively by the shared Seed World Population Producer.
 * Cells control residency and coarse spatial queries; render owners choose their own GPU batch granularity.
 * Exact woody transforms and dense Detail fields remain camera-independent.
 */
export class SeedWorldPopulationRuntime {
  /** Stable dense grassland selected from generated terrain and ecological fields. */
  readonly observationAnchor: Readonly<{ x: number; y: number; z: number }>;
  /** Entity owning dense grass and flower Cell batches. */
  readonly details: Entity;
  /** Entity owning complete tree and shrub LOD batches. */
  readonly trees: Entity;

  private readonly _treeRenderer: SeedWorldTreeLodRenderer;
  private readonly _shrubRenderer: SeedWorldShrubLodRenderer;
  private readonly _sparseCells: SeedWorldPopulationCellSet<SparsePopulationCellResource>;
  private readonly _detailCells: SeedWorldPopulationCellSet<DetailPopulationCellResource>;
  private readonly _engine: Engine;
  private _grassDensityLodEnabled = true;
  private readonly _camera: Camera;
  private readonly _sourceLibrary: AssetAssemblySourceLibrary;
  private readonly _detailMaterials = new Map<Material, Material>();
  private _rockGroundSettings?: Pick<RockFormationSettings, "textureScale" | "colorBlend">;
  private _grassTerrainMaterial: Material | undefined;
  private _grassSurfaceCoverage: SeedWorldGrassCoverageSampler | undefined;
  private _grassContactIsWater: ((worldX: number, worldZ: number) => boolean) | undefined;
  private readonly _detailTransformPool = new DetailTransformBufferPool();
  private readonly _detailSurfaceWeightsScratch: [grass: number, road: number, remaining: number] = [1, 0, 0];
  private readonly _detailTerrainNormalScratch: [x: number, y: number, z: number] = [0, 1, 0];
  private readonly _treeAuthoringProfiles: readonly ProceduralTreeRuntimeAuthoringProfile[];
  private readonly _treeAuthoringProfileByRecipeId: ReadonlyMap<string, ProceduralTreeRuntimeAuthoringProfile>;
  private readonly _treeLeafLightingByRecipeId: Map<string, TreeLeafLightingTuning>;
  private readonly _treeVariationControlsByRecipeId: Map<string, readonly InstancedBirchVariationControls[]>;
  private _treeVariationEdits: readonly SeedWorldTreeVariationEditV1[] = [];
  private _treeAppearanceRevision = 0;
  private _treePresentation?: {
    readonly controller: AbortController;
    readonly presentations: NonNullable<ReturnType<SeedWorldTreeLodRenderer["createDensityTransition"]>>[];
  };
  private readonly _treeVariationListeners = new Set<() => void>();
  private readonly _plan: SeedWorldPopulationWorld;
  private readonly _fields: SeedWorldFields;
  private readonly _terrainOcclusionCuller: SeedWorldTerrainOcclusionCuller;
  private _populationLayout: SeedWorldPopulationPreview;
  private _groundCoverBase?: SeedWorldPopulationPreview;
  private _groundCoverExclusions = new Map<string, readonly SeedWorldAuthoringRuntimeBoundsV1[]>();
  private _maximumDetailBoundsRadius: number;
  private readonly _rockSurfaceGrassRoot: Entity;
  private readonly _groundedSparseInstanceOverrides = new Map<string, SeedWorldGroundedPopulationInstance>();
  private _rockSurfaceTreeCandidates: readonly SeedWorldPopulationInstance[] = Object.freeze([]);
  private _rockSurfaceTreeCompilation: SeedWorldRockSurfaceTreeCompilation = emptyRockSurfaceTreeCompilation();
  private readonly _rockSurfaceGrassBatchByPatch = new Map<string, DetailPopulationBatch>();
  private _rockSurfaceGrassPatches: SeedWorldRockSurfaceGrassPatch[] = [];
  private _rockSurfaceGrassBatches: DetailPopulationBatch[] = [];
  private _rockSurfaceGrassBatchPool: DetailPopulationBatch[] = [];
  private _rockSurfaceGrassRocks: readonly SeedWorldSolvedRockObb[] = [];
  private _rockSurfaceGrassStyle: SeedWorldRockGrassTransitionStyle = SEED_WORLD_DEFAULT_ROCK_GRASS_TRANSITION_STYLE;
  private _rockSurfaceGrassVisibilityDirty = false;
  private _rockSurfaceGrassCompiler: SeedWorldRockSurfaceGrassCompiler | undefined;
  private _rockSurfaceGrassCompiledInstanceCount = 0;
  private _rockSurfaceGrassCompilationWindowPatchX = Number.NaN;
  private _rockSurfaceGrassCompilationWindowPatchZ = Number.NaN;
  private _rockSurfaceGrassSource: AtomicAssemblySource | undefined;
  private _grassRockAppearance?: GrassRockAppearance;
  private _grassRockPlacements: readonly RockGrassPlacement[] = [];
  private readonly _grassRockAppearancePending = new Map<
    DetailPopulationBatch,
    ReturnType<GrassRockAppearance["compileIncrementally"]> | undefined
  >();
  private readonly _rockAppearanceBatches = new Set<DetailPopulationBatch>();
  private _generatedRockGrass?: RockGrassPatches<DetailPopulationBatch>;
  private _grassColorField: SeedWorldGrassColorFieldBinding | undefined;
  private _grassRoadColor: GrassRoadColor | undefined;
  private readonly _populationCameraState = new Float64Array(40).fill(Number.NaN);
  private readonly _populationViewProjection = new Matrix();
  private readonly _populationFrustum = new BoundingFrustum();
  private _lodTuning: TerrainLodRendererTuning = { enabled: true, distanceScale: 1 };
  private _elapsedSeconds = 0;
  private _sparseCellsInitialized = false;
  private _sparseRenderDirty = true;
  private _treeTransitionActive = false;
  private _detailsWereActive = true;
  private _treesWereActive = true;
  private _submittedDetailBatchCount = 0;
  private readonly _detailAuthoringEntrances = new Set<DetailAuthoringEntrance>();
  private _detailTransformPoolPrimed = false;
  private _detailBudgetFrame = -1;
  private _detailBudgetDeadline = 0;
  private _grassScaleRange = SEED_WORLD_GRASS_UNIFORM_SCALE;
  private _grassHeightOverride = true;
  private _grassDensityPerSquareMetre = SEED_WORLD_GRASS_DENSITY_PER_SQUARE_METRE;
  private _grassDensityMultiplier = 1;
  private readonly _detailCategoryVisible = { grass: true, flower: true };
  private _destroyed = false;

  get treeAppearanceRevision(): number {
    return this._treeAppearanceRevision;
  }

  subscribeTreeVariationChanges(listener: () => void): () => void {
    this._treeVariationListeners.add(listener);
    return () => this._treeVariationListeners.delete(listener);
  }

  /** Authoring changes the same finite recipe/effect controls as the artist panel. */
  applyAuthoringTreeVariationEdits(edits: readonly SeedWorldTreeVariationEditV1[]): void {
    const key = (edit: SeedWorldTreeVariationEditV1) => JSON.stringify([edit.recipeId, edit.variationIndex]);
    const previous = new Map(this._treeVariationEdits.map((edit) => [key(edit), edit]));
    const next = new Map(edits.map((edit) => [key(edit), edit]));
    const changes = [
      ...this._treeVariationEdits
        .filter((edit) => !next.has(key(edit)))
        .map((edit) => ({ ...edit, controls: edit.baselineControls })),
      ...edits.filter((edit) => previous.get(key(edit))?.contentHash !== edit.contentHash)
    ];
    const before = changes.map((edit) => ({
      ...edit,
      controls: this._requiredTreeVariationControls(edit.recipeId)[edit.variationIndex]!
    }));
    try {
      for (const edit of changes)
        this.setProceduralTreeVariationControls(edit.recipeId, edit.variationIndex, edit.controls);
      this._treeVariationEdits = Object.freeze([...edits]);
    } catch (error) {
      for (const edit of before)
        this.setProceduralTreeVariationControls(edit.recipeId, edit.variationIndex, edit.controls);
      throw error;
    }
  }

  private _treeDissolvePreview?: {
    recipeId: string;
    variationIndex: number;
    progress: number;
    presentation: NonNullable<ReturnType<SeedWorldTreeLodRenderer["createDensityTransition"]>>;
    controller?: AbortController;
  };

  endTreeDissolvePreview(): void {
    const preview = this._treeDissolvePreview;
    this._treeDissolvePreview = undefined;
    preview?.controller?.abort();
    preview?.presentation.dispose();
  }

  setTreeDissolvePreviewProgress(recipeId: string, variationIndex: number, progress: number): void {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1)
      throw new RangeError("Invalid dissolve preview progress");
    if (!Number.isInteger(variationIndex) || !this._requiredTreeVariationControls(recipeId)[variationIndex]) {
      throw new RangeError("Invalid tree variation");
    }
    if (
      !this._treeDissolvePreview ||
      this._treeDissolvePreview.recipeId !== recipeId ||
      this._treeDissolvePreview.variationIndex !== variationIndex
    ) {
      this.endTreeDissolvePreview();
      this.finishTreeDensityDissolve();
      const before = this._treeRenderer.captureRenderedVariations().get(recipeId)!;
      // Renderer-only target: preview never publishes edits or changes the artist's densities.
      const target = before.map((value, index) =>
        index === variationIndex + 1 ? { ...value, leafDensity: 0, branchDensity: 0 } : value
      );
      const presentation = this._treeRenderer.createDensityTransition(recipeId, before, target);
      if (!presentation) return;
      this._treeDissolvePreview = { recipeId, variationIndex, presentation, progress };
    }
    this._treeDissolvePreview.controller?.abort();
    this._treeDissolvePreview.controller = undefined;
    this._treeDissolvePreview.progress = progress;
    this._treeDissolvePreview.presentation.update(progress);
  }

  async playTreeDissolvePreview(
    recipeId: string,
    variationIndex: number,
    reveal: boolean,
    onProgress: (progress: number) => void
  ): Promise<void> {
    this.setTreeDissolvePreviewProgress(recipeId, variationIndex, reveal ? 1 : 0);
    const preview = this._treeDissolvePreview;
    if (!preview) return;
    const controller = new AbortController();
    preview.controller = controller;
    const update = (value: number): void => {
      const progress = reveal ? 1 - value : value;
      preview.progress = progress;
      preview.presentation.update(progress);
      onProgress(progress);
    };
    try {
      if (this._treeDensityDissolveDurationSeconds === 0) update(1);
      else
        await playSeedWorldAuthoringPresentation(
          this.trees,
          update,
          controller.signal,
          this._treeDensityDissolveDurationSeconds * 1000
        );
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      if (preview.controller === controller) preview.controller = undefined;
    }
  }

  /** Manual density edits take over immediately from any pending AI presentation. */
  finishTreeDensityDissolve(): void {
    const playback = this._treePresentation;
    if (!playback) return;
    this._treePresentation = undefined;
    playback.controller.abort(new DOMException("Density edited manually", "AbortError"));
    for (const presentation of playback.presentations) presentation.dispose();
    this._refreshTreeVariationProjectionData(true);
  }

  private _treeDensityDissolveDurationSeconds = 2;

  private _treeDensityDissolveBand = 0.15;

  private _treeDissolveStyle = DEFAULT_TREE_DISSOLVE_STYLE;

  get treeDissolveStyle(): SeedWorldTreeDissolveStyle {
    return this._treeDissolveStyle;
  }

  setTreeDissolveStyle(patch: Partial<SeedWorldTreeDissolveStyle>): void {
    const next = { ...this._treeDissolveStyle, ...patch };
    if (
      next.colorRgb.length !== 3 ||
      next.colorRgb.some((value) => !Number.isFinite(value) || value < 0 || value > 255) ||
      !Number.isFinite(next.spectrum) ||
      next.spectrum < 0 ||
      next.spectrum > 1 ||
      [
        next.brightness,
        next.widthRatio,
        next.colorFrequency,
        next.lift,
        next.spectrumBase,
        next.spectrumAmplitude
      ].some((value) => !Number.isFinite(value) || value < 0) ||
      [next.phaseR, next.phaseG, next.phaseB].some((value) => !Number.isFinite(value)) ||
      !Number.isFinite(next.minimumWidth) ||
      next.minimumWidth <= 0
    ) {
      throw new RangeError("Invalid tree dissolve style");
    }
    this._treeDissolveStyle = Object.freeze({
      ...next,
      colorRgb: Object.freeze([...next.colorRgb]) as readonly [number, number, number]
    });
    this._treeRenderer.setDissolveStyle(this._treeDissolveStyle);
  }

  get treeDensityDissolveBand(): number {
    return this._treeDensityDissolveBand;
  }

  setTreeDensityDissolveBand(band: number): void {
    if (!Number.isFinite(band) || band <= 0 || band > 1)
      throw new RangeError("Tree density dissolve band must be in (0, 1]");
    this._treeDensityDissolveBand = band;
    this._treeRenderer.setDensityDissolveBand(band);
    if (this._treeDissolvePreview) this._treeDissolvePreview.presentation.update(this._treeDissolvePreview.progress);
  }

  get treeDensityDissolveDurationSeconds(): number {
    return this._treeDensityDissolveDurationSeconds;
  }

  setTreeDensityDissolveDurationSeconds(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new RangeError("Tree density dissolve duration must be finite and non-negative");
    this._treeDensityDissolveDurationSeconds = seconds;
  }

  /** AI and the artist panel share one finite-catalog presentation boundary. */
  async transitionAuthoringTreeVariationEdits(
    edits: readonly SeedWorldTreeVariationEditV1[],
    signal: AbortSignal
  ): Promise<void> {
    const previous = this._treeVariationEdits;
    await this._transitionTreeControls(
      () => this.applyAuthoringTreeVariationEdits(edits),
      () => this.applyAuthoringTreeVariationEdits(previous),
      signal
    );
  }

  async transitionProceduralTreeVariationControls(
    recipeId: string,
    variationIndex: number,
    patch: Readonly<Partial<InstancedBirchVariationControls>>,
    signal: AbortSignal
  ): Promise<readonly InstancedBirchVariationControls[]> {
    const previous = this._requiredTreeVariationControls(recipeId)[variationIndex]!;
    await this._transitionTreeControls(
      () => this.setProceduralTreeVariationControls(recipeId, variationIndex, patch),
      () => this.setProceduralTreeVariationControls(recipeId, variationIndex, previous),
      signal
    );
    return this._requiredTreeVariationControls(recipeId);
  }

  private async _transitionTreeControls(
    apply: () => unknown,
    rollback: () => unknown,
    signal: AbortSignal
  ): Promise<void> {
    signal.throwIfAborted();
    this.endTreeDissolvePreview();
    const previousPlayback = this._treePresentation;
    if (previousPlayback) {
      previousPlayback.controller.abort(new DOMException("Tree presentation retargeted", "AbortError"));
      for (const presentation of previousPlayback.presentations) presentation.dispose();
    }
    // Snapshot rendered values before publishing the next logical target. Retargeting never starts from the old goal.
    const before = this._treeRenderer.captureRenderedVariations();
    const playback = {
      controller: new AbortController(),
      presentations: [] as NonNullable<ReturnType<SeedWorldTreeLodRenderer["createDensityTransition"]>>[]
    };
    this._treePresentation = playback;
    const abort = (): void => playback.controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    try {
      apply();
      if (this._treeDensityDissolveDurationSeconds === 0) return;
      for (const [recipeId, previous] of before) {
        const presentation = this._treeRenderer.createDensityTransition(recipeId, previous);
        if (presentation) playback.presentations.push(presentation);
      }
      if (playback.presentations.length) {
        this._refreshTreeVariationProjectionData(true);
        await playSeedWorldAuthoringPresentation(
          this.trees,
          (progress) => {
            for (const presentation of playback.presentations) presentation.update(progress);
            this._treeAppearanceRevision++;
            this._refreshTreeVariationProjectionData(true);
          },
          playback.controller.signal,
          this._treeDensityDissolveDurationSeconds * 1000
        );
      }
    } catch (error) {
      if (this._treePresentation !== playback) return;
      rollback();
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
      if (this._treePresentation === playback) {
        for (const presentation of playback.presentations) presentation.dispose();
        this._treePresentation = undefined;
        if (playback.presentations.length) this._refreshTreeVariationProjectionData(true);
      }
    }
  }

  private readonly _sparsePickCache = new WeakMap<MeshRenderer, SeedWorldArrayPickBatch>();
  private readonly _detailPickCache = new WeakMap<MeshRenderer, SeedWorldDetailPickBatch>();
  private _pickVisitor?: SeedWorldPickVisitor;
  private readonly _visitSparsePickBound = this._visitSparsePick.bind(this);
  private _detailIdentity?: DetailPickIdentity;
  private readonly _visitDetailCategoryBound = this._visitDetailCategory.bind(this);
  private _visitDetailCategory(batches: readonly DetailPopulationBatch[], category: DetailCategory): void {
    for (let i = 0; i < batches.length; i++) this._visitDetailPick(batches[i]!, category);
  }

  private _visitSparsePick(renderer: MeshRenderer, ids: readonly string[], start: number, count: number): void {
    let batch = this._sparsePickCache.get(renderer);
    if (!batch) {
      batch = new SeedWorldArrayPickBatch(renderer);
      batch.instanced = true;
      this._sparsePickCache.set(renderer, batch);
    }
    batch.ids = ids;
    batch.start = start;
    batch.count = count;
    this._pickVisitor!(batch);
  }
  private _visitDetailPick(batch: DetailPickData, category: "grass" | "flower"): void {
    if (!batch.renderer.enabled || !batch.entity.isActiveInHierarchy) return;
    let descriptor = this._detailPickCache.get(batch.renderer);
    if (!descriptor) {
      descriptor = new SeedWorldDetailPickBatch(batch.renderer);
      this._detailPickCache.set(batch.renderer, descriptor);
    }
    descriptor.data = batch;
    descriptor.category = category;
    descriptor.identity = this._detailIdentity;
    descriptor.count = batch.instanceCount;
    this._pickVisitor!(descriptor);
  }
  /** Borrow current camera descriptors synchronously; identities change when visibility is repacked. */
  visitPickBatches(visitor: SeedWorldPickVisitor, detailIdentity?: DetailPickIdentity): void {
    this._pickVisitor = visitor;
    this._detailIdentity = detailIdentity;
    try {
      this._treeRenderer.visitPickBatches(this._visitSparsePickBound);
      this._shrubRenderer.visitPickBatches(this._visitSparsePickBound);
      const cells = this._detailCells.cells;
      for (let i = 0; i < cells.length; i++) cells[i]!.resource.detailBatches.forEach(this._visitDetailCategoryBound);
      for (let i = 0; i < this._rockSurfaceGrassBatches.length; i++)
        this._visitDetailPick(this._rockSurfaceGrassBatches[i]!, "grass");
      this._generatedRockGrass?.visitBatches((batch) => this._visitDetailPick(batch, "grass"));
    } finally {
      this._pickVisitor = undefined;
      this._detailIdentity = undefined;
    }
  }

  readProceduralTreeInstance(
    instance: SeedWorldPopulationInstance,
    position: readonly [number, number, number],
    patch?: SeedWorldTreeShapePatch
  ) {
    const grounding = this._groundedSparseInstanceOverrides.get(instance.id);
    return this._treeRenderer.readInstance(instance, grounding?.position ?? position, patch);
  }

  /** CPU-only projection using the same stable identities as a new renderer. */
  readPlanningTreeInstances(
    instances: readonly SeedWorldPopulationInstance[],
    ground: (x: number, z: number) => number,
    size: number,
    patch: (recipeId: string, effectIndex: number) => SeedWorldTreeShapePatch | undefined
  ) {
    const assignments = this._treeRenderer.reconcileVariationAssignments(instances);
    return instances
      .filter((instance) => instance.category === "tree")
      .map((instance) => {
        const index = assignments.get(instance.id)!;
        const x = instance.normalizedPosition.x * size,
          z = instance.normalizedPosition.y * size;
        return {
          instance,
          tree: this._treeRenderer.readInstance(
            instance,
            [x, ground(x, z), z],
            patch(instance.assetRecipeId!, index),
            index
          )
        };
      });
  }

  /** Persist realized visual ownership, not the order in which brushes happen to be replayed. */
  snapshotTreeVariations(): readonly SeedWorldSavedTreeVariation[] {
    return Object.freeze(
      this._populationLayout.treeInstances
        .filter(({ category }) => category === "tree")
        .map((instance) => {
          const variationIndex = this._treeRenderer.variationAssignments.get(instance.id);
          if (variationIndex === undefined || !instance.assetRecipeId)
            throw new Error(`Tree '${instance.id}' has no visual ownership`);
          return Object.freeze({ instanceId: instance.id, recipeId: instance.assetRecipeId, variationIndex });
        })
        .sort((a, b) => a.instanceId.localeCompare(b.instanceId))
    );
  }

  restoreTreeVariations(saved: readonly SeedWorldSavedTreeVariation[]): void {
    if (this._destroyed) throw new Error("Seed World Population runtime is destroyed");
    this._treeRenderer.restoreVariationAssignments(this._populationLayout.treeInstances, saved);
    this._refreshTreeVariationProjectionData();
    this._treeAppearanceRevision++;
    this.update(0);
  }

  /** Current presentation visibility, including the shared detail parent. */
  isDetailCategoryVisible(category: "grass" | "flower"): boolean {
    return this.details.isActive && this._detailCategoryVisible[category];
  }

  /** Presentation-only category visibility; resident instances and density fields remain unchanged. */
  setDetailCategoryVisible(category: "grass" | "flower", visible: boolean): void {
    if (this._detailCategoryVisible[category] === visible) return;
    this._detailCategoryVisible[category] = visible;
    if (category === "grass") this._rockSurfaceGrassRoot.isActive = visible;
    const position = this._camera.entity.transform.worldPosition;
    for (const cell of this._detailCells.cells) this._updateDetailBatchVisibility(cell, position);
  }

  /** Whether distance thinning is active; enabled by default. */
  get grassDensityLodEnabled(): boolean {
    return this._grassDensityLodEnabled;
  }

  /** Toggle distance thinning within the original grass draw range; original dimensions and fade remain intact. */
  setGrassDensityLodEnabled(enabled: boolean): void {
    this._grassDensityLodEnabled = enabled;
    const position = this._camera.entity.transform.worldPosition;
    for (const cell of this._detailCells.cells) this._updateDetailBatchVisibility(cell, position);
  }

  /** Current deterministic per-instance grass uniform XYZ scale range. */
  get grassScaleRange(): Readonly<{ minimum: number; maximum: number }> {
    return this._grassScaleRange;
  }

  /** Current deterministic grass height range in world metres. */
  get grassHeightRangeMetres(): Readonly<{ minimum: number; maximum: number }> {
    const heights = this._grassHeightOverride
      ? []
      : this._populationLayout.detailDensityFields
          .filter((field) => field.category === "grass" && field.heightRangeMetres)
          .map((field) => field.heightRangeMetres!);
    if (heights.length)
      return Object.freeze({
        minimum: Math.min(...heights.map((field) => field.minimum)),
        maximum: Math.max(...heights.map((field) => field.maximum))
      });
    return Object.freeze({
      minimum: this._grassScaleRange.minimum * GRASS_AUTHORED_HEIGHT_METRES,
      maximum: this._grassScaleRange.maximum * GRASS_AUTHORED_HEIGHT_METRES
    });
  }

  /** Full-coverage terrestrial density in clumps/m², before ecology and distance thinning. */
  get grassDensityPerSquareMetre(): number {
    return this._grassDensityPerSquareMetre;
  }

  private _detailDensityMultiplier(field: SeedWorldDetailDensityField): number {
    if (field.category !== "grass") return SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.densityMultiplier;
    const terrestrial = this._populationLayout.detailSpeciesProfiles.some(
      (profile) => profile.key === field.prototypeFamily && profile.habitat === "terrestrial"
    );
    return (
      this._grassDensityMultiplier *
      (terrestrial
        ? seedWorldTerrestrialGrassDensityMultiplier(this._populationLayout, this._grassDensityPerSquareMetre)
        : SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.densityMultiplier)
    );
  }

  /** Current multiplier applied to the configured grass density. */
  get grassDensityMultiplier(): number {
    return this._grassDensityMultiplier;
  }

  /** Whether this runtime has released its Population resources. */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /** Lists every independently editable procedural-tree leaf material in production-recipe order. */
  getProceduralTreeLeafMaterials(): readonly SeedWorldProceduralTreeLeafMaterial[] {
    return Object.freeze(
      this._treeAuthoringProfiles.map((profile) => ({
        recipeId: profile.recipe.id,
        label: profile.recipe.label,
        tuning: detachTreeLeafLightingTuning(this._requiredTreeLeafLighting(profile.recipe.id))
      }))
    );
  }

  /** Lists each loaded recipe with its own detached seven-effect authoring state. */
  getProceduralTreeVariationSets(): readonly SeedWorldProceduralTreeVariationSet[] {
    return Object.freeze(
      this._treeAuthoringProfiles.map((profile) => ({
        recipeId: profile.recipe.id,
        label: profile.recipe.label,
        controls: detachTreeVariationControls(this._requiredTreeVariationControls(profile.recipe.id))
      }))
    );
  }

  /** Applies one live patch to one of the selected recipe's seven renderer variations. */
  setProceduralTreeVariationControls(
    recipeId: string,
    variationIndex: number,
    patch: Readonly<Partial<InstancedBirchVariationControls>>
  ): readonly InstancedBirchVariationControls[] {
    if (this._destroyed) throw new Error("Seed World Population runtime is destroyed");
    const profile = this._treeAuthoringProfileByRecipeId.get(recipeId);
    if (!profile) throw new RangeError(`Seed World tree recipe "${recipeId}" is not loaded`);
    const next = patchSeedWorldTreeVariationControls(
      this._requiredTreeVariationControls(recipeId),
      variationIndex,
      patch
    );
    const variations = createInstancedBirchPopulationVariationCatalog(profile.recipe, {
      controls: next,
      baseAppearanceColor: profile.token.colorRgb
    });
    this._treeRenderer.setVariations(recipeId, variations);
    this._treeVariationControlsByRecipeId.set(recipeId, next);
    this._refreshTreeVariationProjectionData();
    this._treeAppearanceRevision++;
    for (const listener of this._treeVariationListeners) listener();
    return detachTreeVariationControls(next);
  }

  /** Restores one selected variation from the recipe-owned boot profile. */
  resetProceduralTreeVariationControls(
    recipeId: string,
    variationIndex: number
  ): readonly InstancedBirchVariationControls[] {
    const profile = this._treeAuthoringProfileByRecipeId.get(recipeId);
    if (!profile) throw new RangeError(`Seed World tree recipe "${recipeId}" is not loaded`);
    const authored = profile.variationControls[variationIndex];
    if (!authored) throw new RangeError(`Seed World tree variation ${variationIndex + 1} is unavailable`);
    return this.setProceduralTreeVariationControls(recipeId, variationIndex, authored);
  }

  /** Restores all seven variations of one selected recipe. */
  resetProceduralTreeVariationSet(recipeId: string): readonly InstancedBirchVariationControls[] {
    const profile = this._treeAuthoringProfileByRecipeId.get(recipeId);
    if (!profile) throw new RangeError(`Seed World tree recipe "${recipeId}" is not loaded`);
    const authored = detachTreeVariationControls(profile.variationControls);
    const variations = createInstancedBirchPopulationVariationCatalog(profile.recipe, {
      controls: authored,
      baseAppearanceColor: profile.token.colorRgb
    });
    this._treeRenderer.setVariations(recipeId, variations);
    this._treeVariationControlsByRecipeId.set(recipeId, authored);
    this._refreshTreeVariationProjectionData();
    this._treeAppearanceRevision++;
    for (const listener of this._treeVariationListeners) listener();
    return detachTreeVariationControls(authored);
  }

  /** Applies one validated live patch to the selected procedural-tree recipe's shared leaf material. */
  setProceduralTreeLeafLightingTuning(
    recipeId: string,
    patch: Readonly<Partial<TreeLeafLightingTuning>>
  ): TreeLeafLightingTuning {
    if (this._destroyed) throw new Error("Seed World Population runtime is destroyed");
    const current = this._requiredTreeLeafLighting(recipeId);
    const next = detachTreeLeafLightingTuning({ ...current, ...patch });
    validateTreeLeafLightingTuning(next);
    this._treeRenderer.setLeafLightingTuning(recipeId, next);
    this._treeLeafLightingByRecipeId.set(recipeId, next);
    return detachTreeLeafLightingTuning(next);
  }

  /** Restores the selected recipe's repository-authored leaf material tuning. */
  resetProceduralTreeLeafLightingTuning(recipeId: string): TreeLeafLightingTuning {
    const profile = this._treeAuthoringProfileByRecipeId.get(recipeId);
    if (!profile) throw new RangeError(`Seed World tree recipe "${recipeId}" is not loaded`);
    const authored = detachTreeLeafLightingTuning(profile.leafLightingTuning);
    this._treeRenderer.setLeafLightingTuning(recipeId, authored);
    this._treeLeafLightingByRecipeId.set(recipeId, authored);
    return detachTreeLeafLightingTuning(authored);
  }

  private _requiredTreeLeafLighting(recipeId: string): TreeLeafLightingTuning {
    const tuning = this._treeLeafLightingByRecipeId.get(recipeId);
    if (!tuning) throw new RangeError(`Seed World tree recipe "${recipeId}" is not loaded`);
    return tuning;
  }

  private _requiredTreeVariationControls(recipeId: string): readonly InstancedBirchVariationControls[] {
    const controls = this._treeVariationControlsByRecipeId.get(recipeId);
    if (!controls) throw new RangeError(`Seed World tree recipe "${recipeId}" is not loaded`);
    return controls;
  }

  private _refreshTreeVariationProjectionData(preserveLodState = false): void {
    for (const cell of this._sparseCells.cells) {
      this._treeRenderer.refreshCellStaticData(cell.resource, cell.data.instances.tree, preserveLodState);
      refreshSparsePopulationSubCellWorldBounds(cell.resource.treeSubCells, cell.resource.treeWorldBoundsData);
    }
    this._sparseRenderDirty = true;
  }

  /**
   * Updates the deterministic per-instance grass height range for resident and future Detail cells.
   * All three axes share one scale, preserving the source clump proportions.
   * @param minimum Minimum grass-instance uniform scale.
   * @param maximum Maximum grass-instance uniform scale.
   * @throws {RangeError} When the range is non-finite, non-positive, or reversed.
   */
  setGrassScaleRange(minimum: number, maximum: number): void {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum < minimum) {
      throw new RangeError("Seed World grass scale range must be finite, positive, and ordered");
    }
    if (
      this._grassHeightOverride &&
      minimum === this._grassScaleRange.minimum &&
      maximum === this._grassScaleRange.maximum
    )
      return;
    this._grassHeightOverride = true;
    this._grassScaleRange = Object.freeze({ minimum, maximum });
    for (const cell of this._detailCells.cells) {
      for (const batch of cell.resource.detailBatches.get("grass") ?? []) {
        rescaleGrassDetailBatchHeight(batch, this._grassScaleRange);
        this._grassRockAppearancePending.set(batch, undefined);
      }
    }
    this._expandGrassDetailBounds(maximum);
    this._invalidateAllDetailCells();
    this._rebuildRockSurfaceGrass();
    this.update(0);
  }

  private _expandGrassDetailBounds(maximum: number): void {
    const authoredHorizontalMaximum = getSeedWorldAssetPlacementProfile("grass").roleScale.field!.maximum;
    const requiredBoundsRadius = maximumDetailBoundsRadius(
      this._sourceLibrary,
      Math.max(authoredHorizontalMaximum, maximum)
    );
    if (requiredBoundsRadius > this._maximumDetailBoundsRadius) {
      this._maximumDetailBoundsRadius = requiredBoundsRadius;
      for (const cell of this._detailCells.cells) {
        const bounds = detailAreaBounds(
          cell.data.minimumWorldX,
          cell.data.minimumWorldZ,
          cell.data.maximumWorldX,
          cell.data.maximumWorldZ,
          this._fields,
          this._maximumDetailBoundsRadius
        );
        cell.resource.detailBounds.min.copyFrom(bounds.min);
        cell.resource.detailBounds.max.copyFrom(bounds.max);
      }
    }
  }

  /**
   * Updates root-to-tip height in world metres, preserving the source clump aspect ratio.
   * @param minimum Minimum blade height in metres.
   * @param maximum Maximum blade height in metres.
   */
  setGrassHeightRangeMetres(minimum: number, maximum: number): void {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum < minimum) {
      throw new RangeError("Seed World grass height range must be finite, positive, and ordered");
    }
    this.setGrassScaleRange(minimum / GRASS_AUTHORED_HEIGHT_METRES, maximum / GRASS_AUTHORED_HEIGHT_METRES);
  }

  /** Sets terrestrial clumps/m² without changing ecology, exclusions or species proportions. */
  setGrassDensityPerSquareMetre(density: number, completeNearestCell = false): void {
    if (!Number.isFinite(density) || density < 0 || density > 60)
      throw new RangeError("Seed World grass density must be between zero and 60 clumps per square metre");
    if (density === this._grassDensityPerSquareMetre) return;
    this._grassDensityPerSquareMetre = density;
    this._invalidateAllDetailCells();
    this._rebuildRockSurfaceGrass();
    this.update(0);
    if (completeNearestCell) this._completeNearestActiveDetailCompaction();
  }

  /**
   * Updates grass density and schedules deterministic, frame-budgeted replacement of resident compact buffers.
   * @param multiplier Multiplier applied to configured density, from zero to two.
   * @param completeNearestCell Whether debug tuning should synchronously publish the camera-nearest Detail Cell.
   * @throws {RangeError} When the multiplier is outside the supported range.
   */
  setGrassDensityMultiplier(multiplier: number, completeNearestCell = false): void {
    if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > GRASS_DENSITY_MULTIPLIER_MAXIMUM) {
      throw new RangeError("Seed World grass density multiplier must be between zero and two");
    }
    if (multiplier === this._grassDensityMultiplier) return;
    this._grassDensityMultiplier = multiplier;
    this._invalidateAllDetailCells();
    this._rebuildRockSurfaceGrass();
    this.update(0);
    if (completeNearestCell) this._completeNearestActiveDetailCompaction();
  }

  /** Publishes visible Clif transforms to surface grass and opening-view tree grounding. */
  setRockSurfaceGrass(
    rocks: readonly SeedWorldSolvedRockObb[],
    style?: SeedWorldRockGrassTransitionStyle,
    treeCandidates: readonly SeedWorldPopulationInstance[] = Object.freeze([])
  ): void {
    if (this._destroyed) throw new Error("Seed World Population is destroyed");
    const nextStyle = style ?? SEED_WORLD_DEFAULT_ROCK_GRASS_TRANSITION_STYLE;
    const geometryChanged =
      !sameRockSurfaceGrassRocks(this._rockSurfaceGrassRocks, rocks) ||
      this._rockSurfaceGrassStyle.topSlope !== nextStyle.topSlope ||
      this._rockSurfaceGrassStyle.edgeInsetScale !== nextStyle.edgeInsetScale;
    const treeCandidatesChanged = !samePopulationInstanceIds(this._rockSurfaceTreeCandidates, treeCandidates);
    this._rockSurfaceGrassRocks = Object.freeze([...rocks]);
    this._rockSurfaceGrassStyle = nextStyle;
    this._rockSurfaceTreeCandidates = Object.freeze([...treeCandidates]);
    if (!geometryChanged && !treeCandidatesChanged) return;
    this._rebuildRockSurfaceTrees();
    this._rebuildRockSurfaceGrass();
    this._detailsWereActive = false;
    this._treesWereActive = false;
    this.update(0);
  }

  /** Native procedural formations reuse Seed World's grass asset/material/batch path.
   * Publication stages surface identities; candidate compilation runs within the frame budget. */
  prepareRockGrass(placements: readonly RockGrassPlacement[], allowed: RockGrassSampling["allowed"]) {
    this._generatedRockGrass ??= new RockGrassPatches<DetailPopulationBatch>({
      create: (transforms, key, origin, patch) => {
        const batch = this._acquireRockSurfaceGrassBatch({
          key,
          patchX: patch.x,
          patchZ: patch.z,
          rockGround: true,
          minimumY: origin[1] + patch.minimumY,
          maximumY: origin[1] + patch.maximumY,
          transforms,
          instanceCount: transforms.length / DETAIL_TRANSFORM_FLOATS,
          candidateCount: transforms.length / DETAIL_TRANSFORM_FLOATS,
          compiled: true
        });
        this._rockAppearanceBatches.add(batch);
        this._grassRockAppearancePending.set(batch, undefined);
        return batch;
      },
      visible: (batch, visible) => {
        const camera = this._camera.entity.transform.worldPosition;
        batch.renderer.enabled =
          visible &&
          !this._grassRockAppearancePending.has(batch) &&
          this.details.isActiveInHierarchy &&
          this._detailCategoryVisible.grass &&
          this._populationFrustum.intersectsBox(batch.bounds) &&
          (detailBoundsContainsCamera(batch.bounds, camera) ||
            seedWorldPopulationDetailBoundsIsActive(batch.bounds, camera));
      },
      destroy: (batch) => this._retireRockSurfaceGrassBatch(batch)
    });
    const grass = this._generatedRockGrass.prepare(placements, allowed);
    const changed =
      placements.length !== this._grassRockPlacements.length ||
      placements.some((p, i) => {
        const old = this._grassRockPlacements[i];
        return old?.formation !== p.formation || p.origin.some((v, axis) => v !== old.origin[axis]);
      });
    const appearance = changed ? new GrassRockAppearance(placements) : this._grassRockAppearance;
    return {
      ...grass,
      commit: () => {
        grass.commit();
        if (changed) {
          this._grassRockAppearance = appearance;
          this._grassRockPlacements = placements.map((p) => ({
            ...p,
            origin: [...p.origin] as [number, number, number]
          }));
          this._refreshGrassRockAppearance();
        }
      }
    };
  }

  private _refreshGrassRockAppearance(): void {
    for (const cell of this._detailCells.cells)
      for (const batch of cell.resource.detailBatches.get("grass") ?? [])
        this._grassRockAppearancePending.set(batch, undefined);
    for (const batch of this._rockAppearanceBatches) this._grassRockAppearancePending.set(batch, undefined);
  }

  private _advanceGrassRockAppearance(deadline: number): void {
    for (const [batch, pending] of this._grassRockAppearancePending) {
      if (performance.now() >= deadline) break;
      if (batch.destroyed || batch.instanceCount === 0) {
        this._grassRockAppearancePending.delete(batch);
        continue;
      }
      if (!this._grassRockAppearance || !this._grassTerrainMaterial) {
        this._bindGrassRockAppearance(batch, this._fields, {});
        this._grassRockAppearancePending.delete(batch);
        continue;
      }
      const { min, max } = batch.localBounds;
      const radius = Math.hypot(
        Math.max(Math.abs(min.x), Math.abs(max.x)),
        Math.max(Math.abs(min.y), Math.abs(max.y)),
        Math.max(Math.abs(min.z), Math.abs(max.z))
      );
      const task =
        pending ??
        this._grassRockAppearance.compileIncrementally(batch.transforms, batch.instanceCount, radius, this._fields);
      this._grassRockAppearancePending.set(batch, task);
      while (performance.now() < deadline) {
        const step = task.next();
        if (!step.done) continue;
        this._grassRockAppearancePending.delete(batch);
        this._bindGrassRockAppearance(batch, this._fields, { rockAppearanceRecords: step.value });
        break;
      }
    }
  }

  private _bindGrassRockAppearance(
    batch: DetailPopulationBatch,
    fields = this._fields,
    prepared?: Pick<DetailCompactionPublicationWorkItem, "rockAppearanceRecords">
  ): void {
    const { min, max } = batch.localBounds;
    const radius = Math.hypot(
      Math.max(Math.abs(min.x), Math.abs(max.x)),
      Math.max(Math.abs(min.y), Math.abs(max.y)),
      Math.max(Math.abs(min.z), Math.abs(max.z))
    );
    const records = prepared
      ? prepared.rockAppearanceRecords
      : this._grassRockAppearance?.compile(batch.transforms, batch.instanceCount, radius, fields);
    const data = batch.renderer.shaderData;
    if (!records || !this._grassTerrainMaterial) {
      data.disableMacro("RENDERER_GRASS_ROCK_APPEARANCE");
      return;
    }
    bindSeedWorldGrassTerrainMaterial(batch.renderer.getMaterial()!, this._grassTerrainMaterial);
    const mesh = batch.resources.mesh;
    if (!batch.rockAppearanceBuffer) {
      const capacity = batch.resources.instanceBuffer.byteLength / 4 / DETAIL_TRANSFORM_FLOATS;
      batch.rockAppearanceBuffer = new Buffer(
        this._engine,
        BufferBindFlag.VertexBuffer,
        capacity * GRASS_ROCK_APPEARANCE_STRIDE * 4,
        BufferUsage.Dynamic
      );
      const binding = mesh.vertexBufferBindings.length;
      mesh.setVertexBufferBinding(batch.rockAppearanceBuffer, GRASS_ROCK_APPEARANCE_STRIDE * 4, binding);
      mesh.setVertexElements([
        ...mesh.vertexElements,
        ...["A", "B", "C", "NA", "NB", "NC", "META"].map(
          (suffix, i) => new VertexElement(`DETAIL_ROCK_${suffix}`, i * 16, VertexElementFormat.Vector4, binding, 1)
        )
      ]);
    }
    batch.rockAppearanceBuffer.setData(records);
    data.enableMacro("RENDERER_GRASS_ROCK_APPEARANCE");
  }

  get generatedRockGrassDiagnostics() {
    return this._generatedRockGrass?.diagnostics;
  }

  /** Apply a committed rock appearance to resident roots and future streamed batches. */
  setRockGrassGround(settings: Pick<RockFormationSettings, "textureScale" | "colorBlend">): void {
    this._rockGroundSettings = settings;
    for (const material of this._detailMaterials.values())
      bindRockGrassGroundMaterial(this._engine, material, settings);
  }

  get rockSurfaceGrassDiagnostics(): Readonly<{
    rockCount: number;
    patchCount: number;
    instanceCount: number;
    sourceTriangleCount: number;
    acceptedTriangleCount: number;
    residentBatchCount: number;
  }> {
    return Object.freeze({
      rockCount: this._rockSurfaceGrassRocks.length,
      patchCount: this._rockSurfaceGrassPatches.length,
      instanceCount: this._rockSurfaceGrassCompiledInstanceCount,
      sourceTriangleCount: this._rockSurfaceGrassCompiler?.sourceTriangleCount ?? 0,
      acceptedTriangleCount: this._rockSurfaceGrassCompiler?.acceptedTriangleCount ?? 0,
      residentBatchCount: this._rockSurfaceGrassBatches.length
    });
  }

  /** Exact opening-view trees recovered onto upward-facing Clif triangles. */
  get rockSurfaceTreeDiagnostics(): Readonly<{
    candidateCount: number;
    instanceCount: number;
    sourceTriangleCount: number;
    acceptedTriangleCount: number;
  }> {
    return Object.freeze({
      candidateCount: this._rockSurfaceTreeCompilation.candidateCount,
      instanceCount: this._populationLayout.treeInstances.filter(({ id }) =>
        this._groundedSparseInstanceOverrides.has(id)
      ).length,
      sourceTriangleCount: this._rockSurfaceTreeCompilation.sourceTriangleCount,
      acceptedTriangleCount: this._rockSurfaceTreeCompilation.acceptedTriangleCount
    });
  }

  /** Updates the one colour-field contract used by resident and future grass batches. */
  setGrassColorFieldTuning(tuning: SeedWorldGrassColorFieldTuning): void {
    if (!this._grassColorField) throw new Error("Seed World grass colour field is not configured");
    const next = freezeSeedWorldGrassColorFieldTuning(tuning);
    this._grassColorField = Object.freeze({ ...this._grassColorField, tuning: next });
    for (const cell of this._detailCells.cells) {
      for (const batch of cell.resource.detailBatches.get("grass") ?? []) {
        bindGrassColorField(batch.renderer, this._grassColorField);
      }
    }
    for (const batch of this._rockSurfaceGrassBatches) bindGrassColorField(batch.renderer, this._grassColorField);
    this._generatedRockGrass?.visitBatches((batch) => bindGrassColorField(batch.renderer, this._grassColorField!));
  }

  /** Updates the road endpoint used by the Terrain-weighted grass surface colour. */
  setGrassRoadColor(color: GrassRoadColor): void {
    const next = freezeGrassRoadColor(color);
    this._grassRoadColor = next;
    for (const cell of this._detailCells.cells) {
      for (const batch of cell.resource.detailBatches.get("grass") ?? []) {
        bindGrassRoadColor(batch.renderer, next);
      }
    }
    for (const batch of this._rockSurfaceGrassBatches) bindGrassRoadColor(batch.renderer, next);
    this._generatedRockGrass?.visitBatches((batch) => bindGrassRoadColor(batch.renderer, next));
  }

  /** Uses the same continuous ground coverage as Terrain; roads affect size, not density. */
  setGrassSurfaceCoverageSampler(sampleCoverage: SeedWorldGrassCoverageSampler): void {
    this._grassSurfaceCoverage = sampleCoverage;
    this._invalidateAllDetailCells();
  }

  /** Filters terrestrial grass using the same authoritative water winner as navigation. */
  setGrassWaterCoverage(sampleContactIsWater: (worldX: number, worldZ: number) => boolean): void {
    this._grassContactIsWater = sampleContactIsWater;
    this._invalidateAllDetailCells();
  }

  /**
   * Shares the final Terrain surface with resident and subsequently streamed ground grass.
   * @param material Current near Terrain material; owned and destroyed by Terrain.
   */
  setGrassTerrainSurface(material: Material): void {
    this._grassTerrainMaterial = material;
    this._refreshGrassRockAppearance();
    for (const cell of this._detailCells.cells) {
      for (const batch of cell.resource.detailBatches.get("grass") ?? []) {
        bindSeedWorldGrassTerrainSurface(batch.renderer, material);
      }
      for (const batch of cell.resource.compactionTask?.publication?.grassBatches ?? []) {
        bindSeedWorldGrassTerrainSurface(batch.renderer, material);
      }
    }
  }

  /**
   * Returns immutable Producer-owned sparse instances for semantic world queries.
   * Dense grass and flower fields intentionally remain addressable as Brush resources rather than per-blade objects.
   */
  getExactPopulationInstances(): readonly SeedWorldPopulationInstance[] {
    return this._populationLayout.treeInstances;
  }

  /** Complete currently published layout used as the base for local Authoring deltas. */
  getPopulationLayout(): SeedWorldPopulationPreview {
    return this._populationLayout;
  }

  /** Unmasked source for authoring; gameplay occupancy must never become a second saved density field. */
  getAuthoringPopulationLayout(): SeedWorldPopulationPreview {
    return this._groundCoverBase ?? this._populationLayout;
  }

  /** Host-owned occupied ground. Multiple consumers compose without changing authored density or Terrain heights. */
  setGroundCoverExclusions(owner: string, areas: readonly SeedWorldAuthoringRuntimeBoundsV1[]): Promise<void> {
    if (this._destroyed) throw new Error("Seed World Population is destroyed");
    if (!owner.trim()) throw new Error("Ground cover exclusion owner is required");
    const owned = areas.map((area) => {
      if (
        ![area.minimumX, area.minimumZ, area.maximumX, area.maximumZ].every(Number.isFinite) ||
        area.minimumX > area.maximumX ||
        area.minimumZ > area.maximumZ
      )
        throw new Error("Invalid occupied ground bounds");
      return Object.freeze({ ...area });
    });
    const next = new Map(this._groundCoverExclusions);
    if (owned.length) next.set(owner, owned);
    else next.delete(owner);
    const base = this.getAuthoringPopulationLayout();
    const nextAreas = [...next.values()].flat();
    const dirty = groundCoverChangeBounds([...this._groundCoverExclusions.values()].flat(), nextAreas);
    if (!dirty.length) {
      this._groundCoverExclusions = next;
      return Promise.resolve();
    }
    const projected = excludeSeedWorldGroundCover(base, this._fields, nextAreas);
    let completion = Promise.resolve();
    if (
      dirty.length &&
      projected.detailDensityFields.some(
        (field, i) => field.hash !== this._populationLayout.detailDensityFields[i].hash
      )
    ) {
      // Exclusion uses endpoint texels and density uses pixel-centred bilinear sampling.
      // Three source spacings conservatively cover their combined support at either world edge.
      const changedFields = base.detailDensityFields.filter(
        (_, index) =>
          projected.detailDensityFields[index].hash !== this._populationLayout.detailDensityFields[index].hash
      );
      const support =
        Math.max(
          ...changedFields.map((field) => this._fields.sizeMetres / (Math.sqrt(groundCoverSampleCount(field)) - 1))
        ) * 3;
      const dirtyAreas = dirty.map((b) => ({
        minimumX: b.minimumX - support,
        maximumX: b.maximumX + support,
        minimumZ: b.minimumZ - support,
        maximumZ: b.maximumZ + support
      }));
      completion = this.publishPopulationLayout(
        projected,
        {
          minimumX: Math.min(...dirtyAreas.map((b) => b.minimumX)),
          maximumX: Math.max(...dirtyAreas.map((b) => b.maximumX)),
          minimumZ: Math.min(...dirtyAreas.map((b) => b.minimumZ)),
          maximumZ: Math.max(...dirtyAreas.map((b) => b.maximumZ))
        },
        undefined,
        base,
        dirtyAreas
      );
    }
    this._groundCoverBase = base;
    this._groundCoverExclusions = next;
    return completion;
  }

  /** Creates entrance playback only after canonical sparse instances completed their first renderer submission. */
  createAuthoringPopulationEntrance(
    addedInstances: readonly SeedWorldPopulationInstance[]
  ): SeedWorldAuthoringPopulationEntrance | null {
    if (this._destroyed) throw new Error("Seed World Population runtime is destroyed");
    const treeIds = new Set(addedInstances.filter(({ category }) => category === "tree").map(({ id }) => id));
    const shrubIds = new Set(addedInstances.filter(({ category }) => category === "shrub").map(({ id }) => id));
    if (treeIds.size === 0 && shrubIds.size === 0) return null;
    const publishedIds = new Set(this._populationLayout.treeInstances.map(({ id }) => id));
    for (const instanceId of [...treeIds, ...shrubIds]) {
      if (!publishedIds.has(instanceId)) {
        throw new Error(`Seed World Authoring entrance requires published vegetation '${instanceId}'`);
      }
    }
    let played = false;
    return {
      play: async (durationMs = ASSET_ASSEMBLY_ENTRANCE_DURATION_MS, signal?: AbortSignal): Promise<void> => {
        if (played) throw new Error("Seed World Authoring entrance can only be played once");
        played = true;
        await Promise.all([
          this._treeRenderer.playEntrance(treeIds, durationMs, signal),
          this._shrubRenderer.playEntrance(shrubIds, durationMs, signal)
        ]);
      }
    };
  }

  /** Replays the generated Population entrance without enrolling tree view batches in the generic Renderer path. */
  async playAssetEntranceEffect(durationMs = ASSET_ASSEMBLY_ENTRANCE_DURATION_MS, signal?: AbortSignal): Promise<void> {
    if (this._destroyed) throw new Error("Seed World Population runtime is destroyed");
    const treeIds = new Set(this._treeRenderer.variationAssignments.keys());
    await Promise.all([
      this._treeRenderer.playEntrance(treeIds, durationMs, signal),
      playRendererAssetEntranceEffect(this.trees, this._shrubRenderer.entranceRenderers, {
        durationMs,
        signal
      })
    ]);
  }

  /**
   * Publishes a new Authoring vegetation overlay without recreating the Population runtime.
   * Only affected 64m sparse Cells and active Detail resources are replaced.
   * @param nextLayout Canonical population to publish.
   * @param dirtyBounds World rectangle affected by the edit.
   * @param entrance Optional cancellation scope enabling new flower instance entrances.
   * @returns Completion of requested visible Detail publication and entrance playback.
   */
  applyAuthoringPopulationLayout(
    nextLayout: SeedWorldPopulationPreview,
    dirtyBounds: SeedWorldAuthoringRuntimeBoundsV1,
    entrance?: Readonly<{ signal: AbortSignal }>
  ): Promise<void> {
    if (this._destroyed) throw new Error("Seed World Population runtime is destroyed");
    const projected = excludeSeedWorldGroundCover(
      nextLayout,
      this._fields,
      [...(this._groundCoverExclusions?.values() ?? [])].flat()
    );
    const completion = this.publishPopulationLayout(projected, dirtyBounds, entrance);
    this._groundCoverBase = nextLayout;
    return completion;
  }

  private publishPopulationLayout(
    nextLayout: SeedWorldPopulationPreview,
    dirtyBounds: SeedWorldAuthoringRuntimeBoundsV1,
    entrance?: Readonly<{ signal: AbortSignal }>,
    validatedGroundCoverSource?: SeedWorldPopulationPreview,
    groundCoverDirtyAreas?: readonly SeedWorldAuthoringRuntimeBoundsV1[]
  ): Promise<void> {
    if (this._destroyed) throw new Error("Seed World Population runtime is destroyed");
    validatePopulationLayoutTopology(this._populationLayout, nextLayout);
    validateDetailCompactionInputs(nextLayout, this._fields, validatedGroundCoverSource);
    const previousLayout = this._populationLayout;
    entrance?.signal.throwIfAborted();
    const previousVariationAssignments = this._treeRenderer.variationAssignments;
    const nextSparseInstances = nextLayout.treeInstances;
    const previousSparseInstances = previousLayout.treeInstances;
    const previousById = new Map(previousSparseInstances.map((instance) => [instance.id, instance] as const));
    const changedTrees = nextSparseInstances.filter(
      (instance) => instance.category === "tree" && previousById.get(instance.id) !== instance
    );
    const changedGrounding =
      changedTrees.length > 0 && this._rockSurfaceGrassRocks.length > 0
        ? this._compileRockSurfaceTrees(changedTrees)
        : undefined;
    const previousGroundings = changedGrounding ? new Map(this._groundedSparseInstanceOverrides) : undefined;
    const nextVariationAssignments = this._treeRenderer.reconcileVariationAssignments(
      nextSparseInstances,
      previousVariationAssignments
    );
    const dirtyCellIds = groundCoverDirtyAreas
      ? new Set(groundCoverDirtyAreas.flatMap((bounds) => [...populationCellIdsForBounds(this._fields, bounds)]))
      : populationCellIdsForBounds(this._fields, dirtyBounds);
    const detailEntrance =
      entrance &&
      nextLayout.detailDensityFields.some(
        (field) =>
          previousLayout.detailDensityFields.find((previous) => previous.prototypeFamily === field.prototypeFamily)
            ?.hash !== field.hash
      )
        ? this._createDetailAuthoringEntrance(previousLayout.detailDensityFields, entrance.signal)
        : undefined;
    try {
      if (changedGrounding) {
        for (const { id } of changedTrees) this._groundedSparseInstanceOverrides.delete(id);
        for (const placement of changedGrounding.placements) {
          this._groundedSparseInstanceOverrides.set(
            placement.producerInstance.id,
            createRockSurfaceTreeGrounding(placement)
          );
        }
      }
      this._treeRenderer.ensureCapacity(Object.freeze({ ...nextLayout, treeInstances: nextSparseInstances }));
      this._shrubRenderer.ensureCapacity(nextLayout);
      this._treeRenderer.setVariationAssignments(nextVariationAssignments);
      this._sparseCells.replacePrecompiledInstances(nextSparseInstances, dirtyCellIds);
      this._populationLayout = nextLayout;
      this._expandGrassDetailBounds(this.grassHeightRangeMetres.maximum / GRASS_AUTHORED_HEIGHT_METRES);
      this._invalidateDetailCells(dirtyCellIds, detailEntrance, groundCoverDirtyAreas);
      this._rebuildRockSurfaceGrass();
      this._sparseRenderDirty = true;
      // Occupancy is queued for the engine frame; it must not spend a second Detail budget in a subscriber.
      if (!groundCoverDirtyAreas) this.update(0);
      if (detailEntrance) this._settleCompletedDetailEntrance(detailEntrance);
    } catch (error) {
      detailEntrance?.finish(error);
      try {
        if (previousGroundings) {
          this._groundedSparseInstanceOverrides.clear();
          for (const [id, grounding] of previousGroundings) this._groundedSparseInstanceOverrides.set(id, grounding);
        }
        this._treeRenderer.setVariationAssignments(previousVariationAssignments);
        this._populationLayout = previousLayout;
        this._sparseCells.replacePrecompiledInstances(previousSparseInstances, dirtyCellIds);
        this._invalidateDetailCells(dirtyCellIds);
        this._rebuildRockSurfaceGrass();
        this._sparseRenderDirty = true;
        if (!groundCoverDirtyAreas) this.update(0);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Seed World Population Authoring publication and rollback failed"
        );
      }
      throw error;
    }
    return detailEntrance?.completion ?? Promise.resolve();
  }

  /** Prepare every currently resident affected detail cell before publishing any live field. */
  async prepareWaterImpact(
    fields: SeedWorldFields,
    layout: SeedWorldPopulationPreview,
    bounds: SeedWorldAuthoringRuntimeBoundsV1,
    signal: AbortSignal,
    waterContact: (x: number, z: number) => boolean,
    coverage: SeedWorldGrassCoverageSampler,
    waterAreas?: readonly SeedWorldAuthoringRuntimeBoundsV1[]
  ): Promise<PreparedTerrainUpdate> {
    signal.throwIfAborted();
    if (
      fields.sizeMetres !== this._fields.sizeMetres ||
      fields.heightResolution !== this._fields.heightResolution ||
      fields.surfaceResolution !== this._fields.surfaceResolution
    )
      throw Error("Population water lattice changed");
    validateDetailCompactionInputs(layout, fields);
    if (layout.treeInstances.length || this._populationLayout.treeInstances.length)
      throw Error("Water patch requires independently owned woody vegetation");
    const baseLayout = layout,
      oldBase = this._groundCoverBase;
    layout = excludeSeedWorldGroundCover(layout, fields, [...this._groundCoverExclusions.values()].flat());
    const oldFields = { ...this._fields },
      oldLayout = this._populationLayout;
    const oldCoverage = this._grassSurfaceCoverage,
      oldWater = this._grassContactIsWater;
    const dirty = populationCellIdsForBounds(this._fields, bounds);
    const residency = [...this._detailCells.cells];
    const activity = new Map(residency.map((cell) => [cell, cell.resource.root.isActive]));
    const staged: {
      cell: SeedWorldResidentPopulationCell<DetailPopulationCellResource>;
      next: SeedWorldResidentPopulationCell<DetailPopulationCellResource>;
    }[] = [];
    try {
      for (const cell of residency) {
        const waterContactChanged = waterAreas?.some(
          (area) =>
            cell.data.minimumWorldX <= area.maximumX &&
            cell.data.maximumWorldX >= area.minimumX &&
            cell.data.minimumWorldZ <= area.maximumZ &&
            cell.data.maximumWorldZ >= area.minimumZ
        );
        if (!dirty.has(cell.data.id) && !waterContactChanged) continue;
        if (
          waterAreas &&
          !waterContactChanged &&
          !seedWorldWaterDetailCellChanged(cell.data, this._fields, fields, this._populationLayout, layout)
        )
          continue;
        const resource = this._createDetailCellResource(cell.data, fields, layout, true);
        const next = { data: cell.data, resource };
        staged.push({ cell, next });
        resource.compactionTask = this._createDetailCompactionTask(layout);
        while (!resource.compactionTask.ready) {
          const deadline = performance.now() + WATER_PREPARATION_SLICE_MILLISECONDS;
          // The small chunk bounds cancellation/CPU work, not scheduling. Yield once per time slice;
          // yielding every 64 candidates accumulates seconds of browser timer-clamp delay per dense cell.
          do {
            signal.throwIfAborted();
            this._advanceDetailCompactionTask(
              next,
              DETAIL_COMPACTION_CHUNK_CANDIDATES,
              fields,
              layout,
              waterContact,
              coverage
            );
          } while (!resource.compactionTask.ready && performance.now() < deadline);
          if (!resource.compactionTask.ready) await yieldSeedWorldPreparationTask();
        }
        while (!this._advanceDetailPublication(next, performance.now() + 4, 4, fields)) {
          signal.throwIfAborted();
          await yieldSeedWorldPreparationTask();
        }
      }
      signal.throwIfAborted();
    } catch (error) {
      for (const c of staged) this._disposeDetailCellResource(c.next.resource);
      throw error;
    }
    const swap = this._detailCells.prepareResidentResources(
      new Map(staged.map((c) => [c.cell.data.id, c.next.resource]))
    );
    let state: "prepared" | "committed" | "finished" = "prepared";
    const setVisible = (entry: SeedWorldResidentPopulationCell<DetailPopulationCellResource>, active: boolean) => {
      entry.resource.root.isActive = active;
      if (active) this._updateDetailBatchVisibility(entry, this._camera.entity.transform.worldPosition);
      else
        for (const batches of entry.resource.detailBatches.values())
          for (const batch of batches) this._setDetailBatchEnabled(batch, false);
    };
    const rollback = () => {
      if (state !== "committed") return;
      const errors: unknown[] = [];
      for (const c of staged)
        try {
          setVisible(c.next, false);
        } catch (error) {
          errors.push(error);
        }
      swap.rollback();
      Object.assign(this._fields, oldFields);
      this._populationLayout = oldLayout;
      this._groundCoverBase = oldBase;
      this._grassSurfaceCoverage = oldCoverage;
      this._grassContactIsWater = oldWater;
      for (const c of staged)
        try {
          setVisible(c.cell, activity.get(c.cell) ?? false);
        } catch (error) {
          errors.push(error);
        }
      this._terrainOcclusionCuller.invalidate();
      state = "prepared";
      if (errors.length) throw new AggregateError(errors, "Population visibility rollback failed");
    };
    return {
      commit: () => {
        if (state !== "prepared" || this._destroyed || this._populationLayout !== oldLayout)
          throw Error("Stale water population");
        signal.throwIfAborted();
        if (
          this._detailCells.cells.length !== residency.length ||
          this._detailCells.cells.some((cell, i) => cell !== residency[i])
        )
          throw Error("Water population residency changed during preparation");
        swap.commit();
        this._detailCells.invalidatePending();
        state = "committed";
        try {
          Object.assign(this._fields, fields);
          this._populationLayout = layout;
          this._groundCoverBase = baseLayout;
          this._grassSurfaceCoverage = coverage;
          this._grassContactIsWater = waterContact;
          for (const c of staged) {
            setVisible(c.cell, false);
            c.next.resource.detailsActive = c.cell.resource.detailsActive;
            setVisible(c.next, activity.get(c.cell) ?? false);
          }
          this._terrainOcclusionCuller.invalidate();
        } catch (error) {
          rollback();
          throw error;
        }
      },
      rollback,
      finalize: () => {
        if (state !== "committed") throw Error("Population patch not committed");
        state = "finished";
        for (const c of staged) this._disposeDetailCellResource(c.cell.resource);
      },
      discard: () => {
        if (state === "finished") return;
        rollback();
        state = "finished";
        for (const c of staged) this._disposeDetailCellResource(c.next.resource);
      }
    };
  }

  /** Synchronizes final local terrain heights and rebuilds derived dense-detail Cell bounds. */
  applyAuthoringHeightPatch(
    sampleOrigin: readonly [x: number, z: number],
    sampleSize: readonly [width: number, height: number],
    samples: Uint16Array,
    dirtyBounds: SeedWorldAuthoringRuntimeBoundsV1
  ): void {
    this.applyAuthoringHeightFrame(sampleOrigin, sampleSize, samples, dirtyBounds);
    this.update(0);
  }

  /**
   * Moves resident vegetation with one transient terrain-animation height frame.
   * @param sampleOrigin Zero-based source X-Z origin in the shared height field.
   * @param sampleSize Width and height of the supplied R16 rectangle.
   * @param samples Current animated R16 height samples.
   * @param dirtyBounds World-space bounds whose resident sparse transforms require re-grounding.
   * @returns Nothing after dense height sampling and resident sparse transforms are synchronized.
   */
  applyAuthoringHeightFrame(
    sampleOrigin: readonly [x: number, z: number],
    sampleSize: readonly [width: number, height: number],
    samples: Uint16Array,
    dirtyBounds: SeedWorldAuthoringRuntimeBoundsV1
  ): void {
    if (this._destroyed) throw new Error("Seed World Population runtime is destroyed");
    const [originX, originZ] = sampleOrigin;
    const [width, height] = sampleSize;
    if (samples.length !== width * height) throw new Error("Population height patch payload is invalid");
    if (
      originX < 0 ||
      originZ < 0 ||
      width <= 0 ||
      height <= 0 ||
      originX + width > this._fields.heightResolution ||
      originZ + height > this._fields.heightResolution
    ) {
      throw new RangeError("Population height patch lies outside the canonical height field");
    }
    for (let localZ = 0; localZ < height; localZ++) {
      const sourceOffset = localZ * width;
      const targetOffset = (originZ + localZ) * this._fields.heightResolution + originX;
      this._fields.heightSamples.set(samples.subarray(sourceOffset, sourceOffset + width), targetOffset);
    }
    const dirtyCellIds = populationCellIdsForBounds(this._fields, dirtyBounds);
    this._refreshDetailCellsGrounding(dirtyCellIds);
    this._refreshGrassRockAppearance();
    this._sparseCells.refreshPrecompiledGrounding(dirtyCellIds);
    this._sparseRenderDirty = true;
    this.update(0);
  }

  /**
   * Creates camera-driven population residency and renderer-owned LOD batches.
   * @param engine Engine owning GPU resources.
   * @param root Population scene owner.
   * @param camera Camera which alone controls Cell residency, culling, LOD, and fade.
   * @param sourceLibrary Authored production Prefabs and LOD metadata.
   * @param treeAuthoringProfiles Fully resolved persisted procedural-tree authoring state for every loaded recipe.
   * @param plan Authoritative semantic plan.
   * @param fields Canonical final terrain and habitat fields.
   * @param populationLayout Worker-baked tree/shrub instances and Detail density fields.
   * @param inspectionRange Optional bounded Cell range for a diagnostic preview.
   * @param grassColorField Shared world-space colour multiplication bound to grass renderers.
   * @param grassRoadColor Road palette endpoint shared with Terrain road-layer evaluation.
   * @param terrainOcclusionCuller World-owned shared Terrain Horizon; tests may omit it for an isolated runtime.
   * @throws {RangeError} When Plan and WorldFields do not describe the same generated world.
   * @throws When the source catalog or authored detail fade contract is incomplete.
   */
  constructor(
    engine: Engine,
    root: Entity,
    camera: Camera,
    sourceLibrary: AssetAssemblySourceLibrary,
    treeAuthoringProfiles: readonly ProceduralTreeRuntimeAuthoringProfile[],
    plan: SeedWorldPopulationWorld,
    fields: SeedWorldFields,
    populationLayout: SeedWorldPopulationPreview,
    inspectionRange?: SeedWorldPopulationInspectionRange,
    grassColorField?: SeedWorldGrassColorFieldBinding,
    grassRoadColor?: GrassRoadColor,
    terrainOcclusionCuller?: SeedWorldTerrainOcclusionCuller
  ) {
    validateSeedWorldPopulationRuntimeInputs(plan, fields);
    validatePopulationSources(sourceLibrary, treeAuthoringProfiles);
    validateDetailCompactionInputs(populationLayout, fields);
    this._engine = engine;
    this._camera = camera;
    this._sourceLibrary = sourceLibrary;
    this._treeAuthoringProfiles = treeAuthoringProfiles;
    this._treeAuthoringProfileByRecipeId = new Map(
      treeAuthoringProfiles.map((profile) => [profile.recipe.id, profile])
    );
    this._treeLeafLightingByRecipeId = new Map(
      treeAuthoringProfiles.map((profile) => [
        profile.recipe.id,
        detachTreeLeafLightingTuning(profile.leafLightingTuning)
      ])
    );
    this._treeVariationControlsByRecipeId = new Map(
      treeAuthoringProfiles.map((profile) => [
        profile.recipe.id,
        detachTreeVariationControls(profile.variationControls)
      ])
    );
    this._plan = plan;
    this._fields = fields;
    this._terrainOcclusionCuller = terrainOcclusionCuller ?? new SeedWorldTerrainOcclusionCuller(fields);
    this._populationLayout = populationLayout;
    this._grassColorField = grassColorField;
    this._grassRoadColor = grassRoadColor ? freezeGrassRoadColor(grassRoadColor) : undefined;
    this._maximumDetailBoundsRadius = maximumDetailBoundsRadius(
      sourceLibrary,
      Math.max(
        getSeedWorldAssetPlacementProfile("grass").roleScale.field!.maximum,
        this.grassHeightRangeMetres.maximum / GRASS_AUTHORED_HEIGHT_METRES
      )
    );
    this.observationAnchor =
      plan.observationAnchor ??
      ("coastShape" in plan
        ? findObservationAnchor(plan as SeedWorldPlan, fields)
        : {
            x: seedWorldOriginX(fields) + fields.sizeMetres / 2,
            y:
              sampleSeedWorldHeight(
                fields,
                seedWorldOriginX(fields) + fields.sizeMetres / 2,
                seedWorldOriginZ(fields) + fields.sizeMetres / 2
              ) ?? 0,
            z: seedWorldOriginZ(fields) + fields.sizeMetres / 2
          });
    this.details = root.createChild("Details");
    this._rockSurfaceGrassRoot = this.details.createChild("Rock Surface Grass");
    this.trees = root.createChild("Trees");

    const treeRenderer = new SeedWorldTreeLodRenderer(
      engine,
      camera,
      this.trees,
      treeAuthoringProfiles,
      populationLayout,
      worldBounds(fields)
    );
    let shrubRenderer: SeedWorldShrubLodRenderer;
    try {
      shrubRenderer = new SeedWorldShrubLodRenderer(
        engine,
        camera,
        this.trees,
        sourceLibrary,
        fields,
        populationLayout
      );
    } catch (error) {
      treeRenderer.destroy();
      this.trees.destroy();
      this.details.destroy();
      throw error;
    }
    this._treeRenderer = treeRenderer;
    this._shrubRenderer = shrubRenderer;
    this._sparseCells = new SeedWorldPopulationCellSet(
      plan,
      fields,
      {
        create: (cell) => this._createSparseCellResource(cell),
        refreshGrounding: (resource, cell) => this._refreshSparseCellResourceGrounding(resource, cell),
        dispose: () => undefined
      },
      {
        categories: ["tree", "shrub"],
        precompiledInstances: populationLayout.treeInstances,
        groundedInstanceOverrides: this._groundedSparseInstanceOverrides,
        omitEmptyPrecompiledCells: true,
        residentCellRadius: SEED_WORLD_POPULATION_RUNTIME_PROFILE.residentCellRadius,
        maximumNewCellsPerUpdate: Number.POSITIVE_INFINITY,
        maximumReleasedCellsPerUpdate: 16,
        maximumCandidateEvaluationsPerUpdate: 512,
        maximumCompilationMillisecondsPerUpdate: 2,
        ...(inspectionRange ? { activeCellRange: inspectionRange } : {})
      }
    );
    this._detailCells = new SeedWorldPopulationCellSet(
      plan,
      fields,
      {
        create: (cell) => this._createDetailCellResource(cell),
        dispose: (resource) => this._disposeDetailCellResource(resource)
      },
      {
        categories: SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.categories,
        precompiledInstances: [],
        residentCellRadius: SEED_WORLD_POPULATION_RUNTIME_PROFILE.detailResidentCellRadius,
        maximumNewCellsPerUpdate: 1,
        maximumReleasedCellsPerUpdate: 4,
        ...(inspectionRange ? { activeCellRange: inspectionRange } : {})
      }
    );
    try {
      this.update(0);
      this._sparseRenderDirty = true;
    } catch (error) {
      this._detailCells.destroy();
      this._sparseCells.destroy();
      this._shrubRenderer.destroy();
      this._treeRenderer.destroy();
      this.trees.destroy();
      this.details.destroy();
      throw error;
    }
  }

  /**
   * Refreshes camera-driven Cell residency, dense uploads, authored LOD selection, and fades.
   * @param deltaTime Non-negative elapsed seconds since the previous update.
   * @returns Nothing.
   */
  update(deltaTime = 0): void {
    if (this._destroyed) return;
    this._elapsedSeconds += Math.max(0, deltaTime);
    const appearanceDeadline = performance.now() + 2;
    this._advanceGrassRockAppearance(appearanceDeadline);
    const cameraPosition = this._camera.entity.transform.worldPosition;
    const populationVisible = this.details.isActiveInHierarchy || this.trees.isActiveInHierarchy;
    const cameraChanged = populationVisible && capturePopulationCameraState(this._camera, this._populationCameraState);
    if (cameraChanged) {
      Matrix.multiply(this._camera.projectionMatrix, this._camera.viewMatrix, this._populationViewProjection);
      this._populationFrustum.calculateFromMatrix(this._populationViewProjection);
    }
    if (this._generatedRockGrass) {
      const height = this.grassHeightRangeMetres;
      this._generatedRockGrass.update(
        [cameraPosition.x, cameraPosition.y, cameraPosition.z],
        seedWorldPopulationDetailFadeTerminalDistance(),
        this.details.isActiveInHierarchy && this._detailCategoryVisible.grass,
        {
          density: this._grassDensityPerSquareMetre * this._grassDensityMultiplier,
          minimumScale: height.minimum / GRASS_AUTHORED_HEIGHT_METRES,
          maximumScale: height.maximum / GRASS_AUTHORED_HEIGHT_METRES,
          rootRadius: readSeedWorldGrassRootRadius(this._rockSurfaceGrassSourceForRuntime())
        }
      );
    }
    if (this.details.isActiveInHierarchy) {
      const previousDetailCellCount = this._detailCells.size;
      if (cameraChanged || !this._detailsWereActive || !this._detailCells.isResidencySettled) {
        this._detailCells.update(cameraPosition.x, cameraPosition.z);
      }
      if (cameraChanged || !this._detailsWereActive || this._detailCells.size !== previousDetailCellCount) {
        const detailCells = this._detailCells.cells;
        for (let cellIndex = 0; cellIndex < detailCells.length; cellIndex++) {
          const cell = detailCells[cellIndex]!;
          const cellActive =
            this._populationFrustum.intersectsBox(cell.resource.detailBounds) &&
            (detailBoundsContainsCamera(cell.resource.detailBounds, cameraPosition) ||
              seedWorldPopulationDetailBoundsIsActive(cell.resource.detailBounds, cameraPosition));
          const cellPrefetch =
            cellActive ||
            detailBoundsContainsCamera(cell.resource.detailBounds, cameraPosition) ||
            seedWorldPopulationDetailBoundsIsActive(
              cell.resource.detailBounds,
              cameraPosition,
              SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.prefetchDistanceMetres
            );
          this._setCellDetails(cell, cellActive, cellPrefetch);
          if (cellActive) this._updateDetailBatchVisibility(cell, cameraPosition);
        }
      }
      this._advanceDetailCompactions(cameraPosition);
      this._primeDetailTransformPoolWhenSettled();
      if (cameraChanged || !this._detailsWereActive || this._rockSurfaceGrassVisibilityDirty) {
        this._updateRockSurfaceGrassVisibility(cameraPosition);
      }
      this._detailsWereActive = true;
    } else {
      for (let batchIndex = 0; batchIndex < this._rockSurfaceGrassBatches.length; batchIndex++) {
        this._rockSurfaceGrassBatches[batchIndex]!.renderer.enabled = false;
      }
      this._detailsWereActive = false;
    }
    this._advanceDetailEntrances();
    this._treeRenderer.advanceEntrances(this._elapsedSeconds);
    this._shrubRenderer.advanceEntrances(this._elapsedSeconds);
    if (this.trees.isActiveInHierarchy) {
      if (
        cameraChanged ||
        !this._treesWereActive ||
        !this._sparseCellsInitialized ||
        !this._sparseCells.isResidencySettled
      ) {
        this._sparseCells.update(cameraPosition.x, cameraPosition.z);
        this._sparseCellsInitialized = true;
        this._sparseRenderDirty = true;
      }
      const sparseRenderDirty = this._sparseRenderDirty;
      const refreshSparseRender = cameraChanged || !this._treesWereActive || sparseRenderDirty;
      if (refreshSparseRender || this._treeTransitionActive) {
        this._terrainOcclusionCuller.beginPopulationVisibilityPass("tree");
        this._treeTransitionActive = this._treeRenderer.update(
          this._sparseCells.cells,
          this._camera,
          this._populationFrustum,
          this._elapsedSeconds,
          this._lodTuning,
          this._terrainOcclusionCuller
        );
        this._terrainOcclusionCuller.endPopulationVisibilityPass();
      }
      if (refreshSparseRender || this._shrubRenderer.transitionActive) {
        this._terrainOcclusionCuller.beginPopulationVisibilityPass("shrub");
        this._shrubRenderer.update(
          this._sparseCells.cells,
          this._camera,
          this._populationFrustum,
          this._elapsedSeconds,
          this._lodTuning,
          this._terrainOcclusionCuller
        );
        this._terrainOcclusionCuller.endPopulationVisibilityPass();
      }
      this._sparseRenderDirty = false;
      this._treesWereActive = true;
    } else {
      if (this._treesWereActive) this._terrainOcclusionCuller.clearPopulationVisibility();
      this._treeTransitionActive = false;
      this._treesWereActive = false;
    }
  }

  /**
   * Materializes the one dense Cell containing the current camera before the page accepts camera input.
   * @returns Nothing.
   * @throws When the authored dense-detail buffers cannot be created or uploaded.
   */
  warmupDetails(): void {
    if (this._destroyed) return;
    const position = this._camera.entity.transform.worldPosition;
    const cell = this._detailCells.primeNearest(position.x, position.z);
    if (cell) {
      this._setCellDetails(cell, true);
      this._completeDetailCompaction(cell);
      this._updateDetailBatchVisibility(cell, position);
    }
    this._updateRockSurfaceGrassVisibility(position);
  }

  /**
   * Materializes every currently visible dense-detail Cell before the loading cover is removed.
   * A 3x3 prime guarantees that the complete 60m radial fade footprint exists even when the camera
   * starts on a 64m Cell corner; renderers outside the actual shader radius remain disabled.
   */
  warmupVisibleDetails(): void {
    if (this._destroyed) return;
    this.update(0);
    const position = this._camera.entity.transform.worldPosition;
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        this._detailCells.primeNearest(
          position.x + offsetX * SEED_WORLD_POPULATION_CELL_METRES,
          position.z + offsetZ * SEED_WORLD_POPULATION_CELL_METRES
        );
      }
    }
    for (const cell of this._detailCells.cells) {
      const active =
        this._populationFrustum.intersectsBox(cell.resource.detailBounds) &&
        (detailBoundsContainsCamera(cell.resource.detailBounds, position) ||
          seedWorldPopulationDetailBoundsIsActive(cell.resource.detailBounds, position));
      this._setCellDetails(cell, active, active);
      if (!active) continue;
      this._completeDetailCompaction(cell);
      this._updateDetailBatchVisibility(cell, position);
    }
  }

  /**
   * Applies the shared Debug LOD policy to complete tree and shrub renderers.
   * @param tuning LOD enablement and projected-distance multiplier.
   * @returns Nothing.
   * @throws {RangeError} When the distance multiplier is not finite and positive.
   */
  setLodTuning(tuning: TerrainLodRendererTuning): void {
    if (!Number.isFinite(tuning.distanceScale) || tuning.distanceScale <= 0) {
      throw new RangeError("Seed World Population LOD distance scale must be finite and positive");
    }
    this._lodTuning = { ...tuning };
    this._sparseRenderDirty = true;
  }

  /**
   * Returns the current complete-vegetation LOD policy.
   * @returns Detached LOD enablement and projected-distance multiplier.
   */
  getLodTuning(): TerrainLodRendererTuning {
    return { ...this._lodTuning };
  }

  /**
   * Number of currently resident 64m Population Cells across sparse and dense visibility owners.
   * @returns Current sparse plus dense resident Cell count.
   */
  get residentCellCount(): number {
    return this._sparseCells.size + this._detailCells.size;
  }

  /** Forces sparse batches to consume a newly published or invalidated shared Horizon. */
  invalidateTerrainOcclusionVisibility(): void {
    this._sparseRenderDirty = true;
  }

  /** Conservative far-vegetation counters recorded by the shared World Horizon. */
  get terrainOcclusionDiagnostics(): Readonly<SeedWorldTerrainOcclusionDiagnostics> {
    return this._terrainOcclusionCuller.diagnostics;
  }

  /**
   * Counts exact woody instances and expected dense Detail instances across resident Cells.
   * Dense expectations integrate the Worker-baked DensityField and do not depend on camera candidate selection.
   * @returns Resident exact-or-expected vegetation counts grouped by category.
   */
  get residentAcceptedCounts(): Readonly<Record<SeedWorldPopulationRuntimeCategory, number>> {
    const counts: Record<SeedWorldPopulationRuntimeCategory, number> = {
      tree: 0,
      shrub: 0,
      flower: 0,
      grass: 0
    };
    for (const cell of this._sparseCells.cells) {
      counts.tree += cell.data.instances.tree.length;
      counts.shrub += cell.data.instances.shrub.length;
    }
    for (const cell of this._detailCells.cells) {
      counts.flower += Math.round(cell.resource.expectedCounts.flower);
      counts.grass += Math.round(cell.resource.expectedCounts.grass);
    }
    return counts;
  }

  /**
   * Whole-tree submissions in source LOD0 through LOD3 order; omitted source LOD1 remains zero
   * A cross-fading accepted tree contributes to both submitted LODs.
   * @returns Current whole-tree submission counts by authored LOD.
   */
  get treeSubmittedLodCounts(): ProceduralTreeLodTuple<number> {
    return this._treeRenderer.lodCounts;
  }

  /**
   * Whole-shrub submissions in the authored Prefab LOD order.
   * A cross-fading accepted shrub contributes to both submitted LODs.
   * @returns Current whole-shrub submission counts by authored LOD.
   */
  get shrubSubmittedLodCounts(): readonly [number, number] {
    return this._shrubRenderer.lodCounts;
  }

  /**
   * Exact compacted Detail instances currently submitted by active Cell batches.
   * @returns Current visible grass and flower instance submission counts.
   */
  get detailSubmittedCounts(): Readonly<Record<DetailCategory, number>> {
    const counts: Record<DetailCategory, number> = { grass: 0, flower: 0 };
    for (const cell of this._detailCells.cells) {
      for (const [category, batches] of cell.resource.detailBatches) {
        for (const batch of batches) {
          if (batch.renderer.enabled) counts[category] += batch.instanceCount;
        }
      }
    }
    for (const batch of this._rockSurfaceGrassBatches) {
      if (batch.renderer.enabled) counts.grass += batch.instanceCount;
    }
    this._generatedRockGrass?.visitBatches((batch) => {
      if (batch.renderer.enabled) counts.grass += batch.instanceCount;
    });
    return counts;
  }

  /**
   * Exact compacted Detail instances retained by resident Cells, including currently culled batches.
   * @returns Resident grass and flower instances after one-time density rejection.
   */
  get detailCompactedCounts(): Readonly<Record<DetailCategory, number>> {
    const counts: Record<DetailCategory, number> = { grass: 0, flower: 0 };
    for (const cell of this._detailCells.cells) {
      for (const [category, batches] of cell.resource.detailBatches) {
        for (const batch of batches) counts[category] += batch.instanceCount;
      }
    }
    for (const batch of this._rockSurfaceGrassBatches) counts.grass += batch.instanceCount;
    this._generatedRockGrass?.visitBatches((batch) => {
      counts.grass += batch.instanceCount;
    });
    return counts;
  }

  /**
   * Candidate records evaluated once while materializing the currently resident compact Detail batches.
   * @returns Grass and flower candidate counts before CPU density rejection.
   */
  get detailCandidateCounts(): Readonly<Record<DetailCategory, number>> {
    const counts: Record<DetailCategory, number> = { grass: 0, flower: 0 };
    for (const cell of this._detailCells.cells) {
      for (const [category, batches] of cell.resource.detailBatches) {
        for (const batch of batches) counts[category] += batch.candidateCount;
      }
    }
    for (const batch of this._rockSurfaceGrassBatches) counts.grass += batch.candidateCount;
    counts.grass += this._generatedRockGrass?.candidateCount ?? 0;
    return counts;
  }

  /**
   * Number of currently resident GPU batches used by grass and flower instances.
   * @returns Current dense-detail renderer batch count.
   */
  get detailBatchCount(): number {
    let count = this._rockSurfaceGrassBatches.length;
    for (const cell of this._detailCells.cells) {
      for (const batches of cell.resource.detailBatches.values()) count += batches.length;
    }
    this._generatedRockGrass?.visitBatches(() => {
      count++;
    });
    return count;
  }

  /**
   * Number of compact Detail batches that issue one draw in the current view.
   * @returns Current visible Detail draw count.
   */
  get detailSubmittedBatchCount(): number {
    if (!this.details.isActiveInHierarchy) return 0;
    let rockSurfaceGrassBatchCount = 0;
    for (let batchIndex = 0; batchIndex < this._rockSurfaceGrassBatches.length; batchIndex++) {
      if (this._rockSurfaceGrassBatches[batchIndex]!.renderer.enabled) rockSurfaceGrassBatchCount++;
    }
    this._generatedRockGrass?.visitBatches((batch) => {
      if (batch.renderer.enabled) rockSurfaceGrassBatchCount++;
    });
    return this._submittedDetailBatchCount + rockSurfaceGrassBatchCount;
  }

  /**
   * Renderer submissions grouped by vegetation category.
   * Sparse cross-fades can submit one exact instance twice; dense counts are already compacted accepted instances.
   * @returns Current sparse LOD and dense GPU candidate submissions grouped by category.
   */
  get submittedCounts(): Readonly<Record<SeedWorldPopulationRuntimeCategory, number>> {
    const tree = this.treeSubmittedLodCounts.reduce((sum, count) => sum + count, 0);
    const shrub = this.shrubSubmittedLodCounts.reduce((sum, count) => sum + count, 0);
    const detail = this.detailSubmittedCounts;
    return { tree, shrub, flower: detail.flower, grass: detail.grass };
  }

  /**
   * Total sparse LOD records and compacted dense instances submitted across active Cell batches.
   * @returns Current renderer submission count.
   */
  get submittedInstanceCount(): number {
    return Object.values(this.submittedCounts).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Releases every Cell buffer, shared LOD batch, Renderer binding, and owner Entity.
   * @returns Nothing.
   */
  destroy(): void {
    this._grassRockAppearancePending.clear();
    this._rockAppearanceBatches.clear();
    this._grassRockAppearance = undefined;
    this._grassRockPlacements = [];
    this.endTreeDissolvePreview();
    if (this._destroyed) return;
    this._destroyed = true;
    this._groundCoverExclusions?.clear();
    this._groundCoverBase = undefined;
    const playback = this._treePresentation;
    this._treePresentation = undefined;
    playback?.controller.abort(new DOMException("Population destroyed", "AbortError"));
    for (const presentation of playback?.presentations ?? []) presentation.dispose();
    for (const entrance of this._detailAuthoringEntrances) {
      entrance.finish(new Error("Seed World Detail runtime was destroyed during entrance playback"));
    }
    this._detailCells.destroy();
    this._sparseCells.destroy();
    this._shrubRenderer.destroy();
    this._treeRenderer.destroy();
    this._generatedRockGrass?.destroy();
    this._releaseRockSurfaceGrass();
    this._detailTransformPool.clear();
    for (const material of this._detailMaterials.values()) material.destroy();
    this._detailMaterials.clear();
    this.trees.destroy();
    this.details.destroy();
  }

  private _compileRockSurfaceTrees(
    candidates: readonly SeedWorldPopulationInstance[]
  ): SeedWorldRockSurfaceTreeCompilation {
    const rockSource = this._sourceLibrary.largeRockSurfaceFamilies.grass?.variants.find((candidate) =>
      candidate.id.includes("/rock-clif-1/")
    );
    if (!rockSource?.lods[0]) throw new Error('Seed World rock-surface trees require "rock-clif-1" LOD0');
    return compileSeedWorldRockSurfaceTrees(
      rockSource,
      this._rockSurfaceGrassRocks,
      candidates,
      this._fields,
      this._rockSurfaceGrassStyle
    );
  }

  private _rebuildRockSurfaceTrees(): void {
    const candidates = new Map(this._rockSurfaceTreeCandidates.map((instance) => [instance.id, instance] as const));
    for (const instance of this._populationLayout.treeInstances) {
      if (instance.category === "tree") candidates.set(instance.id, instance);
    }
    const compilation = this._compileRockSurfaceTrees([...candidates.values()]);
    const nextGroundings = new Map(
      compilation.placements.map(
        (placement) => [placement.producerInstance.id, createRockSurfaceTreeGrounding(placement)] as const
      )
    );
    const previousCompilation = this._rockSurfaceTreeCompilation;
    const previousGroundings = new Map(this._groundedSparseInstanceOverrides);
    // Grounding is derived geometry, never a second source of live instances.
    // Retain grounding for absent ids so undo can restore their original surface.
    const nextSparseInstances = this._populationLayout.treeInstances;
    const previousSparseInstances = nextSparseInstances;
    const dirtyCellIds = new Set(
      [...previousGroundings.values(), ...compilation.placements].map(
        ({ producerInstance }) => producerInstance.sourceCellId
      )
    );
    try {
      this._groundedSparseInstanceOverrides.clear();
      for (const [id, grounding] of nextGroundings) this._groundedSparseInstanceOverrides.set(id, grounding);
      this._sparseCells.replacePrecompiledInstances(nextSparseInstances, dirtyCellIds);
      this._rockSurfaceTreeCompilation = compilation;
      this._sparseRenderDirty = true;
    } catch (error) {
      this._groundedSparseInstanceOverrides.clear();
      for (const [id, grounding] of previousGroundings) this._groundedSparseInstanceOverrides.set(id, grounding);
      this._sparseCells.replacePrecompiledInstances(previousSparseInstances, dirtyCellIds);
      this._rockSurfaceTreeCompilation = previousCompilation;
      throw error;
    }
  }

  private _rebuildRockSurfaceGrass(): void {
    this._releaseRockSurfaceGrass();
    this._rockSurfaceGrassCompiler = undefined;
    this._rockSurfaceGrassCompilationWindowPatchX = Number.NaN;
    this._rockSurfaceGrassCompilationWindowPatchZ = Number.NaN;
    this._rockSurfaceGrassVisibilityDirty = this._rockSurfaceGrassRocks.length > 0 && this._grassDensityMultiplier > 0;
  }

  private _prepareRockSurfaceGrassWindow(cameraPosition: Vector3): boolean {
    if (this._rockSurfaceGrassRocks.length === 0 || this._grassDensityMultiplier === 0) return true;
    let compiler = this._rockSurfaceGrassCompiler;
    if (!compiler) {
      compiler = this._createRockSurfaceGrassCompiler();
      this._rockSurfaceGrassCompiler = compiler;
    }
    const terminalDistance = seedWorldPopulationDetailFadeTerminalDistance();
    const patchX = Math.floor(cameraPosition.x / SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES);
    const patchZ = Math.floor(cameraPosition.z / SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES);
    const finiteWindow = Number.isFinite(terminalDistance);
    const minimumPatchX = finiteWindow
      ? Math.floor(patchX - terminalDistance / SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES)
      : compiler.minimumPatchX;
    const minimumPatchZ = finiteWindow
      ? Math.floor(patchZ - terminalDistance / SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES)
      : compiler.minimumPatchZ;
    const maximumPatchX = finiteWindow
      ? Math.floor(patchX + 1 + terminalDistance / SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES)
      : compiler.maximumPatchX;
    const maximumPatchZ = finiteWindow
      ? Math.floor(patchZ + 1 + terminalDistance / SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES)
      : compiler.maximumPatchZ;
    if (
      patchX !== this._rockSurfaceGrassCompilationWindowPatchX ||
      patchZ !== this._rockSurfaceGrassCompilationWindowPatchZ
    ) {
      this._rockSurfaceGrassCompilationWindowPatchX = patchX;
      this._rockSurfaceGrassCompilationWindowPatchZ = patchZ;
      this._releaseRockSurfaceGrassOutsideWindow(minimumPatchX, minimumPatchZ, maximumPatchX, maximumPatchZ);
    }
    const deadline = performance.now() + SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.compactionTimeBudgetMilliseconds;
    let compiledPatchCount = 0;
    while (compiledPatchCount < SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.publicationBatchBudgetPerUpdate) {
      let nearestPatch: SeedWorldRockSurfaceGrassPatch | undefined;
      let nearestDistanceSquared = Number.POSITIVE_INFINITY;
      for (let candidatePatchZ = minimumPatchZ; candidatePatchZ <= maximumPatchZ; candidatePatchZ++) {
        for (let candidatePatchX = minimumPatchX; candidatePatchX <= maximumPatchX; candidatePatchX++) {
          const candidate = compiler.getPatch(candidatePatchX, candidatePatchZ);
          if (!candidate || candidate.compiled) continue;
          const offsetX = Math.max(
            candidatePatchX * SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES - cameraPosition.x,
            0,
            cameraPosition.x - (candidatePatchX + 1) * SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES
          );
          const offsetZ = Math.max(
            candidatePatchZ * SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES - cameraPosition.z,
            0,
            cameraPosition.z - (candidatePatchZ + 1) * SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES
          );
          const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
          if (distanceSquared >= nearestDistanceSquared) continue;
          nearestPatch = candidate;
          nearestDistanceSquared = distanceSquared;
        }
      }
      if (!nearestPatch) return true;
      const patch = compiler.compilePatch(nearestPatch.patchX, nearestPatch.patchZ, this._detailTransformPool)!;
      let batch: DetailPopulationBatch | undefined;
      if (patch.instanceCount > 0) {
        try {
          batch = this._acquireRockSurfaceGrassBatch(patch);
        } catch (error) {
          compiler.releasePatch(patch, this._detailTransformPool);
          throw error;
        }
        this._rockSurfaceGrassBatchByPatch.set(patch.key, batch);
        this._rockSurfaceGrassBatches.push(batch);
      }
      this._rockSurfaceGrassPatches.push(patch);
      this._rockSurfaceGrassCompiledInstanceCount += patch.instanceCount;
      compiledPatchCount++;
      if (performance.now() >= deadline) break;
    }
    return false;
  }

  private _acquireRockSurfaceGrassBatch(patch: SeedWorldRockSurfaceGrassPatch): DetailPopulationBatch {
    const requiredBytes = patch.instanceCount * DETAIL_TRANSFORM_STRIDE_BYTES;
    let bestIndex = -1;
    let bestBytes = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this._rockSurfaceGrassBatchPool.length; index++) {
      const byteLength = this._rockSurfaceGrassBatchPool[index]!.resources.instanceBuffer.byteLength;
      if (byteLength < requiredBytes || byteLength >= bestBytes) continue;
      bestIndex = index;
      bestBytes = byteLength;
    }
    if (bestIndex >= 0) {
      const pool = this._rockSurfaceGrassBatchPool;
      const batch = pool[bestIndex]!;
      const lastIndex = pool.length - 1;
      pool[bestIndex] = pool[lastIndex]!;
      pool.length = lastIndex;
      try {
        reuseRockSurfaceGrassBatch(batch, patch, this._grassColorField, this._grassRoadColor);
        return batch;
      } catch (error) {
        disposeDetailBatch(batch);
        throw error;
      }
    }
    const grassSource = this._rockSurfaceGrassSourceForRuntime();
    return createRockSurfaceGrassBatch(
      this._engine,
      this._rockSurfaceGrassRoot,
      grassSource,
      this._detailMaterial(grassSource.lods[0].renderer.material),
      patch,
      this._grassColorField,
      this._grassRoadColor
    );
  }

  private _retireRockSurfaceGrassBatch(batch: DetailPopulationBatch): void {
    this._rockAppearanceBatches.delete(batch);
    this._grassRockAppearancePending.delete(batch);
    batch.renderer.shaderData.disableMacro("RENDERER_GRASS_ROCK_APPEARANCE");
    batch.renderer.enabled = false;
    batch.resources.mesh.instanceCount = 0;
    batch.transforms = EMPTY_DETAIL_TRANSFORMS;
    batch.instanceCount = 0;
    batch.candidateCount = 0;
    batch.rockSurfacePatch = undefined;
    if (this._rockSurfaceGrassBatchPool.length < ROCK_SURFACE_GRASS_BATCH_POOL_CAPACITY) {
      this._rockSurfaceGrassBatchPool.push(batch);
    } else {
      disposeDetailBatch(batch);
    }
  }

  private _createRockSurfaceGrassCompiler(): SeedWorldRockSurfaceGrassCompiler {
    const rockSource = this._sourceLibrary.largeRockSurfaceFamilies.grass?.variants.find((candidate) =>
      candidate.id.includes("/rock-clif-1/")
    );
    if (!rockSource?.lods[0]) throw new Error('Seed World rock-surface grass requires "rock-clif-1" LOD0');
    const grassSource = this._rockSurfaceGrassSourceForRuntime();
    const density = createRockSurfaceGrassDensity(
      this._populationLayout,
      this._fields,
      seedWorldTerrestrialGrassDensityMultiplier(this._populationLayout, this._grassDensityPerSquareMetre) *
        this._grassDensityMultiplier
    );
    return createSeedWorldRockSurfaceGrassCompiler(
      rockSource,
      grassSource,
      this._rockSurfaceGrassRocks,
      this._grassScaleRange,
      density,
      this._rockSurfaceGrassStyle
    );
  }

  private _updateRockSurfaceGrassVisibility(cameraPosition: Vector3): void {
    const windowReady = this._prepareRockSurfaceGrassWindow(cameraPosition);
    const hierarchyActive = this.details.isActiveInHierarchy;
    for (let batchIndex = 0; batchIndex < this._rockSurfaceGrassBatches.length; batchIndex++) {
      const batch = this._rockSurfaceGrassBatches[batchIndex]!;
      const patch = batch.rockSurfacePatch!;
      batch.renderer.enabled =
        hierarchyActive &&
        rockSurfaceGrassPatchIsResident(patch, cameraPosition) &&
        this._populationFrustum.intersectsBox(batch.bounds) &&
        (detailBoundsContainsCamera(batch.bounds, cameraPosition) ||
          seedWorldPopulationDetailBoundsIsActive(batch.bounds, cameraPosition));
    }
    this._rockSurfaceGrassVisibilityDirty = !windowReady;
  }

  private _releaseRockSurfaceGrassOutsideWindow(
    minimumPatchX: number,
    minimumPatchZ: number,
    maximumPatchX: number,
    maximumPatchZ: number
  ): void {
    const compiler = this._rockSurfaceGrassCompiler!;
    const patches = this._rockSurfaceGrassPatches;
    for (let patchIndex = patches.length - 1; patchIndex >= 0; patchIndex--) {
      const patch = patches[patchIndex]!;
      if (
        patch.patchX >= minimumPatchX &&
        patch.patchX <= maximumPatchX &&
        patch.patchZ >= minimumPatchZ &&
        patch.patchZ <= maximumPatchZ
      ) {
        continue;
      }
      const batch = this._rockSurfaceGrassBatchByPatch.get(patch.key);
      if (batch) {
        this._retireRockSurfaceGrassBatch(batch);
        this._rockSurfaceGrassBatchByPatch.delete(patch.key);
        removeUnordered(this._rockSurfaceGrassBatches, batch);
      }
      this._rockSurfaceGrassCompiledInstanceCount -= patch.instanceCount;
      compiler.releasePatch(patch, this._detailTransformPool);
      const lastIndex = patches.length - 1;
      patches[patchIndex] = patches[lastIndex]!;
      patches.length = lastIndex;
    }
  }

  private _releaseRockSurfaceGrass(): void {
    for (let batchIndex = 0; batchIndex < this._rockSurfaceGrassBatches.length; batchIndex++) {
      disposeDetailBatch(this._rockSurfaceGrassBatches[batchIndex]!);
    }
    for (let batchIndex = 0; batchIndex < this._rockSurfaceGrassBatchPool.length; batchIndex++) {
      disposeDetailBatch(this._rockSurfaceGrassBatchPool[batchIndex]!);
    }
    if (this._rockSurfaceGrassCompiler) {
      for (let patchIndex = 0; patchIndex < this._rockSurfaceGrassPatches.length; patchIndex++) {
        this._rockSurfaceGrassCompiler.releasePatch(
          this._rockSurfaceGrassPatches[patchIndex]!,
          this._detailTransformPool
        );
      }
      this._rockSurfaceGrassCompiler.destroy(this._detailTransformPool);
    }
    this._rockSurfaceGrassBatchByPatch.clear();
    this._rockSurfaceGrassPatches.length = 0;
    this._rockSurfaceGrassBatches.length = 0;
    this._rockSurfaceGrassBatchPool.length = 0;
    this._rockSurfaceGrassCompiledInstanceCount = 0;
    this._rockSurfaceGrassVisibilityDirty = false;
  }

  private _rockSurfaceGrassSourceForRuntime(): AtomicAssemblySource {
    return (this._rockSurfaceGrassSource ??= detailSourceForPrototype(this._sourceLibrary.grassFamily, "cluster"));
  }

  private _createSparseCellResource(cell: SeedWorldPopulationRuntimeCell): SparsePopulationCellResource {
    const treeStaticData = this._treeRenderer.createCellStaticData(cell.instances.tree);
    const shrubStaticData = this._shrubRenderer.createCellStaticData(cell.instances.shrub);
    return {
      ...treeStaticData,
      ...shrubStaticData,
      treeLodInstances: cell.instances.tree.map((instance) =>
        this._treeRenderer.createLodInstance(instance.producerInstance.assetRecipeId)
      ),
      shrubLodInstances: cell.instances.shrub.map(() => this._shrubRenderer.createLodInstance()),
      treeSubCells: createSparsePopulationSubCells(cell, treeStaticData.treeWorldBoundsData, "tree"),
      shrubSubCells: createSparsePopulationSubCells(cell, shrubStaticData.shrubWorldBoundsData, "shrub")
    };
  }

  private _refreshSparseCellResourceGrounding(
    resource: SparsePopulationCellResource,
    cell: SeedWorldPopulationRuntimeCell
  ): void {
    if (
      resource.treeLodInstances.length !== cell.instances.tree.length ||
      resource.shrubLodInstances.length !== cell.instances.shrub.length
    ) {
      throw new Error("Seed World sparse grounding refresh cannot change resident instance identities");
    }
    this._treeRenderer.refreshCellStaticData(resource, cell.instances.tree);
    this._shrubRenderer.refreshCellStaticData(resource, cell.instances.shrub);
    refreshSparsePopulationSubCellWorldBounds(resource.treeSubCells, resource.treeWorldBoundsData);
    refreshSparsePopulationSubCellWorldBounds(resource.shrubSubCells, resource.shrubWorldBoundsData);
  }

  private _createDetailCellResource(
    cell: SeedWorldPopulationRuntimeCell,
    fields = this._fields,
    layout = this._populationLayout,
    hidden = false
  ): DetailPopulationCellResource {
    const root = this.details.createChild(`Population ${cell.id}`);
    root.isActive = !hidden;
    return {
      root,
      detailBatches: new Map(),
      expectedCounts: expectedDetailCounts(layout.detailDensityFields, cell, fields, (field) =>
        this._detailDensityMultiplier(field)
      ),
      detailBounds: detailAreaBounds(
        cell.minimumWorldX,
        cell.minimumWorldZ,
        cell.maximumWorldX,
        cell.maximumWorldZ,
        fields,
        this._maximumDetailBoundsRadius
      ),
      detailsLoaded: false,
      detailsActive: false
    };
  }

  private _detailMaterial(sourceMaterial: Material): Material {
    const cached = this._detailMaterials.get(sourceMaterial);
    if (cached) return cached;
    const material = sourceMaterial.clone();
    if (this._rockGroundSettings) bindRockGrassGroundMaterial(this._engine, material, this._rockGroundSettings);
    const fade = SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.materialFade;
    material.shaderData.setFloat(DETAIL_FADE_DISTANCE, fade.maximumDistanceMetres);
    this._detailMaterials.set(sourceMaterial, material);
    return material;
  }

  private _setCellDetails(
    cell: SeedWorldResidentPopulationCell<DetailPopulationCellResource>,
    active: boolean,
    prepare = active
  ): void {
    if (prepare && !cell.resource.detailsLoaded && !cell.resource.compactionTask) {
      cell.resource.compactionTask = this._createDetailCompactionTask();
    } else if (!prepare && !active && cell.resource.compactionTask) {
      this._cancelDetailCompaction(cell.resource);
    }
    if (active === cell.resource.detailsActive) return;
    if (!active) {
      for (const batches of cell.resource.detailBatches.values()) {
        for (const batch of batches) this._setDetailBatchEnabled(batch, false);
      }
      cell.resource.detailsActive = false;
      return;
    }

    for (const batches of cell.resource.detailBatches.values()) {
      for (const batch of batches) this._setDetailBatchEnabled(batch, true);
    }
    cell.resource.detailsActive = true;
  }

  private _createDetailAuthoringEntrance(
    previousFields: readonly SeedWorldDetailDensityField[],
    signal: AbortSignal
  ): DetailAuthoringEntrance {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const completion = new Promise<void>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    // Synchronous publication can fail before its caller receives the completion promise.
    void completion.catch(() => undefined);
    const abort = (): void =>
      entrance.finish(signal.reason ?? new DOMException("Detail entrance aborted", "AbortError"));
    const entrance: DetailAuthoringEntrance = {
      previousFields,
      pendingCells: new Set(),
      batches: new Set(),
      completion,
      settled: false,
      finish: (error?: unknown): void => {
        if (entrance.settled) return;
        entrance.settled = true;
        signal.removeEventListener("abort", abort);
        for (const batch of entrance.batches) this._settleDetailBatchEntrance(batch);
        entrance.pendingCells.clear();
        this._detailAuthoringEntrances.delete(entrance);
        error === undefined ? resolve() : reject(error);
      }
    };
    this._detailAuthoringEntrances.add(entrance);
    signal.addEventListener("abort", abort, { once: true });
    return entrance;
  }

  private _settleCompletedDetailEntrance(entrance: DetailAuthoringEntrance): void {
    if (entrance.pendingCells.size === 0 && entrance.batches.size === 0) entrance.finish();
  }

  private _settleDetailBatchEntrance(batch: DetailPopulationBatch): void {
    const entrance = batch.entrance;
    if (!entrance) return;
    batch.renderer.shaderData.disableMacro(DETAIL_INSTANCE_REVEAL_MACRO);
    settleRendererAssetEntranceEffect(batch.renderer);
    batch.entrance = undefined;
    entrance.owner.batches.delete(batch);
  }

  private _advanceDetailEntrances(): void {
    for (const entrance of this._detailAuthoringEntrances) {
      if (!this.details.isActiveInHierarchy) {
        entrance.finish();
        continue;
      }
      for (const batch of entrance.batches) {
        const startedAt = batch.entrance?.startedAtSeconds;
        if (startedAt === undefined) continue;
        if (batch.destroyed) {
          this._settleDetailBatchEntrance(batch);
          continue;
        }
        const progress = Math.min(
          1,
          ((this._elapsedSeconds - startedAt) * 1_000) / ASSET_ASSEMBLY_ENTRANCE_DURATION_MS
        );
        if (progress >= 1) this._settleDetailBatchEntrance(batch);
        else setRendererAssetEntranceProgressValues(batch.renderer, progress, batch.bounds.min.y, batch.bounds.max.y);
      }
      this._settleCompletedDetailEntrance(entrance);
    }
  }

  private _prepareDetailBatchEntrance(
    batch: DetailPopulationBatch,
    field: SeedWorldDetailDensityField,
    task: DetailCellCompactionTask
  ): void {
    const entrance = task.entrance;
    if (!entrance || entrance.settled) return;
    const records = createSeedWorldDetailEntranceRecords({
      transforms: batch.transforms,
      instanceCount: batch.instanceCount,
      recordFloats: DETAIL_TRANSFORM_FLOATS,
      localMinimumY: batch.localBounds.min.y,
      localMaximumY: batch.localBounds.max.y,
      worldSizeMetres: this._fields.sizeMetres,
      previousField: entrance.previousFields.find((previous) => previous.prototypeFamily === field.prototypeFamily),
      field,
      previousPositions: task.previousPositions?.get(field.prototypeFamily)
    });
    if (!records) return;
    const buffer = new Buffer(this._engine, BufferBindFlag.VertexBuffer, records.byteLength, BufferUsage.Static);
    batch.entranceBuffer = buffer;
    buffer.setData(records);
    const mesh = batch.resources.mesh;
    const binding = mesh.vertexBufferBindings.length;
    mesh.setVertexBufferBinding(buffer, 3 * Float32Array.BYTES_PER_ELEMENT, binding);
    mesh.setVertexElements([
      ...mesh.vertexElements,
      new VertexElement("GENERATION_REVEAL", 0, VertexElementFormat.Vector3, binding, 1)
    ]);
    batch.renderer.shaderData.enableMacro(DETAIL_INSTANCE_REVEAL_MACRO);
    setRendererAssetEntranceProgressValues(batch.renderer, 0, batch.bounds.min.y, batch.bounds.max.y);
    batch.entrance = { owner: entrance };
    entrance.batches.add(batch);
  }

  private _createDetailCompactionTask(
    layout = this._populationLayout,
    dirtyPatches?: ReadonlySet<number>
  ): DetailCellCompactionTask {
    return {
      fields: layout.detailDensityFields,
      dirtyPatches,
      completed: [],
      fieldIndex: 0,
      ready: false
    };
  }

  private _advanceDetailCompactions(cameraPosition: Vector3): void {
    let nearestCell: SeedWorldResidentPopulationCell<DetailPopulationCellResource> | undefined;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    const cells = this._detailCells.cells;
    for (let priorityIndex = 0; priorityIndex < 2; priorityIndex++) {
      const activePriority = priorityIndex === 0;
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
        const cell = cells[cellIndex]!;
        if (cell.resource.detailsActive !== activePriority || !cell.resource.compactionTask) continue;
        const distanceX = Math.max(
          cell.data.minimumWorldX - cameraPosition.x,
          0,
          cameraPosition.x - cell.data.maximumWorldX
        );
        const distanceZ = Math.max(
          cell.data.minimumWorldZ - cameraPosition.z,
          0,
          cameraPosition.z - cell.data.maximumWorldZ
        );
        const distanceSquared = distanceX * distanceX + distanceZ * distanceZ;
        if (distanceSquared < nearestDistanceSquared) {
          nearestCell = cell;
          nearestDistanceSquared = distanceSquared;
        }
      }
      if (nearestCell) break;
    }
    if (!nearestCell) return;

    const profile = SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail;
    const task = nearestCell.resource.compactionTask!;
    // Ground grass uses the time slice; retain the count limit for other Detail workloads.
    let remainingCandidates = task.fields.every((field) => field.category === "grass")
      ? Number.POSITIVE_INFINITY
      : profile.compactionCandidateBudgetPerUpdate;
    const frame = this._engine?.time?.frameCount;
    if (frame === undefined || this._detailBudgetFrame !== frame) {
      this._detailBudgetFrame = frame ?? -1;
      this._detailBudgetDeadline = performance.now() + profile.compactionTimeBudgetMilliseconds;
    }
    const deadline = this._detailBudgetDeadline;
    try {
      while (remainingCandidates > 0 && performance.now() < deadline && !task.ready) {
        const advanced = this._advanceDetailCompactionTask(
          nearestCell,
          Math.min(DETAIL_COMPACTION_CHUNK_CANDIDATES, remainingCandidates)
        );
        if (advanced === 0 && !task.ready) break;
        remainingCandidates -= advanced;
      }
      if (task.ready && performance.now() < deadline && this._advanceDetailPublication(nearestCell, deadline)) {
        this._updateDetailBatchVisibility(nearestCell, cameraPosition);
      }
    } catch (error) {
      task.entrance?.finish(error);
      this._cancelDetailCompaction(nearestCell.resource);
      console.error(`[seed-world-population] Detail Cell ${nearestCell.data.id} publication failed`, error);
    }
  }

  private _advanceDetailCompactionTask(
    cell: SeedWorldResidentPopulationCell<DetailPopulationCellResource>,
    maximumCandidates: number,
    fields = this._fields,
    layout = this._populationLayout,
    waterContact = this._grassContactIsWater,
    coverage = this._grassSurfaceCoverage
  ): number {
    const task = cell.resource.compactionTask;
    if (!task || task.ready) return 0;
    let remaining = maximumCandidates;
    let advanced = 0;
    while (remaining > 0 && !task.ready) {
      if (!task.current) {
        if (task.fieldIndex >= task.fields.length) {
          task.ready = true;
          break;
        }
        const field = task.fields[task.fieldIndex]!;
        if (
          field.maximumDensityPerSquareMetre <= 0 ||
          !densityFieldAreaHasContent(
            field,
            cell.data.minimumWorldX,
            cell.data.minimumWorldZ,
            cell.data.maximumWorldX,
            cell.data.maximumWorldZ,
            fields
          )
        ) {
          task.fieldIndex++;
          continue;
        }
        const profile = layout.detailSpeciesProfiles.find((candidate) => candidate.key === field.prototypeFamily);
        if (!profile) throw new RangeError(`Seed World Detail profile '${field.prototypeFamily}' is unavailable`);
        const category: DetailCategory = field.category;
        const authoredScaleRange = getSeedWorldAssetPlacementProfile(category).roleScale.field!;
        task.current = createDetailFieldCompactionState(
          field,
          cell.data,
          fields,
          authoredScaleRange,
          category === "grass" ? this._grassScaleRange : authoredScaleRange,
          !this._grassHeightOverride,
          this._detailDensityMultiplier(field),
          category === "grass" && profile.habitat === "terrestrial",
          this._detailTransformPool,
          coverage,
          task.dirtyPatches
        );
      }

      const count = advanceDetailFieldCompaction(
        task.current,
        remaining,
        this._detailSurfaceWeightsScratch,
        this._detailTerrainNormalScratch,
        waterContact,
        coverage
      );
      advanced += count;
      remaining -= count;
      if (task.current.nextOrdinal === task.current.candidateCount) {
        task.completed.push({ field: task.current.field, patches: finishDetailFieldCompaction(task.current) });
        task.current = undefined;
        task.fieldIndex++;
      }
    }
    if (!task.current && task.fieldIndex >= task.fields.length) task.ready = true;
    return advanced;
  }

  private _completeDetailCompaction(cell: SeedWorldResidentPopulationCell<DetailPopulationCellResource>): void {
    if (!cell.resource.compactionTask && !cell.resource.detailsLoaded) {
      cell.resource.compactionTask = this._createDetailCompactionTask();
    }
    const task = cell.resource.compactionTask;
    if (!task) return;
    try {
      while (!task.ready) this._advanceDetailCompactionTask(cell, Number.POSITIVE_INFINITY);
      while (!this._advanceDetailPublication(cell, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)) {}
    } catch (error) {
      task.entrance?.finish(error);
      this._cancelDetailCompaction(cell.resource);
      throw error;
    }
  }

  private _completeNearestActiveDetailCompaction(): void {
    const cameraPosition = this._camera.entity.transform.worldPosition;
    let nearestCell: SeedWorldResidentPopulationCell<DetailPopulationCellResource> | undefined;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const cell of this._detailCells.cells) {
      if (!cell.resource.detailsActive || !cell.resource.compactionTask) continue;
      const distanceX = Math.max(
        cell.data.minimumWorldX - cameraPosition.x,
        0,
        cameraPosition.x - cell.data.maximumWorldX
      );
      const distanceZ = Math.max(
        cell.data.minimumWorldZ - cameraPosition.z,
        0,
        cameraPosition.z - cell.data.maximumWorldZ
      );
      const distanceSquared = distanceX * distanceX + distanceZ * distanceZ;
      if (distanceSquared >= nearestDistanceSquared) continue;
      nearestCell = cell;
      nearestDistanceSquared = distanceSquared;
    }
    if (!nearestCell) return;
    this._completeDetailCompaction(nearestCell);
    this._updateDetailBatchVisibility(nearestCell, cameraPosition);
  }

  private _prepareDetailPublicationWorkItem(
    work: DetailCompactionPublicationWorkItem,
    fields: SeedWorldFields,
    deadline: number
  ): boolean {
    if (
      work.prepared &&
      work.rockAppearanceSource === this._grassRockAppearance &&
      work.rockAppearanceMaterial === this._grassTerrainMaterial
    )
      return true;
    const { patch, field } = work;
    while (performance.now() < deadline) {
      if (work.copySources && work.sourceIndex < work.copySources.length) {
        if (!patch.transforms.length)
          patch.transforms = this._detailTransformPool.acquire(
            patch.instanceCount,
            DETAIL_TRANSFORM_POOL_REUSE_CAPACITY_RATIO
          );
        const source = work.copySources[work.sourceIndex];
        const end = Math.min(source.instanceCount * DETAIL_TRANSFORM_FLOATS, work.sourceOffset + 4096);
        patch.transforms.set(source.transforms.subarray(work.sourceOffset, end), work.targetOffset);
        work.targetOffset += end - work.sourceOffset;
        work.sourceOffset = end;
        if (end === source.instanceCount * DETAIL_TRANSFORM_FLOATS) {
          this._detailTransformPool.release(source.transforms);
          work.sourceIndex++;
          work.sourceOffset = 0;
        }
        continue;
      }
      if (work.shuffle && work.shuffle.index > 0) {
        advanceGrassDensityShuffle(patch.transforms, DETAIL_TRANSFORM_FLOATS, work.shuffle, 64);
        continue;
      }
      if (!work.bounds) {
        work.bounds = new BoundingBox(new Vector3(), new Vector3());
        work.owners = field.ownership ? new Array(patch.instanceCount) : undefined;
      }
      if (work.preparedInstances < patch.instanceCount) {
        const end = Math.min(patch.instanceCount, work.preparedInstances + 64);
        const source = detailSourceForPrototype(this._detailFamily(field.category), field.assetProfileKey);
        updateCompactedDetailBounds(
          work.bounds,
          patch.transforms,
          detailSourceLocalBounds(source),
          patch.instanceCount,
          work.preparedInstances,
          end
        );
        if (work.owners)
          for (let index = work.preparedInstances; index < end; index++) {
            work.owners[index] = sampleSeedWorldDetailOwner(
              field,
              fields.sizeMetres,
              patch.transforms[index * DETAIL_TRANSFORM_FLOATS] - seedWorldOriginX(fields) - fields.sizeMetres / 2,
              patch.transforms[index * DETAIL_TRANSFORM_FLOATS + 2] - seedWorldOriginZ(fields) - fields.sizeMetres / 2
            );
          }
        work.preparedInstances = end;
        continue;
      }
      if (field.category === "grass" && this._grassRockAppearance && this._grassTerrainMaterial) {
        const source = detailSourceForPrototype(this._detailFamily(field.category), field.assetProfileKey);
        const { min, max } = detailSourceLocalBounds(source);
        const radius = Math.hypot(
          Math.max(Math.abs(min.x), Math.abs(max.x)),
          Math.max(Math.abs(min.y), Math.abs(max.y)),
          Math.max(Math.abs(min.z), Math.abs(max.z))
        );
        if (
          !work.rockAppearanceTask ||
          work.rockAppearanceSource !== this._grassRockAppearance ||
          work.rockAppearanceMaterial !== this._grassTerrainMaterial
        ) {
          work.rockAppearanceTask = this._grassRockAppearance.compileIncrementally(
            patch.transforms,
            patch.instanceCount,
            radius,
            fields
          );
          work.rockAppearanceSource = this._grassRockAppearance;
          work.rockAppearanceMaterial = this._grassTerrainMaterial;
        }
        const step = work.rockAppearanceTask.next();
        if (!step.done) continue;
        work.rockAppearanceRecords = step.value;
        work.rockAppearanceTask = undefined;
      } else {
        work.rockAppearanceRecords = undefined;
        work.rockAppearanceTask = undefined;
      }
      work.rockAppearanceSource = this._grassRockAppearance;
      work.rockAppearanceMaterial = this._grassTerrainMaterial;
      work.prepared = true;
      return true;
    }
    return false;
  }

  private _publishDetailPatch(
    cell: SeedWorldResidentPopulationCell<DetailPopulationCellResource>,
    work: DetailCompactionPublicationWorkItem,
    fields: SeedWorldFields
  ): void {
    const { field, patch } = work,
      category = field.category;
    const batches = [...(cell.resource.detailBatches.get(category) ?? [])];
    const index = batches.findIndex(
      (batch) =>
        batch.detailPatch?.x === patch.patchX &&
        batch.detailPatch.z === patch.patchZ &&
        batch.detailPatch.assetProfileKey === field.assetProfileKey
    );
    const previous = batches[index];
    const scale =
      category === "grass" && (!field.heightRangeMetres || this._grassHeightOverride)
        ? this._grassScaleRange
        : undefined;
    // Rock-contact attributes follow instance order. Keep their existing atomic replacement path;
    // ordinary ground patches can reuse the single instance buffer without rebuilding the cell.
    if (
      previous &&
      !previous.destroyed &&
      !previous.entrance &&
      !previous.entranceBuffer &&
      !previous.rockAppearanceBuffer &&
      !work.rockAppearanceRecords
    ) {
      reuseCompactedDetailPopulationBatch(this._engine, previous, work, scale, this._detailTransformPool);
    } else {
      const source = detailSourceForPrototype(this._detailFamily(category), field.assetProfileKey);
      const batch = createCompactedDetailPopulationBatch(
        this._engine,
        cell.resource.root,
        source,
        this._detailMaterial(source.lods[0].renderer.material),
        field,
        cell.data,
        fields,
        patch,
        category === "grass" ? this._grassColorField : undefined,
        category === "grass" ? this._grassRoadColor : undefined,
        scale,
        work
      );
      if (!batch) throw new Error("Prepared Detail patch lost its density source");
      try {
        if (category === "grass") {
          this._bindGrassRockAppearance(batch, fields, work);
          batch.renderer.shaderData.enableMacro("RENDERER_GRASS_DENSITY_LOD");
          if (this._grassTerrainMaterial) bindSeedWorldGrassTerrainSurface(batch.renderer, this._grassTerrainMaterial);
        }
      } catch (error) {
        // The publication work still owns transforms until the replacement becomes live.
        disposeDetailBatch(batch);
        throw error;
      }
      batch.renderer.enabled = false;
      if (previous) {
        this._setDetailBatchEnabled(previous, false);
        disposeDetailBatch(previous, this._detailTransformPool);
        batches[index] = batch;
      } else batches.push(batch);
      cell.resource.detailBatches.set(category, batches);
    }
  }

  private _advanceDetailPublication(
    cell: SeedWorldResidentPopulationCell<DetailPopulationCellResource>,
    deadline: number,
    maximumBatchCreations: number = SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.publicationBatchBudgetPerUpdate,
    fields = this._fields
  ): boolean {
    const task = cell.resource.compactionTask;
    if (!task?.ready) return false;
    if (!task.publication) {
      task.publication = {
        workItems: createDetailCompactionPublicationWorkItems(task.completed, this._detailTransformPool),
        grassBatches: [],
        flowerBatches: [],
        workIndex: 0
      };
      task.completed.length = 0;
    }
    const publication = task.publication;
    let batchCreations = 0;
    while (publication.workIndex < publication.workItems.length) {
      const work = publication.workItems[publication.workIndex]!;
      if (
        batchCreations >= maximumBatchCreations ||
        performance.now() >= deadline ||
        !this._prepareDetailPublicationWorkItem(work, fields, deadline) ||
        performance.now() >= deadline
      ) {
        return false;
      }
      const field = work.field;
      const category: DetailCategory = field.category;
      const source = detailSourceForPrototype(this._detailFamily(category), field.assetProfileKey);
      if (task.dirtyPatches) {
        this._publishDetailPatch(cell, work, fields);
        publication.workIndex++;
        batchCreations++;
        // Ownership transferred to the live cell before visibility callbacks can fail.
        this._updateDetailBatchVisibility(cell, this._camera.entity.transform.worldPosition);
        continue;
      }
      const batch = createCompactedDetailPopulationBatch(
        this._engine,
        cell.resource.root,
        source,
        this._detailMaterial(source.lods[0].renderer.material),
        field,
        cell.data,
        fields,
        work.patch,
        category === "grass" ? this._grassColorField : undefined,
        category === "grass" ? this._grassRoadColor : undefined,
        category === "grass" && (!field.heightRangeMetres || this._grassHeightOverride)
          ? this._grassScaleRange
          : undefined,
        work
      );
      publication.workIndex++;
      batchCreations++;
      if (batch) {
        // Register ownership before optional attribute allocation can fail.
        batch.renderer.enabled = false;
        (category === "grass" ? publication.grassBatches : publication.flowerBatches).push(batch);
        if (category === "grass") {
          this._bindGrassRockAppearance(batch, fields, work);
          batch.renderer.shaderData.enableMacro("RENDERER_GRASS_DENSITY_LOD");
          batch.renderer.shaderData.setVector4(
            "renderer_GrassDensityLod",
            new Vector4(
              batch.instanceCount,
              this._grassDensityLodEnabled ? 1 : 0,
              seedWorldPopulationDetailFadeTerminalDistance(),
              0.01
            )
          );
        }
        if (category === "grass" && this._grassTerrainMaterial) {
          bindSeedWorldGrassTerrainSurface(batch.renderer, this._grassTerrainMaterial);
        }
      } else {
        if (work.patch.transforms.length) this._detailTransformPool.release(work.patch.transforms);
      }
      // The publication now owns this transform buffer if entrance setup needs rollback.
      if (batch) this._prepareDetailBatchEntrance(batch, field, task);
    }

    if (task.dirtyPatches) {
      // Empty affected patches keep dormant GPU storage so removing occupancy can reuse it.
      const side = Math.ceil(
        SEED_WORLD_POPULATION_CELL_METRES / SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.renderPatchMetres
      );
      for (const [category, batches] of cell.resource.detailBatches)
        for (const batch of batches) {
          const patch = batch.detailPatch;
          if (
            !patch ||
            !task.dirtyPatches.has(patch.z * side + patch.x) ||
            publication.workItems.some(
              (work) =>
                work.field.category === category &&
                work.field.assetProfileKey === patch.assetProfileKey &&
                work.patch.patchX === patch.x &&
                work.patch.patchZ === patch.z
            )
          )
            continue;
          this._setDetailBatchEnabled(batch, false);
          this._detailTransformPool.release(batch.transforms);
          batch.transforms = EMPTY_DETAIL_TRANSFORMS;
          batch.instanceCount = batch.candidateCount = 0;
          batch.owners = undefined;
          batch.resources.mesh.instanceCount = 0;
        }
      cell.resource.detailsLoaded = true;
      cell.resource.compactionTask = undefined;
      this._updateDetailBatchVisibility(cell, this._camera.entity.transform.worldPosition);
      return true;
    }

    for (const batches of cell.resource.detailBatches.values()) {
      for (const batch of batches) {
        this._setDetailBatchEnabled(batch, false);
        disposeDetailBatch(batch, this._detailTransformPool);
      }
    }
    cell.resource.detailBatches.clear();
    if (publication.grassBatches.length > 0) cell.resource.detailBatches.set("grass", publication.grassBatches);
    if (publication.flowerBatches.length > 0) cell.resource.detailBatches.set("flower", publication.flowerBatches);
    for (const batches of cell.resource.detailBatches.values()) {
      for (const batch of batches) this._setDetailBatchEnabled(batch, cell.resource.detailsActive);
    }
    cell.resource.detailsLoaded = true;
    cell.resource.compactionTask = undefined;
    if (task.entrance && !task.entrance.settled) {
      this._updateDetailBatchVisibility(cell, this._camera.entity.transform.worldPosition);
      for (const batch of [...publication.grassBatches, ...publication.flowerBatches]) {
        if (!batch.entrance) continue;
        if (batch.renderer.enabled) batch.entrance.startedAtSeconds = this._elapsedSeconds;
        else this._settleDetailBatchEntrance(batch);
      }
      task.entrance.pendingCells.delete(cell.resource);
      this._settleCompletedDetailEntrance(task.entrance);
    }
    return true;
  }

  private _cancelDetailCompaction(resource: DetailPopulationCellResource): void {
    const task = resource.compactionTask;
    if (!task) return;
    if (task.current) {
      for (const transforms of task.current.staging) this._detailTransformPool.release(transforms);
    }
    for (const result of task.completed) {
      for (const patch of result.patches) this._detailTransformPool.release(patch.transforms);
    }
    const publication = task.publication;
    if (publication) {
      for (let workIndex = publication.workIndex; workIndex < publication.workItems.length; workIndex++) {
        const work = publication.workItems[workIndex]!;
        if (work.patch.transforms.length) this._detailTransformPool.release(work.patch.transforms);
        if (work.copySources)
          for (let source = work.sourceIndex; source < work.copySources.length; source++) {
            this._detailTransformPool.release(work.copySources[source].transforms);
          }
      }
      for (const batch of publication.grassBatches) disposeDetailBatch(batch, this._detailTransformPool);
      for (const batch of publication.flowerBatches) disposeDetailBatch(batch, this._detailTransformPool);
    }
    resource.compactionTask = undefined;
    if (task.entrance) {
      task.entrance.pendingCells.delete(resource);
      this._settleCompletedDetailEntrance(task.entrance);
    }
  }

  private _updateDetailBatchVisibility(
    cell: SeedWorldResidentPopulationCell<DetailPopulationCellResource>,
    cameraPosition: Vector3
  ): void {
    const detailBatches = cell.resource.detailBatches;
    this._updateDetailBatchCategoryVisibility(
      detailBatches.get("grass"),
      cell.resource.detailsActive && this._detailCategoryVisible.grass,
      cameraPosition,
      true
    );
    this._updateDetailBatchCategoryVisibility(
      detailBatches.get("flower"),
      cell.resource.detailsActive && this._detailCategoryVisible.flower,
      cameraPosition
    );
  }

  private _updateDetailBatchCategoryVisibility(
    batches: readonly DetailPopulationBatch[] | undefined,
    detailsActive: boolean,
    cameraPosition: Vector3,
    grass = false
  ): void {
    if (!batches) return;
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]!;
      if (grass) {
        const bounds = batch.bounds;
        const distance = Math.hypot(
          Math.max(bounds.min.x - cameraPosition.x, 0, cameraPosition.x - bounds.max.x),
          Math.max(bounds.min.y - cameraPosition.y, 0, cameraPosition.y - bounds.max.y),
          Math.max(bounds.min.z - cameraPosition.z, 0, cameraPosition.z - bounds.max.z)
        );
        const end = seedWorldPopulationDetailFadeTerminalDistance();
        batch.resources.mesh.instanceCount = this._grassDensityLodEnabled
          ? Math.ceil(batch.instanceCount * grassDensityLodFraction(distance, end))
          : batch.instanceCount;
        batch.renderer.shaderData.setVector4(
          "renderer_GrassDensityLod",
          new Vector4(batch.instanceCount, this._grassDensityLodEnabled ? 1 : 0, end, 0.01)
        );
      }
      this._setDetailBatchEnabled(
        batch,
        detailsActive &&
          batch.instanceCount > 0 &&
          this._populationFrustum.intersectsBox(batch.bounds) &&
          (detailBoundsContainsCamera(batch.bounds, cameraPosition) ||
            seedWorldPopulationDetailBoundsIsActive(batch.bounds, cameraPosition))
      );
    }
  }

  private _setDetailBatchEnabled(batch: DetailPopulationBatch, enabled: boolean): void {
    if (batch.renderer.enabled === enabled) return;
    batch.renderer.enabled = enabled;
    this._submittedDetailBatchCount += enabled ? 1 : -1;
    if (this._submittedDetailBatchCount < 0) {
      throw new Error("Seed World submitted Detail batch count became negative");
    }
  }

  private _disposeDetailCellResource(resource: DetailPopulationCellResource): void {
    this._releaseCellDetails(resource);
    resource.root.destroy();
  }

  private _invalidateDetailCells(
    dirtyCellIds: ReadonlySet<string>,
    entrance?: DetailAuthoringEntrance,
    dirtyAreas?: readonly SeedWorldAuthoringRuntimeBoundsV1[]
  ): void {
    for (const cell of this._detailCells.cells) {
      if (!dirtyCellIds.has(cell.data.id)) continue;
      cell.resource.expectedCounts = expectedDetailCounts(
        this._populationLayout.detailDensityFields,
        cell.data,
        this._fields,
        (field) => this._detailDensityMultiplier(field)
      );
      const previousTask = cell.resource.compactionTask;
      let dirtyPatches =
        dirtyAreas && cell.resource.detailsLoaded ? detailPatchesForBounds(cell.data, dirtyAreas) : undefined;
      // A full rebuild already in flight remains full. Partial edits coalesce before cancellation.
      if (previousTask) {
        if (!previousTask.dirtyPatches) dirtyPatches = undefined;
        else if (dirtyPatches) for (const patch of previousTask.dirtyPatches) dirtyPatches.add(patch);
      }
      this._cancelDetailCompaction(cell.resource);
      cell.resource.compactionTask =
        cell.resource.detailsLoaded || cell.resource.detailsActive
          ? this._createDetailCompactionTask(this._populationLayout, dirtyPatches)
          : undefined;
      const task = cell.resource.compactionTask;
      if (task && entrance && this.details.isActiveInHierarchy && cell.resource.detailsActive) {
        const previousPositions = new Map<string, Set<string>>();
        for (const batches of cell.resource.detailBatches.values()) {
          for (const batch of batches) {
            if (!batch.prototypeFamily) continue;
            let positions = previousPositions.get(batch.prototypeFamily);
            if (!positions) previousPositions.set(batch.prototypeFamily, (positions = new Set()));
            for (let index = 0; index < batch.instanceCount; index++) {
              const offset = index * DETAIL_TRANSFORM_FLOATS;
              positions.add(positionKey(batch.transforms[offset]!, batch.transforms[offset + 2]!));
            }
          }
        }
        task.entrance = entrance;
        task.previousPositions = previousPositions;
        entrance.pendingCells.add(cell.resource);
      }
    }
    this._detailsWereActive = false;
  }

  private _invalidateAllDetailCells(): void {
    this._invalidateDetailCells(new Set([...this._detailCells.cells].map((cell) => cell.data.id)));
  }

  private _refreshDetailCellsGrounding(dirtyCellIds: ReadonlySet<string>): void {
    for (const cell of this._detailCells.cells) {
      if (!dirtyCellIds.has(cell.data.id)) continue;
      if (cell.resource.compactionTask) {
        this._cancelDetailCompaction(cell.resource);
        cell.resource.compactionTask = this._createDetailCompactionTask();
      }
      if (cell.resource.detailsLoaded) {
        for (const batches of cell.resource.detailBatches.values()) {
          for (const batch of batches) refreshDetailBatchGrounding(batch, this._fields);
        }
      }
    }
  }

  private _releaseCellDetails(resource: DetailPopulationCellResource): void {
    this._cancelDetailCompaction(resource);
    for (const batches of resource.detailBatches.values()) {
      for (const batch of batches) {
        this._setDetailBatchEnabled(batch, false);
        disposeDetailBatch(batch, this._detailTransformPool);
      }
    }
    resource.detailBatches.clear();
    resource.detailsLoaded = false;
    resource.detailsActive = false;
  }

  private _primeDetailTransformPoolWhenSettled(): void {
    if (this._detailTransformPoolPrimed || !this._detailCells.isResidencySettled) return;
    const cells = this._detailCells.cells;
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      if (cells[cellIndex]!.resource.compactionTask) return;
    }
    this._detailTransformPool.prime();
    this._detailTransformPoolPrimed = true;
  }

  private _detailFamily(category: DetailCategory): AtomicAssemblySourceFamily {
    return category === "grass" ? this._sourceLibrary.grassFamily : this._sourceLibrary.flowerFamily;
  }
}

export class SeedWorldTreeLodRenderer implements RenderViewCullingSource {
  private readonly _engine: Engine;
  private readonly _camera: Camera;
  private readonly _owner: Entity;
  private readonly _batches: readonly TreeRecipeBatches[];
  private readonly _recipeIndexById: ReadonlyMap<string, number>;
  private readonly _viewCaches = createPopulationViewCaches();
  private readonly _registration: RenderViewCullingSourceRegistration;
  private _variationIndexByInstanceId: ReadonlyMap<string, number>;
  private readonly _initialVariationsByRecipe = new Map<string, readonly InstancedBirchPopulationVariation[]>();
  private readonly _lodCounts = new Uint32Array(PROCEDURAL_TREE_LOD_COUNT);
  private readonly _visibleObservation = { timeSeconds: 0, visible: true as const, screenRelativeHeight: 0 };
  private readonly _lodRendererSetScratch = createTerrainLodRendererSetScratch();
  private readonly _worldBoundsScratch = new BoundingBox(new Vector3(), new Vector3());
  private readonly _entranceByInstanceId = new Map<string, SeedWorldTreeEntrancePlayback>();
  private readonly _entrancePlaybacks = new Set<SeedWorldTreeEntrancePlayback>();

  private _dissolveStyle = DEFAULT_TREE_DISSOLVE_STYLE;

  setDissolveStyle(style: SeedWorldTreeDissolveStyle): void {
    this._dissolveStyle = style;
    for (const batch of this._batches) {
      for (const material of [batch.trunkMaterial, batch.leafMaterial])
        this._bindDissolveStyle(material, batch.variations);
    }
  }

  private _bindDissolveStyle(material: Material, variations: readonly InstancedBirchPopulationVariation[]): void {
    const style = this._dissolveStyle;
    const palette = new Float32Array(PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY * 4);
    variations.forEach((variation, index) => {
      const rgb = resolveTreeDissolveEdgeColor(style.colorRgb, variation.leafColorRgb, style.followLeafHue);
      palette.set([srgb8ToLinear(rgb[0]), srgb8ToLinear(rgb[1]), srgb8ToLinear(rgb[2]), 1], index * 4);
    });
    material.shaderData.setFloatArray(ShaderProperty.getByName("material_TreeDissolvePalette"), palette);
    material.shaderData.setVector4(
      ShaderProperty.getByName("material_TreeDissolveColor"),
      new Vector4(
        srgb8ToLinear(style.colorRgb[0]),
        srgb8ToLinear(style.colorRgb[1]),
        srgb8ToLinear(style.colorRgb[2]),
        style.spectrum
      )
    );
    material.shaderData.setVector4(
      ShaderProperty.getByName("material_TreeDissolveShape"),
      new Vector4(style.widthRatio, style.minimumWidth, style.brightness, style.colorFrequency)
    );
    material.shaderData.setVector4(
      ShaderProperty.getByName("material_TreeDissolveSpectrum"),
      new Vector4(style.spectrumBase, style.spectrumAmplitude, style.lift, this._densityDissolveBand)
    );
    material.shaderData.setVector3(
      ShaderProperty.getByName("material_TreeDissolvePhase"),
      new Vector3(style.phaseR, style.phaseG, style.phaseB)
    );
  }

  private _densityDissolveBand = 0.15;

  setDensityDissolveBand(band: number): void {
    this._densityDissolveBand = band;
    for (const batch of this._batches) {
      for (const material of [batch.trunkMaterial, batch.leafMaterial])
        this._bindDissolveStyle(material, batch.variations);
    }
  }

  captureRenderedVariations(): ReadonlyMap<string, readonly InstancedBirchPopulationVariation[]> {
    return new Map(this._batches.map((batch) => [batch.recipe.id, batch.variations]));
  }

  createDensityTransition(
    recipeId: string,
    previous: readonly InstancedBirchPopulationVariation[],
    previewTarget?: readonly InstancedBirchPopulationVariation[]
  ) {
    const batch = this._batchForRecipeId(recipeId);
    const target = previewTarget ?? batch.variations;
    const densityChanged = target.some(
      (value, index) =>
        value.leafDensity !== previous[index]!.leafDensity || value.branchDensity !== previous[index]!.branchDensity
    );
    const shapeChanged = target.some((value, index) =>
      Object.keys(value).some((key) => {
        if (key === "leafDensity" || key === "branchDensity") return false;
        const field = key as keyof InstancedBirchPopulationVariation;
        const from = previous[index]![field],
          to = value[field];
        return Array.isArray(to) ? to.some((channel, i) => channel !== (from as readonly number[])[i]) : from !== to;
      })
    );
    if (!densityChanged && !shapeChanged) return undefined;
    if (previewTarget)
      bindSeedWorldProceduralTreeVariationCatalog(batch.trunkMaterial, batch.leafMaterial, previewTarget);
    const macro = ShaderMacro.getByName("MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION");
    const property = ShaderProperty.getByName("material_ProceduralTreeDensityTransition");
    const catalog = new Float32Array(PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY * 4);
    for (let index = 0; index < batch.variations.length; index++) {
      const variation = batch.variations[index]!;
      const controls = previous[index];
      catalog.set(
        [
          controls?.leafDensity ?? variation.leafDensity,
          controls?.branchDensity ?? variation.branchDensity,
          0,
          this._densityDissolveBand
        ],
        index * 4
      );
    }
    const materials = [batch.trunkMaterial, batch.leafMaterial];
    for (const material of materials) {
      this._bindDissolveStyle(material, batch.variations);
      material.shaderData.setFloatArray(property, catalog);
      if (densityChanged) {
        material.shaderData.enableMacro(macro);
        material.shaderData.enableMacro(GENERATION_REVEAL_MACRO);
      }
    }
    for (const lod of batch.lods)
      for (const view of lod.views) {
        view.trunkRenderer.shaderData.setFloat(REVEAL_LIFT, WORLD_GENERATION_PRESENTATION.vegetationLiftMetres);
        view.crownRenderer.shaderData.setFloat(REVEAL_LIFT, WORLD_GENERATION_PRESENTATION.vegetationLiftMetres);
      }
    return {
      update: (progress: number): void => {
        // Keep logical targets in Authoring, but publish the displayed shape to both
        // GPU catalogs and CPU transforms/bounds. Densities retain their dissolve path.
        if (shapeChanged && !previewTarget) {
          this.setVariations(
            recipeId,
            target.map((value, index) => interpolateSeedWorldTreeVariation(previous[index]!, value, progress))
          );
        }
        for (let index = 0; index < PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY; index++) {
          catalog[index * 4 + 2] = progress;
          catalog[index * 4 + 3] = this._densityDissolveBand;
        }
        for (const material of materials) material.shaderData.setFloatArray(property, catalog);
      },
      dispose: (): void => {
        if (previewTarget)
          bindSeedWorldProceduralTreeVariationCatalog(batch.trunkMaterial, batch.leafMaterial, batch.variations);
        batch.variationLocalBounds = createProceduralTreeVariationLocalBounds(
          batch.baseTrunkBounds,
          batch.baseCrownBounds,
          batch.variations
        );
        for (const material of materials) {
          material.shaderData.disableMacro(macro);
          material.shaderData.disableMacro(GENERATION_REVEAL_MACRO);
        }
        for (const lod of batch.lods)
          for (const view of lod.views) {
            view.trunkRenderer.shaderData.setFloat(REVEAL_LIFT, ASSET_ENTRANCE_LIFT_METRES);
            view.crownRenderer.shaderData.setFloat(REVEAL_LIFT, ASSET_ENTRANCE_LIFT_METRES);
          }
      }
    };
  }
  private _cells: readonly SeedWorldResidentPopulationCell<SparsePopulationCellResource>[] = Object.freeze([]);
  private _elapsedSeconds = 0;
  private _lodStateEpoch = 0;
  private _revealRevision = 0;
  private _destroyed = false;

  get lodCounts(): ProceduralTreeLodTuple<number> {
    return [this._lodCounts[0], this._lodCounts[1], this._lodCounts[2], this._lodCounts[3]];
  }

  /** Current immutable renderer-only variation ownership, used to stage Authoring transactions. */
  get variationAssignments(): ReadonlyMap<string, number> {
    return this._variationIndexByInstanceId;
  }

  readInstance(
    instance: SeedWorldPopulationInstance,
    position: readonly [number, number, number],
    patch?: SeedWorldTreeShapePatch,
    planningIndex?: number
  ) {
    const batch = this._batchForRecipeId(instance.assetRecipeId);
    const index = planningIndex ?? this._variationIndexByInstanceId.get(instance.id);
    if (index === undefined) throw new Error(`Tree '${instance.id}' has no assigned recipe variation`);
    const source =
      planningIndex === undefined
        ? batch.variations[index]!
        : this._initialVariationsByRecipe.get(batch.recipe.id)![index]!;
    const variation = patch ? applySeedWorldTreeShapePatch(source, patch) : source;
    const halfYaw = instance.yawRadians * 0.5;
    const grounded = {
      producerInstance: instance,
      position,
      surfaceNormal: [0, 1, 0] as const,
      rotation: [0, Math.sin(halfYaw), 0, Math.cos(halfYaw)] as const
    };
    const transform = tunedProceduralTreeTransform(grounded, variation, batch.sizeScale);
    const records = new Float32Array(TREE_ASSEMBLY_INSTANCE_FLOATS);
    const bounds = new Float32Array(POPULATION_WORLD_BOUNDS_FLOATS);
    writeSeedWorldCatalogTreeStaticRecord(records, 0, grounded, variation, index, batch.sizeScale);
    const local =
      patch || planningIndex !== undefined
        ? createProceduralTreeVariationLocalBounds(batch.baseTrunkBounds, batch.baseCrownBounds, [variation])[0]!
        : batch.variationLocalBounds[index]!;
    writeSeedWorldTreeWorldBounds(bounds, 0, local.combined, records);
    return Object.freeze({
      recipeId: batch.recipe.id,
      recipeLabel: batch.recipe.label,
      effectIndex: index,
      treeShape: readSeedWorldTreeShapeControls(variation),
      position,
      scale: Object.freeze([...transform.scale] as [number, number, number]),
      yawRadians: instance.yawRadians + variation.yawRadians,
      bounds: Object.freeze({
        minimum: Object.freeze([bounds[0]!, bounds[1]!, bounds[2]!] as const),
        maximum: Object.freeze([bounds[3]!, bounds[4]!, bounds[5]!] as const)
      })
    });
  }

  reconcileVariationAssignments(
    instances: readonly Pick<SeedWorldPopulationInstance, "id" | "category" | "assetRecipeId">[],
    previousAssignments: ReadonlyMap<string, number> = new Map()
  ): ReadonlyMap<string, number> {
    return reconcileSeedWorldTreeVariationIndexMap(
      instances,
      new Map(this._batches.map((batch) => [batch.recipe.id, batch.variations.length])),
      previousAssignments
    );
  }

  restoreVariationAssignments(
    instances: readonly Pick<SeedWorldPopulationInstance, "id" | "category" | "assetRecipeId">[],
    saved: readonly SeedWorldSavedTreeVariation[]
  ): void {
    this.setVariationAssignments(
      restoreSeedWorldTreeVariationIndexMap(
        instances,
        new Map(this._batches.map((batch) => [batch.recipe.id, batch.variations.length])),
        saved
      )
    );
  }

  constructor(
    engine: Engine,
    camera: Camera,
    root: Entity,
    profiles: readonly ProceduralTreeRuntimeAuthoringProfile[],
    populationLayout: SeedWorldPopulationPreview,
    renderBounds: BoundingBox
  ) {
    this._engine = engine;
    this._camera = camera;
    for (const profile of profiles) this._initialVariationsByRecipe.set(profile.recipe.id, profile.variations);
    this._variationIndexByInstanceId = createSeedWorldTreeVariationIndexMap(
      populationLayout.treeInstances,
      new Map(profiles.map((profile) => [profile.recipe.id, profile.variations.length]))
    );
    this._owner = root.createChild("Seed World tuned procedural tree LOD batches");
    const capacities = exactTreeRecipeCapacities(
      populationLayout,
      profiles.map((profile) => profile.recipe)
    );
    const batches: TreeRecipeBatches[] = [];
    try {
      for (let profileIndex = 0; profileIndex < profiles.length; profileIndex++) {
        batches.push(
          this._createRecipeBatches(engine, profiles[profileIndex]!, capacities[profileIndex]!, renderBounds)
        );
      }
      this._batches = batches;
      this._recipeIndexById = new Map(batches.map((batch, recipeIndex) => [batch.recipe.id, recipeIndex]));
      this._registration = camera.registerRenderViewCullingSource(this);
    } catch (error) {
      for (const recipe of batches) disposeProceduralTreeRecipeBatches(recipe);
      this._owner.destroy();
      throw error;
    }
  }

  createLodInstance(assetRecipeId: string | undefined): TerrainLodGroupInstance {
    return this._batchForRecipeId(assetRecipeId).lodDefinition.createInstance();
  }

  createCellStaticData(instances: readonly SeedWorldGroundedPopulationInstance[]): ProceduralTreeCellStaticData {
    const count = instances.length;
    const data: ProceduralTreeCellStaticData = {
      treeProjectionData: new Float64Array(count * STATIC_PROJECTION_FLOATS),
      treeInstanceData: new Float32Array(count * TREE_ASSEMBLY_INSTANCE_FLOATS),
      treeWorldBoundsData: new Float32Array(count * POPULATION_WORLD_BOUNDS_FLOATS),
      treeLodWorldBoundsData: new Float32Array(count * TREE_LOD_BOUNDS_RECORDS * POPULATION_WORLD_BOUNDS_FLOATS),
      treeRecipeIndices: new Uint8Array(count),
      treeLodStateCounts: new Uint8Array(count),
      treeLodStateIndices: new Uint8Array(count * POPULATION_LOD_STATE_CAPACITY),
      treeLodStateFades: new Float32Array(count * POPULATION_LOD_STATE_CAPACITY),
      treeCameraCandidateEpochs: new Uint32Array(count),
      treeBounds: new BoundingBox(new Vector3(), new Vector3())
    };
    this.refreshCellStaticData(data, instances);
    return data;
  }

  refreshCellStaticData(
    data: ProceduralTreeCellStaticData,
    instances: readonly SeedWorldGroundedPopulationInstance[],
    preserveLodState = false
  ): void {
    const count = instances.length;
    if (
      data.treeProjectionData.length !== count * STATIC_PROJECTION_FLOATS ||
      data.treeInstanceData.length !== count * TREE_ASSEMBLY_INSTANCE_FLOATS ||
      data.treeWorldBoundsData.length !== count * POPULATION_WORLD_BOUNDS_FLOATS ||
      data.treeLodWorldBoundsData.length !== count * TREE_LOD_BOUNDS_RECORDS * POPULATION_WORLD_BOUNDS_FLOATS ||
      data.treeRecipeIndices.length !== count ||
      data.treeLodStateCounts.length !== count ||
      data.treeLodStateIndices.length !== count * POPULATION_LOD_STATE_CAPACITY ||
      data.treeLodStateFades.length !== count * POPULATION_LOD_STATE_CAPACITY ||
      data.treeCameraCandidateEpochs.length !== count
    ) {
      throw new Error("Seed World tree Cell static storage does not match its instance identities");
    }

    let minimumX = Number.POSITIVE_INFINITY;
    let minimumY = Number.POSITIVE_INFINITY;
    let minimumZ = Number.POSITIVE_INFINITY;
    let maximumX = Number.NEGATIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    let maximumZ = Number.NEGATIVE_INFINITY;
    for (let instanceIndex = 0; instanceIndex < count; instanceIndex++) {
      const instance = instances[instanceIndex]!;
      const recipeIndex = this._recipeIndex(instance.producerInstance.assetRecipeId);
      const recipe = this._batches[recipeIndex]!;
      const variationIndex = this._variationIndexByInstanceId.get(instance.producerInstance.id);
      if (variationIndex === undefined) {
        throw new RangeError(`Seed World tree "${instance.producerInstance.id}" is missing its variation index`);
      }
      const catalogIndex = variationIndex % recipe.variations.length;
      const variation = recipe.variations[catalogIndex]!;
      data.treeRecipeIndices[instanceIndex] = recipeIndex;
      data.treeProjectionData.set(
        createSeedWorldTunedProceduralTreeProjection(instance, recipe.recipe.lodGroup, variation, recipe.sizeScale),
        instanceIndex * STATIC_PROJECTION_FLOATS
      );
      writeSeedWorldCatalogTreeStaticRecord(
        data.treeInstanceData,
        instanceIndex,
        instance,
        variation,
        catalogIndex,
        recipe.sizeScale
      );
      const variationBounds = recipe.variationLocalBounds[catalogIndex]!;
      writeSeedWorldTreeWorldBounds(
        data.treeWorldBoundsData,
        instanceIndex,
        variationBounds.combined,
        data.treeInstanceData
      );
      for (let partIndex = 0; partIndex < TREE_LOD_BOUNDS_RECORDS; partIndex++) {
        writeSeedWorldTreeWorldBounds(
          data.treeLodWorldBoundsData,
          instanceIndex,
          variationBounds.parts[partIndex]!,
          data.treeInstanceData,
          instanceIndex * TREE_LOD_BOUNDS_RECORDS + partIndex
        );
      }
      const boundsOffset = instanceIndex * POPULATION_WORLD_BOUNDS_FLOATS;
      const instanceMinimumY = data.treeWorldBoundsData[boundsOffset + 1]!;
      const instanceMaximumY = data.treeWorldBoundsData[boundsOffset + 4]!;
      const recordOffset = instanceIndex * TREE_ASSEMBLY_INSTANCE_FLOATS;
      data.treeInstanceData[recordOffset + 14] = instanceMinimumY;
      data.treeInstanceData[recordOffset + 15] = Math.max(0.001, instanceMaximumY - instanceMinimumY);
      minimumX = Math.min(minimumX, data.treeWorldBoundsData[boundsOffset]!);
      minimumY = Math.min(minimumY, instanceMinimumY);
      minimumZ = Math.min(minimumZ, data.treeWorldBoundsData[boundsOffset + 2]!);
      maximumX = Math.max(maximumX, data.treeWorldBoundsData[boundsOffset + 3]!);
      maximumY = Math.max(maximumY, instanceMaximumY);
      maximumZ = Math.max(maximumZ, data.treeWorldBoundsData[boundsOffset + 5]!);
    }
    if (count === 0) {
      data.treeBounds.min.set(0, 0, 0);
      data.treeBounds.max.set(0, 0, 0);
    } else {
      data.treeBounds.min.set(minimumX, minimumY, minimumZ);
      data.treeBounds.max.set(maximumX, maximumY, maximumZ);
    }
    // Presentation runs after the population update. Keep that frame's selected LODs
    // while refreshing geometry; the next population update samples the new bounds.
    if (!preserveLodState) {
      data.treeLodStateCounts.fill(0);
      data.treeCameraCandidateEpochs.fill(0);
    }
    this._invalidateViewCaches();
  }

  ensureCapacity(populationLayout: SeedWorldPopulationPreview): void {
    const capacities = exactTreeRecipeCapacities(
      populationLayout,
      this._batches.map((batch) => batch.recipe)
    );
    for (let recipeIndex = 0; recipeIndex < this._batches.length; recipeIndex++) {
      const recipe = this._batches[recipeIndex]!;
      const capacity = capacities[recipeIndex]!;
      for (const lod of recipe.lods) {
        for (const view of lod.views) {
          ensureProceduralTreeViewBatchCapacity(
            this._engine,
            view,
            lod.trunkSourceMesh,
            lod.crownSourceMesh,
            recipe.worldBounds,
            capacity
          );
        }
        const nextCapacity = lod.views[0]!.capacity;
        if (nextCapacity > lod.visible.stateOffsets.length) {
          lod.visible.cells.length = nextCapacity;
          lod.visible.stateOffsets = new Uint32Array(nextCapacity);
          lod.visible.partMasks = new Uint8Array(nextCapacity);
        }
      }
    }
    this._invalidateViewCaches();
  }

  /** Atomically switches the stable tree-id to visual-variation mapping for a staged layout. */
  setVariationAssignments(assignments: ReadonlyMap<string, number>): void {
    this._variationIndexByInstanceId = assignments;
    for (const instanceId of this._entranceByInstanceId.keys()) {
      if (!assignments.has(instanceId)) this._entranceByInstanceId.delete(instanceId);
    }
    this._invalidateViewCaches();
  }

  /** Updates the single shared leaf Material consumed by every LOD and instance of one recipe. */
  setLeafLightingTuning(recipeId: string, tuning: TreeLeafLightingTuning): void {
    const batch = this._batchForRecipeId(recipeId);
    configureLeafLightingTuning(batch.leafMaterial, tuning);
  }

  /** Replaces one recipe's seven-effect catalog without changing Population placement or variation assignment. */
  setVariations(recipeId: string, variations: readonly InstancedBirchPopulationVariation[]): void {
    if (variations.length !== INSTANCED_BIRCH_POPULATION_VARIATION_COUNT) {
      throw new RangeError(
        `Seed World tree recipe "${recipeId}" requires ${INSTANCED_BIRCH_POPULATION_VARIATION_COUNT} population variations`
      );
    }
    const batch = this._batchForRecipeId(recipeId);
    batch.variations = Object.freeze(variations.map(detachTreePopulationVariation));
    bindSeedWorldProceduralTreeVariationCatalog(batch.trunkMaterial, batch.leafMaterial, batch.variations);
    for (const material of [batch.trunkMaterial, batch.leafMaterial])
      this._bindDissolveStyle(material, batch.variations);
    for (let lodIndex = 0; lodIndex < batch.lods.length; lodIndex++) {
      batch.lods[lodIndex]!.trunkSourceMesh.bounds = createInstancedBirchVariationLocalBounds(
        batch.baseTrunkBounds[lodIndex]!,
        batch.variations
      );
      batch.lods[lodIndex]!.crownSourceMesh.bounds = createInstancedBirchVariationLocalBounds(
        batch.baseCrownBounds[lodIndex]!,
        batch.variations
      );
    }
    batch.variationLocalBounds = createProceduralTreeVariationLocalBounds(
      batch.baseTrunkBounds,
      batch.baseCrownBounds,
      batch.variations
    );
    this._invalidateViewCaches();
  }

  /** Starts one stable-id entrance after canonical instances completed their first renderer submission. */
  playEntrance(instanceIds: ReadonlySet<string>, durationMs: number, signal?: AbortSignal): Promise<void> {
    if (this._destroyed) throw new Error("Seed World tree renderer is destroyed");
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new RangeError("Seed World tree entrance duration must be positive and finite");
    }
    signal?.throwIfAborted();
    const publishedIds = new Set<string>();
    for (const instanceId of instanceIds) {
      if (this._variationIndexByInstanceId.has(instanceId)) publishedIds.add(instanceId);
    }
    if (publishedIds.size === 0) return Promise.resolve();
    for (const instanceId of publishedIds) {
      if (this._entranceByInstanceId.has(instanceId)) {
        throw new Error(`Seed World tree '${instanceId}' already owns an active entrance`);
      }
    }
    return new Promise<void>((resolve, reject) => {
      let playback!: SeedWorldTreeEntrancePlayback;
      const abort = (): void =>
        this._settleEntrance(
          playback,
          signal?.reason ?? new DOMException("Seed World tree entrance aborted", "AbortError")
        );
      playback = {
        instanceIds: publishedIds,
        durationSeconds: durationMs / 1_000,
        startedAtSeconds: this._elapsedSeconds,
        ...(signal ? { signal } : {}),
        abort,
        resolve,
        reject,
        progress: 0,
        settled: false
      };
      this._entrancePlaybacks.add(playback);
      for (const instanceId of publishedIds) this._entranceByInstanceId.set(instanceId, playback);
      this._revealRevision++;
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  update(
    cells: readonly SeedWorldResidentPopulationCell<SparsePopulationCellResource>[],
    camera: Camera,
    frustum: BoundingFrustum,
    elapsedSeconds: number,
    tuning: TerrainLodRendererTuning,
    terrainOcclusionCuller: SeedWorldTerrainOcclusionCuller
  ): boolean {
    this._cells = cells;
    this._lodStateEpoch = (this._lodStateEpoch + 1) >>> 0;
    if (this._lodStateEpoch === 0) {
      this._lodStateEpoch = 1;
      for (const cell of cells) {
        cell.resource.treeCameraCandidateEpochs.fill(0);
      }
    }
    let transitionActive = false;
    const cameraPosition = camera.entity.transform.worldPosition;
    const projectionScale = cameraVerticalProjectionScale(camera);
    const terrainOcclusionQueryable = terrainOcclusionCuller.horizonQueryableThisFrame;
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const cell = cells[cellIndex]!;
      const instances = cell.data.instances.tree;
      if (instances.length === 0) continue;
      if (
        this._updateCellLodStates(cell, cameraPosition, camera.isOrthographic, projectionScale, elapsedSeconds, tuning)
      ) {
        transitionActive = true;
      }
      if (camera.enableFrustumCulling && !frustum.intersectsBox(cell.resource.treeBounds)) continue;
      if (
        terrainOcclusionQueryable &&
        terrainOcclusionCuller.isOccluded(cell.data.id, cell.resource.treeBounds, instances.length)
      ) {
        continue;
      }
      if (terrainOcclusionQueryable && instances.length >= SPARSE_OCCLUSION_SUBCELL_MINIMUM_INSTANCES) {
        const subCells = cell.resource.treeSubCells;
        for (let subCellIndex = 0; subCellIndex < subCells.length; subCellIndex++) {
          const subCell = subCells[subCellIndex]!;
          if (
            terrainOcclusionCuller.isSubCellOccluded(
              subCell.occlusionKey,
              subCell.bounds,
              subCell.instanceIndices.length
            )
          ) {
            continue;
          }
          this._markCameraCandidates(cell, subCell.instanceIndices);
        }
      } else {
        if (terrainOcclusionQueryable) terrainOcclusionCuller.retainVisibleRenderers(instances.length);
        this._markCameraCandidates(cell);
      }
    }
    return transitionActive;
  }

  cull(context: RenderViewCullingContext): void {
    if (
      context.viewType === RenderViewType.ShadowCascade &&
      !SEED_WORLD_POPULATION_RUNTIME_PROFILE.tree.shadows.castShadows
    )
      return;
    if (this._destroyed || context.camera !== this._camera) return;
    const viewIndex =
      context.viewType === RenderViewType.Camera ? POPULATION_CAMERA_VIEW_INDEX : context.shadowCascadeIndex + 1;
    if (viewIndex < 0 || viewIndex >= POPULATION_RENDER_VIEW_COUNT) return;

    const cache = this._viewCaches[viewIndex]!;
    if (populationViewCacheMatches(cache, context, this._lodStateEpoch, this._revealRevision)) {
      this._submitTreeView(context, viewIndex);
      return;
    }

    this._resetTreeView(viewIndex);
    if (this._owner.isActiveInHierarchy) {
      const cells = this._cells;
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
        const cell = cells[cellIndex]!;
        if (cell.data.instances.tree.length === 0) {
          continue;
        }
        const containment = context.classifyBounds(cell.resource.treeBounds);
        if (containment === ContainmentType.Disjoint) {
          continue;
        }
        this._appendVisibleCell(context, viewIndex, cell, containment === ContainmentType.Contains);
      }
    }
    this._publishTreeView(context, viewIndex);
    capturePopulationViewCache(cache, context, this._lodStateEpoch, this._revealRevision);
  }

  /** Advances active authoring entrances without rebuilding camera visibility or LOD state. */
  advanceEntrances(elapsedSeconds: number): void {
    this._elapsedSeconds = elapsedSeconds;
    if (this._entrancePlaybacks.size === 0) return;
    this._entrancePlaybacks.forEach(this._advanceEntrancePlayback, this);
  }

  private _advanceEntrancePlayback(playback: SeedWorldTreeEntrancePlayback): void {
    const progress = Math.min(
      1,
      Math.max(0, (this._elapsedSeconds - playback.startedAtSeconds) / playback.durationSeconds)
    );
    if (!Object.is(playback.progress, progress)) {
      playback.progress = progress;
      this._revealRevision++;
    }
    if (progress >= 1) this._settleEntrance(playback);
  }

  private _settleEntrance(playback: SeedWorldTreeEntrancePlayback, error?: unknown): void {
    if (playback.settled) return;
    playback.settled = true;
    playback.signal?.removeEventListener("abort", playback.abort);
    this._entrancePlaybacks.delete(playback);
    for (const instanceId of playback.instanceIds) {
      if (this._entranceByInstanceId.get(instanceId) === playback) this._entranceByInstanceId.delete(instanceId);
    }
    this._revealRevision++;
    error === undefined ? playback.resolve() : playback.reject(error);
  }

  private _updateCellLodStates(
    cell: SeedWorldResidentPopulationCell<SparsePopulationCellResource>,
    cameraPosition: Readonly<{ x: number; y: number; z: number }>,
    cameraIsOrthographic: boolean,
    projectionScale: number,
    elapsedSeconds: number,
    tuning: TerrainLodRendererTuning
  ): boolean {
    let transitionActive = false;
    const instances = cell.data.instances.tree;
    for (let instanceIndex = 0; instanceIndex < instances.length; instanceIndex++) {
      const recipeIndex = cell.resource.treeRecipeIndices[instanceIndex]!;
      const batch = this._batches[recipeIndex]!;
      const projectionOffset = instanceIndex * STATIC_PROJECTION_FLOATS;
      const distanceMetres = staticProjectionDistance(
        cell.resource.treeProjectionData,
        projectionOffset,
        cameraPosition
      );
      const screenRelativeHeight =
        cell.resource.treeProjectionData[projectionOffset + 3]! *
        projectionScale *
        (cameraIsOrthographic ? 1 : 1 / Math.max(distanceMetres, Number.EPSILON));
      const observation = this._visibleObservation;
      observation.timeSeconds = elapsedSeconds;
      observation.screenRelativeHeight =
        distanceMetres > SEED_WORLD_POPULATION_RUNTIME_PROFILE.tree.terminalFadeDistanceMetres
          ? 0
          : tuning.enabled
            ? screenRelativeHeight * tuning.distanceScale
            : Number.MAX_SAFE_INTEGER;
      const states = cell.resource.treeLodInstances[instanceIndex]!.updateInto(
        observation,
        this._lodRendererSetScratch
      );
      if (states.length > POPULATION_LOD_STATE_CAPACITY) {
        throw new Error("Seed World tree LOD state exceeds the fixed CrossFade capacity");
      }
      const stateOffset = instanceIndex * POPULATION_LOD_STATE_CAPACITY;
      cell.resource.treeLodStateCounts[instanceIndex] = states.length;
      for (let stateIndex = 0; stateIndex < states.length; stateIndex++) {
        const state = states[stateIndex]!;
        if (state.crossFading) transitionActive = true;
        if (!batch.lods[state.lodIndex]) {
          throw new RangeError(`Seed World tree runtime LOD ${state.lodIndex} is unavailable`);
        }
        cell.resource.treeLodStateIndices[stateOffset + stateIndex] = state.lodIndex;
        cell.resource.treeLodStateFades[stateOffset + stateIndex] = state.signedFade;
      }
    }
    return transitionActive;
  }

  private _markCameraCandidates(
    cell: SeedWorldResidentPopulationCell<SparsePopulationCellResource>,
    instanceIndices?: Uint32Array
  ): void {
    const candidateEpochs = cell.resource.treeCameraCandidateEpochs;
    const count = instanceIndices?.length ?? candidateEpochs.length;
    for (let cursor = 0; cursor < count; cursor++) {
      candidateEpochs[instanceIndices?.[cursor] ?? cursor] = this._lodStateEpoch;
    }
  }

  private _appendVisibleCell(
    context: RenderViewCullingContext,
    viewIndex: number,
    cell: SeedWorldResidentPopulationCell<SparsePopulationCellResource>,
    fullyContained: boolean
  ): void {
    const count = cell.data.instances.tree.length;
    for (let instanceIndex = 0; instanceIndex < count; instanceIndex++) {
      if (
        viewIndex === POPULATION_CAMERA_VIEW_INDEX &&
        cell.resource.treeCameraCandidateEpochs[instanceIndex] !== this._lodStateEpoch
      ) {
        continue;
      }
      this._appendVisibleInstance(context, viewIndex, cell, instanceIndex, fullyContained);
    }
  }

  private _appendVisibleInstance(
    context: RenderViewCullingContext,
    viewIndex: number,
    cell: SeedWorldResidentPopulationCell<SparsePopulationCellResource>,
    instanceIndex: number,
    fullyContained: boolean
  ): void {
    const recipeIndex = cell.resource.treeRecipeIndices[instanceIndex]!;
    const recipe = this._batches[recipeIndex];
    if (!recipe) throw new RangeError(`Seed World tree recipe index ${recipeIndex} is unavailable`);
    const boundsData = cell.resource.treeLodWorldBoundsData;
    const bounds = this._worldBoundsScratch;
    const stateOffset = instanceIndex * POPULATION_LOD_STATE_CAPACITY;
    const stateCount = cell.resource.treeLodStateCounts[instanceIndex]!;
    for (let stateIndex = 0; stateIndex < stateCount; stateIndex++) {
      const lodIndex = cell.resource.treeLodStateIndices[stateOffset + stateIndex]!;
      const lod = recipe.lods[lodIndex];
      if (!lod) throw new RangeError(`Seed World tree runtime LOD ${lodIndex} is unavailable`);
      let trunkVisible = fullyContained;
      let crownVisible = fullyContained;
      if (!fullyContained) {
        const boundsOffset =
          (instanceIndex * TREE_LOD_BOUNDS_RECORDS + lodIndex * TREE_PART_COUNT) * POPULATION_WORLD_BOUNDS_FLOATS;
        bounds.min.set(boundsData[boundsOffset]!, boundsData[boundsOffset + 1]!, boundsData[boundsOffset + 2]!);
        bounds.max.set(boundsData[boundsOffset + 3]!, boundsData[boundsOffset + 4]!, boundsData[boundsOffset + 5]!);
        trunkVisible = context.isVisible(bounds);
        const crownOffset = boundsOffset + POPULATION_WORLD_BOUNDS_FLOATS;
        bounds.min.set(boundsData[crownOffset]!, boundsData[crownOffset + 1]!, boundsData[crownOffset + 2]!);
        bounds.max.set(boundsData[crownOffset + 3]!, boundsData[crownOffset + 4]!, boundsData[crownOffset + 5]!);
        crownVisible = context.isVisible(bounds);
      }
      if (!trunkVisible && !crownVisible) continue;
      const batch = lod.views[viewIndex]!;
      const recordIndex = batch.count++;
      if (recordIndex >= batch.capacity) {
        throw new RangeError("Seed World procedural-tree visible prefix exceeds its recipe capacity");
      }
      if (trunkVisible) batch.trunkCount++;
      if (crownVisible) batch.crownCount++;
      lod.visible.cells[recordIndex] = cell;
      lod.visible.stateOffsets[recordIndex] = stateOffset + stateIndex;
      lod.visible.partMasks[recordIndex] = (trunkVisible ? 1 : 0) | (crownVisible ? 2 : 0);
    }
  }

  private _packTreeViewBatch(
    batch: ProceduralTreeViewBatch,
    visible: ProceduralTreeVisibleInstances,
    revealActive: boolean,
    captureIdentities: boolean
  ): void {
    // Overlapping draw ranges share each record: [trunk-only][both][crown-only]
    batch.instanceIds.length = captureIdentities ? batch.count : 0;
    let trunkOnlyIndex = 0;
    let bothIndex = batch.count - batch.crownCount;
    let crownOnlyIndex = batch.trunkCount;
    for (let entryIndex = 0; entryIndex < batch.count; entryIndex++) {
      const cell = visible.cells[entryIndex]!;
      visible.cells[entryIndex] = undefined;
      const stateOffset = visible.stateOffsets[entryIndex]!;
      const instanceIndex = Math.floor(stateOffset / POPULATION_LOD_STATE_CAPACITY);
      const partMask = visible.partMasks[entryIndex]!;
      const recordIndex = partMask === 1 ? trunkOnlyIndex++ : partMask === 3 ? bothIndex++ : crownOnlyIndex++;
      if (captureIdentities)
        batch.instanceIds[recordIndex] = cell.data.instances.tree[instanceIndex]!.producerInstance.id;
      const playback = revealActive
        ? this._entranceByInstanceId.get(cell.data.instances.tree[instanceIndex]!.producerInstance.id)
        : undefined;
      const staticOffset = instanceIndex * TREE_ASSEMBLY_INSTANCE_FLOATS;
      const targetOffset = recordIndex * TREE_ASSEMBLY_INSTANCE_FLOATS;
      const target = batch.storage.staging;
      for (let floatIndex = 0; floatIndex < TREE_ASSEMBLY_INSTANCE_FLOATS; floatIndex++) {
        let next = cell.resource.treeInstanceData[staticOffset + floatIndex]!;
        if (floatIndex === 3) {
          next = cell.resource.treeLodStateFades[stateOffset]!;
        } else if (floatIndex === 13) {
          next = playback?.progress ?? 1;
        }
        next = Math.fround(next);
        const targetIndex = targetOffset + floatIndex;
        if (Object.is(target[targetIndex], next)) continue;
        target[targetIndex] = next;
        batch.dirtyFloatStart = Math.min(batch.dirtyFloatStart, targetIndex);
        batch.dirtyFloatEnd = Math.max(batch.dirtyFloatEnd, targetIndex + 1);
      }
      if (playback) batch.revealRequired = true;
    }
  }

  private _resetTreeView(viewIndex: number): void {
    for (const recipe of this._batches) {
      for (const lod of recipe.lods) {
        const batch = lod.views[viewIndex]!;
        batch.count = 0;
        batch.trunkCount = 0;
        batch.crownCount = 0;
        batch.dirtyFloatStart = Number.POSITIVE_INFINITY;
        batch.dirtyFloatEnd = 0;
        batch.revealRequired = false;
      }
    }
  }

  private _publishTreeView(context: RenderViewCullingContext, viewIndex: number): void {
    if (viewIndex === POPULATION_CAMERA_VIEW_INDEX) this._lodCounts.fill(0);
    const revealActive = this._entrancePlaybacks.size > 0;
    for (const recipe of this._batches) {
      for (let lodIndex = 0; lodIndex < recipe.lods.length; lodIndex++) {
        const lod = recipe.lods[lodIndex]!;
        const batch = lod.views[viewIndex]!;
        this._packTreeViewBatch(batch, lod.visible, revealActive, viewIndex === POPULATION_CAMERA_VIEW_INDEX);
        publishProceduralTreeViewBatch(batch);
        if (viewIndex === POPULATION_CAMERA_VIEW_INDEX) {
          this._lodCounts[recipe.sourceLodIndices[lodIndex]!] += batch.count;
        }
        if (batch.trunkCount > 0) context.submit(batch.trunkRenderer);
        if (batch.crownCount > 0) context.submit(batch.crownRenderer);
      }
    }
  }

  /** Trunk and crown draw different ranges of the same packed identity table. */
  visitPickBatches(
    visitor: (renderer: MeshRenderer, ids: readonly string[], start: number, count: number) => void
  ): void {
    if (this._destroyed || !this._owner.isActiveInHierarchy) return;
    for (let r = 0; r < this._batches.length; r++) {
      const recipe = this._batches[r]!;
      for (let l = 0; l < recipe.lods.length; l++) {
        const lod = recipe.lods[l]!;
        const batch = lod.views[POPULATION_CAMERA_VIEW_INDEX]!;
        if (batch.trunkCount > 0) visitor(batch.trunkRenderer, batch.instanceIds, 0, batch.trunkCount);
        if (batch.crownCount > 0)
          visitor(batch.crownRenderer, batch.instanceIds, batch.count - batch.crownCount, batch.crownCount);
      }
    }
  }

  private _submitTreeView(context: RenderViewCullingContext, viewIndex: number): void {
    if (!this._owner.isActiveInHierarchy) return;
    for (const recipe of this._batches) {
      for (const lod of recipe.lods) {
        const batch = lod.views[viewIndex]!;
        if (batch.trunkCount > 0) context.submit(batch.trunkRenderer);
        if (batch.crownCount > 0) context.submit(batch.crownRenderer);
      }
    }
  }

  private _invalidateViewCaches(): void {
    for (const cache of this._viewCaches) cache.valid = false;
  }

  private _batchForRecipeId(assetRecipeId: string | undefined): TreeRecipeBatches {
    return this._batches[this._recipeIndex(assetRecipeId)]!;
  }

  private _recipeIndex(assetRecipeId: string | undefined): number {
    if (!assetRecipeId) throw new RangeError("Seed World exact tree instance is missing its authored asset recipe");
    const recipeIndex = this._recipeIndexById.get(assetRecipeId);
    if (recipeIndex === undefined) throw new RangeError(`Seed World tree recipe "${assetRecipeId}" is not loaded`);
    return recipeIndex;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._registration.unregister();
    for (const playback of [...this._entrancePlaybacks]) {
      this._settleEntrance(playback, new Error("Seed World tree renderer was destroyed during entrance playback"));
    }
    this._cells = [];
    this._lodCounts.fill(0);
    this._entranceByInstanceId.clear();
    for (const batches of this._batches) disposeProceduralTreeRecipeBatches(batches);
    this._owner.destroy();
  }

  private _createRecipeBatches(
    engine: Engine,
    profile: ProceduralTreeRuntimeAuthoringProfile,
    capacity: number,
    renderBounds: BoundingBox
  ): TreeRecipeBatches {
    const recipe = profile.recipe;
    const root = this._owner.createChild(`${recipe.label} complete-tree LOD`);
    const sapling = resolveSaplingTreeParameters(recipe);
    const runtime = recipe.proceduralRuntime!;
    const foliageTuning = {
      ...createProceduralTreeFoliageGeometryTuning(profile.leafCardTuning, profile.billboardTuning),
      lodScales: runtime.foliageLodScales
    };
    const proceduralLods = createProceduralTreeMeshesForLods(
      engine,
      recipe,
      SEED_WORLD_TREE_SOURCE_LOD_INDICES,
      profile.leafCountTuning,
      profile.distributionTuning,
      foliageTuning,
      runtime.triangleBudget
    );
    const variations = profile.variations;
    const gpuVariation = variations.length > 1;
    const windScaleCompensation = resolveProceduralTreeWindScaleCompensation(
      variations.map(
        (variation) => [variation.horizontalScale, variation.verticalScale, variation.horizontalScale] as const
      )
    );
    for (const lod of proceduralLods) {
      expandProceduralTreeWindBounds(lod.trunk, 0, windScaleCompensation);
      expandProceduralTreeWindBounds(
        lod.crown,
        resolveProceduralTreeLeafFlutterRadius(lod.leafGpuFrames, lod.leafGpuFrameScale),
        windScaleCompensation
      );
    }
    const baseTrunkBounds = proceduralLods.map((lod) => detachBoundingBox(lod.trunk.bounds));
    const baseCrownBounds = proceduralLods.map((lod) => detachBoundingBox(lod.crown.bounds));
    for (let lodIndex = 0; lodIndex < proceduralLods.length; lodIndex++) {
      const lod = proceduralLods[lodIndex]!;
      lod.trunk.bounds = createInstancedBirchVariationLocalBounds(baseTrunkBounds[lodIndex]!, variations);
      lod.crown.bounds = createInstancedBirchVariationLocalBounds(baseCrownBounds[lodIndex]!, variations);
    }
    const ownedProceduralMeshes = proceduralLods.flatMap((lod) => [lod.trunk, lod.crown]);
    let ownedLeafGpuData: ProceduralTreeLeafGpuData | null = null;
    const ownedMaterials: Material[] = [];
    const lods: ProceduralTreeLodBatch[] = [];
    try {
      ownedLeafGpuData = new ProceduralTreeLeafGpuData(
        engine,
        proceduralLods[0].leafGpuFrames,
        `${recipe.label} Seed World population`,
        proceduralLods[0].leafNormalField
      );
      const trunkMaterial = createProceduralBarkPbrMaterial(recipe.trunkMaterial, proceduralLods[0].generatedHeight);
      if (profile.trunkMaterialTuning) configureTrunkMaterialTuning(trunkMaterial, profile.trunkMaterialTuning);
      const leafMaterial = createProceduralLeafPbrMaterial(
        recipe.leafMaterial,
        profile.leafMask,
        proceduralLods[0].generatedHeight,
        runtime.preserveLeafMaterialFeatures ?? false,
        DEFAULT_PROCEDURAL_TREE_CANOPY_OCCLUSION_TUNING
      );
      configureLeafLightingTuning(leafMaterial, profile.leafLightingTuning);
      leafMaterial.shaderData.setFloat(MATERIAL_PROCEDURAL_TREE_LEAF_TONE_VARIATION, sapling.leafToneVariation);
      configureTrunkVerticalGradientBounds(
        trunkMaterial,
        Math.min(...proceduralLods.map((lod) => lod.trunk.bounds.min.y)),
        Math.max(...proceduralLods.map((lod) => lod.trunk.bounds.max.y))
      );
      bindSeedWorldProceduralTreeVariationCatalog(trunkMaterial, leafMaterial, variations);
      ownedMaterials.push(trunkMaterial, leafMaterial);
      for (let lodIndex = 0; lodIndex < proceduralLods.length; lodIndex++) {
        const proceduralLod = proceduralLods[lodIndex]!;
        const views: ProceduralTreeViewBatch[] = [];
        try {
          for (let viewIndex = 0; viewIndex < POPULATION_RENDER_VIEW_COUNT; viewIndex++) {
            views.push(
              createProceduralTreeViewBatch(
                engine,
                root,
                `LOD${lodIndex} view${viewIndex}`,
                proceduralLod.trunk,
                proceduralLod.crown,
                trunkMaterial,
                leafMaterial,
                capacity,
                renderBounds,
                runtime.leafCardFacingMode === "camera-facing",
                gpuVariation,
                ownedLeafGpuData,
                proceduralLod.leafGpuFrameScale
              )
            );
          }
          lods.push({
            trunkSourceMesh: proceduralLod.trunk,
            crownSourceMesh: proceduralLod.crown,
            views,
            visible: {
              cells: new Array(Math.max(1, capacity)),
              stateOffsets: new Uint32Array(Math.max(1, capacity)),
              partMasks: new Uint8Array(Math.max(1, capacity))
            }
          });
        } catch (error) {
          views.forEach(disposeProceduralTreeViewBatch);
          throw error;
        }
      }
      const variationLocalBounds = createProceduralTreeVariationLocalBounds(
        baseTrunkBounds,
        baseCrownBounds,
        variations
      );
      return {
        recipe,
        sourceLodIndices: SEED_WORLD_TREE_SOURCE_LOD_INDICES,
        lodDefinition: new TerrainLodGroupRuntime(
          {
            fadeMode: "CrossFade",
            animateCrossFading: true,
            localReferencePoint: [...profile.lodGroup.localReferencePoint],
            size: profile.lodGroup.size,
            lods: resolveSeedWorldTreeTransitionHeights(profile.lodGroup.screenRelativeTransitionHeights).map(
              (screenRelativeTransitionHeight) => ({ screenRelativeTransitionHeight })
            )
          },
          SEED_WORLD_POPULATION_RUNTIME_PROFILE.tree.crossFadeSeconds
        ),
        lods,
        variations,
        baseTrunkBounds,
        baseCrownBounds,
        variationLocalBounds,
        sizeScale: profile.sizeScale,
        trunkMaterial,
        leafMaterial,
        worldBounds: renderBounds,
        ownedProceduralMeshes,
        ownedMaterials,
        ownedLeafGpuData
      };
    } catch (error) {
      for (const lod of lods) lod.views.forEach(disposeProceduralTreeViewBatch);
      ownedProceduralMeshes.forEach((mesh) => mesh.destroy());
      ownedMaterials.forEach((material) => material.destroy());
      ownedLeafGpuData?.destroy();
      root.destroy();
      throw error;
    }
  }
}

class SeedWorldShrubLodRenderer implements RenderViewCullingSource {
  private readonly _pickIds = new Map<PrefabInstanceViewBatch, string[]>();

  visitPickBatches(
    visitor: (renderer: MeshRenderer, ids: readonly string[], start: number, count: number) => void
  ): void {
    if (this._destroyed || !this._owner.isActiveInHierarchy) return;
    for (let i = 0; i < this._batches.length; i++) {
      const batch = this._batches[i]![POPULATION_CAMERA_VIEW_INDEX]!;
      const ids = this._pickIds.get(batch);
      if (ids && batch.count > 0) visitor(batch.renderer, ids, 0, batch.count);
    }
  }
  private readonly _camera: Camera;
  private readonly _owner: Entity;
  private readonly _lodDefinition: TerrainLodGroupRuntime;
  private readonly _profile: ProductionLodGroupProfile;
  private readonly _batches: readonly (readonly PrefabInstanceViewBatch[])[];
  private readonly _viewCaches = createPopulationViewCaches();
  private readonly _registration: RenderViewCullingSourceRegistration;
  private readonly _lodCounts = new Uint32Array(2);
  private readonly _visibleObservation = { timeSeconds: 0, visible: true as const, screenRelativeHeight: 0 };
  private readonly _lodRendererSetScratch = createTerrainLodRendererSetScratch();
  private readonly _worldBoundsScratch = new BoundingBox(new Vector3(), new Vector3());
  private readonly _instanceRevealMacro = ShaderMacro.getByName("RENDERER_INSTANCE_GENERATION_REVEAL");
  private _entrance?: SeedWorldTreeEntrancePlayback;
  private _revealRevision = 0;
  private _cells: readonly SeedWorldResidentPopulationCell<SparsePopulationCellResource>[] = [];
  private _elapsedSeconds = 0;
  private _lodStateEpoch = 0;
  private _projectionScale = 0;
  private _tuning!: TerrainLodRendererTuning;
  private _transitionActive = false;
  private _destroyed = false;

  get lodCounts(): readonly [number, number] {
    return [this._lodCounts[0], this._lodCounts[1]];
  }

  get transitionActive(): boolean {
    return this._transitionActive;
  }

  /** All view carriers share the same entrance timeline without joining generic scene traversal. */
  get entranceRenderers(): readonly MeshRenderer[] {
    return this._batches.flatMap((views) => views.map((batch) => batch.renderer));
  }

  /** Reveals only the newly published stable shrub identities in the existing LOD/view batches. */
  playEntrance(instanceIds: ReadonlySet<string>, durationMs: number, signal?: AbortSignal): Promise<void> {
    if (this._destroyed) throw new Error("Seed World shrub renderer is destroyed");
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new RangeError("Seed World shrub entrance duration must be positive and finite");
    }
    signal?.throwIfAborted();
    if (instanceIds.size === 0) return Promise.resolve();
    if (this._entrance) throw new Error("Seed World shrubs already own an active entrance");
    return new Promise<void>((resolve, reject) => {
      let playback!: SeedWorldTreeEntrancePlayback;
      const abort = (): void =>
        this._settleEntrance(
          playback,
          signal?.reason ?? new DOMException("Seed World shrub entrance aborted", "AbortError")
        );
      playback = {
        instanceIds: new Set(instanceIds),
        durationSeconds: durationMs / 1_000,
        startedAtSeconds: this._elapsedSeconds,
        ...(signal ? { signal } : {}),
        abort,
        resolve,
        reject,
        progress: 0,
        settled: false
      };
      this._entrance = playback;
      this._revealRevision++;
      try {
        this._setEntranceProgress(0);
        signal?.addEventListener("abort", abort, { once: true });
      } catch (error) {
        this._settleEntrance(playback, error);
      }
    });
  }

  /** Advances the shared timeline through uniforms; immutable per-instance membership needs no frame upload. */
  advanceEntrances(elapsedSeconds: number): void {
    this._elapsedSeconds = elapsedSeconds;
    const playback = this._entrance;
    if (!playback) return;
    const progress = Math.min(1, Math.max(0, (elapsedSeconds - playback.startedAtSeconds) / playback.durationSeconds));
    if (progress >= 1) {
      this._settleEntrance(playback);
    } else if (!Object.is(playback.progress, progress)) {
      playback.progress = progress;
      this._setEntranceProgress(progress);
    }
  }

  private _setEntranceProgress(progress: number): void {
    for (const views of this._batches) {
      for (const batch of views) {
        batch.renderer.shaderData.enableMacro(this._instanceRevealMacro);
        // The appended instance attribute owns the actual height interval, including across LOD changes.
        setRendererAssetEntranceProgressValues(batch.renderer, progress, 0, 1);
      }
    }
  }

  private _settleEntrance(playback: SeedWorldTreeEntrancePlayback, error?: unknown): void {
    if (playback.settled) return;
    playback.settled = true;
    playback.signal?.removeEventListener("abort", playback.abort);
    if (this._entrance === playback) this._entrance = undefined;
    this._revealRevision++;
    for (const views of this._batches) {
      for (const batch of views) {
        settleRendererAssetEntranceEffect(batch.renderer);
        batch.renderer.shaderData.disableMacro(this._instanceRevealMacro);
      }
    }
    error === undefined ? playback.resolve() : playback.reject(error);
  }

  constructor(
    engine: Engine,
    camera: Camera,
    root: Entity,
    sourceLibrary: AssetAssemblySourceLibrary,
    fields: SeedWorldFields,
    populationLayout: SeedWorldPopulationPreview
  ) {
    this._camera = camera;
    this._profile = sourceLibrary.shrub.lodGroup;
    this._lodDefinition = new TerrainLodGroupRuntime(
      {
        fadeMode: "CrossFade",
        animateCrossFading: true,
        localReferencePoint: [...this._profile.localReferencePoint],
        size: this._profile.size,
        lods: this._profile.screenRelativeTransitionHeights.map((screenRelativeTransitionHeight) => ({
          screenRelativeTransitionHeight
        }))
      },
      SEED_WORLD_POPULATION_RUNTIME_PROFILE.shrub.crossFadeSeconds
    );
    this._owner = root.createChild("Seed World whole-shrub authored LOD batches");
    const capacity = populationLayout.treeInstances.reduce(
      (count, instance) => count + (instance.category === "shrub" ? 1 : 0),
      0
    );
    const bounds = worldBounds(fields);
    const batches: PrefabInstanceViewBatch[][] = [];
    try {
      for (let lodIndex = 0; lodIndex < sourceLibrary.shrub.lods.length; lodIndex++) {
        const views: PrefabInstanceViewBatch[] = [];
        batches.push(views);
        for (let viewIndex = 0; viewIndex < POPULATION_RENDER_VIEW_COUNT; viewIndex++) {
          views.push(
            createPrefabInstanceViewBatch(
              engine,
              this._owner,
              `complete shrub LOD${lodIndex} view${viewIndex}`,
              {
                ...sourceLibrary.shrub.lods[lodIndex]!.renderer,
                ...SEED_WORLD_POPULATION_RUNTIME_PROFILE.shrub.shadows
              },
              capacity,
              bounds,
              true,
              true
            )
          );
        }
        // Retain identity storage across culls; batch.count defines the active prefix.
        this._pickIds.set(views[POPULATION_CAMERA_VIEW_INDEX]!, new Array<string>(capacity));
      }
      this._batches = batches;
      this._registration = camera.registerRenderViewCullingSource(this);
    } catch (error) {
      for (const views of batches) {
        for (const batch of views) {
          disposePrefabInstanceViewBatch(batch);
        }
      }
      this._owner.destroy();
      throw error;
    }
  }

  createLodInstance(): TerrainLodGroupInstance {
    return this._lodDefinition.createInstance();
  }

  createCellStaticData(instances: readonly SeedWorldGroundedPopulationInstance[]): ShrubCellStaticData {
    const count = instances.length;
    const data: ShrubCellStaticData = {
      shrubProjectionData: new Float64Array(count * STATIC_PROJECTION_FLOATS),
      shrubInstanceData: new Float32Array(count * TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS),
      shrubWorldBoundsData: new Float32Array(count * POPULATION_WORLD_BOUNDS_FLOATS),
      shrubLodWorldBoundsData: new Float32Array(count * this._batches.length * POPULATION_WORLD_BOUNDS_FLOATS),
      shrubBounds: new BoundingBox(new Vector3(), new Vector3()),
      shrubLodStateCounts: new Uint8Array(count),
      shrubLodStateIndices: new Uint8Array(count * POPULATION_LOD_STATE_CAPACITY),
      shrubLodStateFades: new Float32Array(count * POPULATION_LOD_STATE_CAPACITY),
      shrubLodStateEpochs: new Uint32Array(count),
      shrubCameraCandidateEpochs: new Uint32Array(count)
    };
    this.refreshCellStaticData(data, instances);
    return data;
  }

  refreshCellStaticData(data: ShrubCellStaticData, instances: readonly SeedWorldGroundedPopulationInstance[]): void {
    if (data.shrubLodStateEpochs.length !== instances.length) {
      throw new Error("Seed World shrub Cell storage does not match its instance identities");
    }
    data.shrubProjectionData.set(createStaticProjectionData(instances, () => this._profile));
    const bounds = data.shrubBounds;
    bounds.min.set(Infinity, Infinity, Infinity);
    bounds.max.set(-Infinity, -Infinity, -Infinity);
    for (let index = 0; index < instances.length; index++) {
      writeSeedWorldShrubInstanceRecord(data.shrubInstanceData, index, instances[index]!);
      const recordOffset = index * TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS;
      const records = data.shrubInstanceData;
      let maximumRadius = 0;
      for (let lodIndex = 0; lodIndex < this._batches.length; lodIndex++) {
        const localBounds = this._batches[lodIndex]![0]!.sourceMesh.bounds;
        // Ground wind rotates scaled vertices around the instance origin, preserving this radius
        const radius = Math.hypot(
          Math.max(Math.abs(localBounds.min.x), Math.abs(localBounds.max.x)) * records[recordOffset + 8]!,
          Math.max(Math.abs(localBounds.min.y), Math.abs(localBounds.max.y)) * records[recordOffset + 9]!,
          Math.max(Math.abs(localBounds.min.z), Math.abs(localBounds.max.z)) * records[recordOffset + 10]!
        );
        maximumRadius = Math.max(maximumRadius, radius);
        writeShrubWindBounds(
          data.shrubLodWorldBoundsData,
          index * this._batches.length + lodIndex,
          records,
          recordOffset,
          radius
        );
      }
      writeShrubWindBounds(data.shrubWorldBoundsData, index, records, recordOffset, maximumRadius);
      extendPopulationWorldBounds(bounds, data.shrubWorldBoundsData, index);
    }
    if (instances.length === 0) {
      bounds.min.set(0, 0, 0);
      bounds.max.set(0, 0, 0);
    }
    data.shrubLodStateEpochs.fill(0);
    data.shrubCameraCandidateEpochs.fill(0);
    for (const cache of this._viewCaches) {
      cache.valid = false;
    }
  }

  ensureCapacity(populationLayout: SeedWorldPopulationPreview): void {
    const capacity = populationLayout.treeInstances.reduce(
      (count, instance) => count + (instance.category === "shrub" ? 1 : 0),
      0
    );
    for (const views of this._batches) {
      for (const batch of views) {
        ensurePrefabInstanceViewBatchCapacity(batch, capacity);
      }
    }
    for (const cache of this._viewCaches) {
      cache.valid = false;
    }
  }

  update(
    cells: readonly SeedWorldResidentPopulationCell<SparsePopulationCellResource>[],
    camera: Camera,
    frustum: BoundingFrustum,
    elapsedSeconds: number,
    tuning: TerrainLodRendererTuning,
    terrainOcclusionCuller: SeedWorldTerrainOcclusionCuller
  ): void {
    this._cells = cells;
    this._elapsedSeconds = elapsedSeconds;
    this._projectionScale = cameraVerticalProjectionScale(camera);
    this._tuning = tuning;
    this._transitionActive = false;
    this._lodStateEpoch = (this._lodStateEpoch + 1) >>> 0;
    if (this._lodStateEpoch === 0) {
      this._lodStateEpoch = 1;
      for (const cell of cells) {
        cell.resource.shrubLodStateEpochs.fill(0);
        cell.resource.shrubCameraCandidateEpochs.fill(0);
      }
    }
    const occlusionQueryable = terrainOcclusionCuller.horizonQueryableThisFrame;
    for (const cell of cells) {
      const count = cell.data.instances.shrub.length;
      if (count === 0 || (camera.enableFrustumCulling && !frustum.intersectsBox(cell.resource.shrubBounds))) {
        continue;
      }
      if (occlusionQueryable && terrainOcclusionCuller.isOccluded(cell.data.id, cell.resource.shrubBounds, count)) {
        continue;
      }
      if (occlusionQueryable && count >= SPARSE_OCCLUSION_SUBCELL_MINIMUM_INSTANCES) {
        for (const subCell of cell.resource.shrubSubCells) {
          if (
            terrainOcclusionCuller.isSubCellOccluded(
              subCell.occlusionKey,
              subCell.bounds,
              subCell.instanceIndices.length
            )
          ) {
            continue;
          }
          for (const index of subCell.instanceIndices) {
            cell.resource.shrubCameraCandidateEpochs[index] = this._lodStateEpoch;
          }
        }
      } else {
        if (occlusionQueryable) {
          terrainOcclusionCuller.retainVisibleRenderers(count);
        }
        cell.resource.shrubCameraCandidateEpochs.fill(this._lodStateEpoch);
      }
    }
  }

  cull(context: RenderViewCullingContext): void {
    if (
      context.viewType === RenderViewType.ShadowCascade &&
      !SEED_WORLD_POPULATION_RUNTIME_PROFILE.shrub.shadows.castShadows
    )
      return;
    if (this._destroyed || context.camera !== this._camera || !this._lodStateEpoch) {
      return;
    }
    const viewIndex =
      context.viewType === RenderViewType.Camera ? POPULATION_CAMERA_VIEW_INDEX : context.shadowCascadeIndex + 1;
    if (viewIndex < 0 || viewIndex >= POPULATION_RENDER_VIEW_COUNT) {
      return;
    }
    const cache = this._viewCaches[viewIndex]!;
    if (populationViewCacheMatches(cache, context, this._lodStateEpoch, this._revealRevision)) {
      if (this._owner.isActiveInHierarchy) {
        for (const views of this._batches) {
          const batch = views[viewIndex]!;
          if (batch.count > 0) {
            context.submit(batch.renderer);
          }
        }
      }
      return;
    }
    for (const views of this._batches) {
      const batch = views[viewIndex]!;
      batch.count = 0;
      batch.dirtyFloatStart = Infinity;
      batch.dirtyFloatEnd = 0;
    }
    if (this._owner.isActiveInHierarchy) {
      for (const cell of this._cells) {
        if (!cell.data.instances.shrub.length) {
          continue;
        }
        const containment = context.classifyBounds(cell.resource.shrubBounds);
        if (containment === ContainmentType.Disjoint) {
          continue;
        }
        const fullyContained = containment === ContainmentType.Contains;
        for (let index = 0; index < cell.data.instances.shrub.length; index++) {
          if (
            viewIndex === POPULATION_CAMERA_VIEW_INDEX &&
            cell.resource.shrubCameraCandidateEpochs[index] !== this._lodStateEpoch
          ) {
            continue;
          }
          if (!fullyContained) {
            readPopulationWorldBounds(cell.resource.shrubWorldBoundsData, index, this._worldBoundsScratch);
            if (!context.isVisible(this._worldBoundsScratch)) {
              continue;
            }
          }
          this._resolveLodStates(cell, index);
          const stateOffset = index * POPULATION_LOD_STATE_CAPACITY;
          for (let stateIndex = 0; stateIndex < cell.resource.shrubLodStateCounts[index]!; stateIndex++) {
            const offset = stateOffset + stateIndex;
            const lodIndex = cell.resource.shrubLodStateIndices[offset]!;
            const batch = this._batches[lodIndex]![viewIndex]!;
            if (context.viewType === RenderViewType.ShadowCascade && !batch.renderer.castShadows) {
              continue;
            }
            if (!fullyContained) {
              readPopulationWorldBounds(
                cell.resource.shrubLodWorldBoundsData,
                index * this._batches.length + lodIndex,
                this._worldBoundsScratch
              );
              if (!context.isVisible(this._worldBoundsScratch)) {
                continue;
              }
            }
            if (viewIndex === POPULATION_CAMERA_VIEW_INDEX)
              this._pickIds.get(batch)![batch.count] = cell.data.instances.shrub[index]!.producerInstance.id;
            appendPrefabInstance(
              batch,
              cell.resource.shrubInstanceData,
              index,
              cell.resource.shrubLodStateFades[offset]!,
              this._entrance?.instanceIds.has(cell.data.instances.shrub[index]!.producerInstance.id) ?? false
            );
          }
        }
      }
    }
    for (let lodIndex = 0; lodIndex < this._batches.length; lodIndex++) {
      const batch = this._batches[lodIndex]![viewIndex]!;
      publishPrefabInstanceViewBatch(batch);
      if (viewIndex === POPULATION_CAMERA_VIEW_INDEX) {
        this._lodCounts[lodIndex] = batch.count;
      }
      if (batch.count > 0) {
        context.submit(batch.renderer);
      }
    }
    capturePopulationViewCache(cache, context, this._lodStateEpoch, this._revealRevision);
  }

  private _resolveLodStates(cell: SeedWorldResidentPopulationCell<SparsePopulationCellResource>, index: number): void {
    const resource = cell.resource;
    if (resource.shrubLodStateEpochs[index] === this._lodStateEpoch) {
      return;
    }
    const offset = index * STATIC_PROJECTION_FLOATS;
    const distance = staticProjectionDistance(
      resource.shrubProjectionData,
      offset,
      this._camera.entity.transform.worldPosition
    );
    const observation = this._visibleObservation;
    observation.timeSeconds = this._elapsedSeconds;
    observation.screenRelativeHeight = this._tuning.enabled
      ? resource.shrubProjectionData[offset + 3]! *
        this._projectionScale *
        this._tuning.distanceScale *
        (this._camera.isOrthographic ? 1 : 1 / Math.max(distance, Number.EPSILON))
      : Number.MAX_SAFE_INTEGER;
    // A settled terminal LOD has no fade to advance while it remains beyond the authored cutoff
    if (
      resource.shrubLodStateEpochs[index] !== 0 &&
      resource.shrubLodStateCounts[index] === 0 &&
      observation.screenRelativeHeight < this._profile.screenRelativeTransitionHeights[this._batches.length - 1]!
    ) {
      resource.shrubLodStateEpochs[index] = this._lodStateEpoch;
      return;
    }
    const states = resource.shrubLodInstances[index]!.updateInto(observation, this._lodRendererSetScratch);
    resource.shrubLodStateCounts[index] = states.length;
    resource.shrubLodStateEpochs[index] = this._lodStateEpoch;
    const stateOffset = index * POPULATION_LOD_STATE_CAPACITY;
    for (let stateIndex = 0; stateIndex < states.length; stateIndex++) {
      const state = states[stateIndex]!;
      if (state.crossFading) {
        this._transitionActive = true;
      }
      resource.shrubLodStateIndices[stateOffset + stateIndex] = state.lodIndex;
      resource.shrubLodStateFades[stateOffset + stateIndex] = state.signedFade;
    }
  }

  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    if (this._entrance) {
      this._settleEntrance(
        this._entrance,
        new Error("Seed World shrub renderer was destroyed during entrance playback")
      );
    }
    this._registration.unregister();
    this._pickIds.clear();
    this._cells = [];
    this._lodCounts.fill(0);
    for (const views of this._batches) {
      for (const batch of views) {
        disposePrefabInstanceViewBatch(batch);
      }
    }
    this._owner.destroy();
  }
}

function writeShrubWindBounds(
  boundsData: Float32Array,
  index: number,
  records: Float32Array,
  recordOffset: number,
  radius: number
): void {
  const offset = index * POPULATION_WORLD_BOUNDS_FLOATS;
  const x = records[recordOffset]!;
  const y = records[recordOffset + 1]!;
  const z = records[recordOffset + 2]!;
  // Include the entrance displacement as well as every ground-wind rotation
  boundsData[offset] = x - radius;
  boundsData[offset + 1] = y - radius - ASSET_ENTRANCE_LIFT_METRES;
  boundsData[offset + 2] = z - radius;
  boundsData[offset + 3] = x + radius;
  boundsData[offset + 4] = y + radius + ASSET_ENTRANCE_LIFT_METRES;
  boundsData[offset + 5] = z + radius;
}

function refreshSparsePopulationSubCellWorldBounds(
  subCells: readonly SparsePopulationSubCell[],
  boundsData: Float32Array
): void {
  for (const subCell of subCells) {
    subCell.bounds.min.set(Infinity, Infinity, Infinity);
    subCell.bounds.max.set(-Infinity, -Infinity, -Infinity);
    for (const index of subCell.instanceIndices) {
      extendPopulationWorldBounds(subCell.bounds, boundsData, index);
    }
  }
}

function createProceduralTreeViewBatch(
  engine: Engine,
  root: Entity,
  name: string,
  trunkSourceMesh: ModelMesh,
  crownSourceMesh: ModelMesh,
  trunkMaterial: Material,
  leafMaterial: Material,
  capacity: number,
  bounds: BoundingBox,
  cameraFacingLeaves: boolean,
  gpuVariation: boolean,
  leafGpuData: ProceduralTreeLeafGpuData,
  leafGpuFrameScale: ProceduralTreeLeafGpuFrameScale
): ProceduralTreeViewBatch {
  const batchRoot = root.createChild(name);
  const resolvedCapacity = Math.max(1, capacity);
  let storage: TreeAssemblyInstanceStorage | undefined;
  let trunkResources: TreeAssemblyInstancedMesh | undefined;
  let crownResources: TreeAssemblyInstancedMesh | undefined;
  try {
    storage = createTreeAssemblyInstanceStorage(engine, resolvedCapacity, TREE_ASSEMBLY_INSTANCE_FLOATS);
    trunkResources = createTreeAssemblyInstancedMesh(
      engine,
      trunkSourceMesh,
      resolvedCapacity,
      bounds,
      `${name} trunk`,
      storage
    );
    crownResources = createTreeAssemblyInstancedMesh(
      engine,
      crownSourceMesh,
      resolvedCapacity,
      bounds,
      `${name} crown`,
      storage
    );
    const trunkRenderer = batchRoot.createChild("trunk").addComponent(MeshRenderer);
    const crownRenderer = batchRoot.createChild("crown").addComponent(MeshRenderer);
    configureProceduralTreeViewRenderer(trunkRenderer, trunkResources.mesh, trunkMaterial, false, false, gpuVariation);
    configureProceduralTreeViewRenderer(
      crownRenderer,
      crownResources.mesh,
      leafMaterial,
      true,
      cameraFacingLeaves,
      gpuVariation
    );
    leafGpuData.bind(crownRenderer, leafGpuFrameScale);
    return {
      root: batchRoot,
      trunkRenderer,
      crownRenderer,
      instanceIds: [],
      trunkResources,
      crownResources,
      crownVertexElements: [...crownResources.mesh.vertexElements],
      storage,
      capacity: resolvedCapacity,
      count: 0,
      trunkCount: 0,
      crownCount: 0,
      gpuInitializedRecordCount: 0,
      dirtyFloatStart: Number.POSITIVE_INFINITY,
      dirtyFloatEnd: 0,
      revealRequired: false,
      revealEnabled: false,
      destroyed: false
    };
  } catch (error) {
    trunkResources?.mesh.destroy();
    crownResources?.mesh.destroy();
    storage?.instanceBuffer.destroy(true);
    batchRoot.destroy();
    throw error;
  }
}

function configureProceduralTreeViewRenderer(
  renderer: MeshRenderer,
  mesh: BufferMesh,
  material: Material,
  leafCards: boolean,
  cameraFacingLeaves: boolean,
  gpuVariation: boolean
): void {
  renderer.mesh = mesh;
  renderer.setMaterial(material);
  renderer.castShadows = SEED_WORLD_POPULATION_RUNTIME_PROFILE.tree.shadows.castShadows;
  renderer.receiveShadows = SEED_WORLD_POPULATION_RUNTIME_PROFILE.tree.shadows.receiveShadows;
  renderer.enableVertexColor = true;
  renderer.shaderData.enableMacro(INSTANCE_MACRO);
  renderer.shaderData.enableMacro(PROCEDURAL_TREE_VARIATION_CATALOG_MACRO);
  renderer.shaderData.enableMacro(LOD_DITHER_MACRO);
  renderer.shaderData.setFloat(REVEAL_LIFT, ASSET_ENTRANCE_LIFT_METRES);
  if (leafCards) {
    if (cameraFacingLeaves) renderer.shaderData.enableMacro(PROCEDURAL_TREE_LEAF_BILLBOARD_MACRO);
  } else {
    renderer.shaderData.enableMacro(PROCEDURAL_TREE_BARK_UV_SCALE_MACRO);
  }
  if (gpuVariation) {
    renderer.shaderData.enableMacro(PROCEDURAL_TREE_GPU_VARIATION_MACRO);
    if (!leafCards) renderer.shaderData.enableMacro(PROCEDURAL_TREE_GPU_BRANCH_VARIATION_MACRO);
  }
  renderer.enabled = false;
}

/** Packs the fixed per-species tree styles once instead of repeating them in every Renderer instance record. */
export function createSeedWorldProceduralTreeVariationCatalog(
  variations: readonly InstancedBirchPopulationVariation[]
): SeedWorldProceduralTreeVariationCatalog {
  if (variations.length === 0 || variations.length > PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY) {
    throw new RangeError(
      `Seed World procedural-tree variation catalogs require 1-${PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY} entries`
    );
  }
  const variation = new Float32Array(PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY * 4);
  const branchShape = new Float32Array(PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY * 4);
  const barkColor = new Float32Array(PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY * 4);
  const leafColor = new Float32Array(PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY * 4);
  for (let index = 0; index < PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY; index++) {
    const source = variations[Math.min(index, variations.length - 1)]!;
    const offset = index * 4;
    variation.set(
      [source.branchLengthScale, source.leafDensity, source.leafSizeScale, source.branchDirectionSeed],
      offset
    );
    branchShape.set(
      [source.branchCurvatureRadiansPerMeter, source.branchDensity, source.trunkThicknessScale, 0],
      offset
    );
    barkColor.set([...source.barkColorMultiplier, 1], offset);
    leafColor.set(
      [
        srgb8ToLinear(source.leafColorRgb[0]),
        srgb8ToLinear(source.leafColorRgb[1]),
        srgb8ToLinear(source.leafColorRgb[2]),
        1
      ],
      offset
    );
  }
  return { variation, branchShape, barkColor, leafColor };
}

function bindSeedWorldProceduralTreeVariationCatalog(
  trunkMaterial: Material,
  leafMaterial: Material,
  variations: readonly InstancedBirchPopulationVariation[]
): void {
  const catalog = createSeedWorldProceduralTreeVariationCatalog(variations);
  // Editing a catalog only updates shape values. AI presentation owns dissolve macros.
  for (const material of [trunkMaterial, leafMaterial]) {
    material.shaderData.setFloatArray(MATERIAL_PROCEDURAL_TREE_VARIATION_CATALOG, catalog.variation);
    material.shaderData.setFloatArray(MATERIAL_PROCEDURAL_TREE_BRANCH_SHAPE_CATALOG, catalog.branchShape);
  }
  trunkMaterial.shaderData.setFloatArray(MATERIAL_PROCEDURAL_TREE_COLOR_CATALOG, catalog.barkColor);
  leafMaterial.shaderData.setFloatArray(MATERIAL_PROCEDURAL_TREE_COLOR_CATALOG, catalog.leafColor);
}

function ensureProceduralTreeViewBatchCapacity(
  engine: Engine,
  batch: ProceduralTreeViewBatch,
  trunkSourceMesh: ModelMesh,
  crownSourceMesh: ModelMesh,
  bounds: BoundingBox,
  requestedCapacity: number
): void {
  if (batch.destroyed) throw new Error("Procedural tree view batch is destroyed");
  if (!Number.isInteger(requestedCapacity) || requestedCapacity < 0) {
    throw new RangeError("Procedural tree view capacity must be a non-negative integer");
  }
  if (requestedCapacity <= batch.capacity) return;
  const nextCapacity = Math.max(requestedCapacity, batch.capacity * 2);
  let storage: TreeAssemblyInstanceStorage | undefined;
  let trunkResources: TreeAssemblyInstancedMesh | undefined;
  let crownResources: TreeAssemblyInstancedMesh | undefined;
  try {
    storage = createTreeAssemblyInstanceStorage(engine, nextCapacity, TREE_ASSEMBLY_INSTANCE_FLOATS);
    trunkResources = createTreeAssemblyInstancedMesh(
      engine,
      trunkSourceMesh,
      nextCapacity,
      bounds,
      `${batch.root.name} trunk`,
      storage
    );
    crownResources = createTreeAssemblyInstancedMesh(
      engine,
      crownSourceMesh,
      nextCapacity,
      bounds,
      `${batch.root.name} crown`,
      storage
    );
  } catch (error) {
    trunkResources?.mesh.destroy();
    crownResources?.mesh.destroy();
    storage?.instanceBuffer.destroy(true);
    throw error;
  }

  const previousStorage = batch.storage;
  const previousTrunk = batch.trunkResources;
  const previousCrown = batch.crownResources;
  batch.storage = storage;
  batch.trunkResources = trunkResources;
  batch.crownResources = crownResources;
  batch.crownVertexElements = [...crownResources.mesh.vertexElements];
  batch.capacity = nextCapacity;
  batch.count = 0;
  batch.trunkCount = 0;
  batch.crownCount = 0;
  batch.gpuInitializedRecordCount = 0;
  batch.dirtyFloatStart = Number.POSITIVE_INFINITY;
  batch.dirtyFloatEnd = 0;
  batch.trunkRenderer.mesh = trunkResources.mesh;
  batch.crownRenderer.mesh = crownResources.mesh;
  previousTrunk.mesh.destroy();
  previousCrown.mesh.destroy();
  previousStorage.instanceBuffer.destroy(true);
}

function publishProceduralTreeViewBatch(batch: ProceduralTreeViewBatch): void {
  if (batch.destroyed) throw new Error("Procedural tree view batch is destroyed");
  setProceduralTreeViewRevealEnabled(batch, batch.revealRequired);
  uploadChangedPopulationInstances(batch.storage, batch, batch.count);
  batch.trunkResources.mesh.instanceCount = batch.trunkCount;
  batch.crownResources.mesh.instanceCount = batch.crownCount;
  if (batch.crownCount > 0) setProceduralTreeCrownInstanceStart(batch, batch.count - batch.crownCount);
}

function setProceduralTreeCrownInstanceStart(batch: ProceduralTreeViewBatch, start: number): void {
  const elements = batch.crownVertexElements;
  let byteDelta = 0;
  for (const element of elements) {
    if (element.attribute === "ASSEMBLY_POSITION") {
      byteDelta = start * TREE_ASSEMBLY_INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT - element.offset;
      break;
    }
  }
  if (byteDelta === 0) return;
  for (const element of elements) {
    if (element.instanceStepRate === 1) element.offset += byteDelta;
  }
  // Reapply the owned layout through BufferMesh so cached VAOs observe the changed instance offsets
  batch.crownResources.mesh.setVertexElements(elements);
}

function setProceduralTreeViewRevealEnabled(batch: ProceduralTreeViewBatch, enabled: boolean): void {
  if (batch.revealEnabled === enabled) return;
  batch.revealEnabled = enabled;
  for (const renderer of [batch.trunkRenderer, batch.crownRenderer]) {
    if (enabled) renderer.shaderData.enableMacro(GENERATION_REVEAL_MACRO);
    else renderer.shaderData.disableMacro(GENERATION_REVEAL_MACRO);
  }
}

function disposeProceduralTreeViewBatch(batch: ProceduralTreeViewBatch): void {
  if (batch.destroyed) return;
  batch.destroyed = true;
  batch.count = 0;
  for (const renderer of [batch.trunkRenderer, batch.crownRenderer]) {
    renderer.enabled = false;
    renderer.mesh = null!;
    renderer.setMaterials([]);
  }
  batch.trunkResources.mesh.destroy();
  batch.crownResources.mesh.destroy();
  batch.storage.instanceBuffer.destroy(true);
  batch.root.destroy();
}

function disposeProceduralTreeRecipeBatches(recipe: TreeRecipeBatches): void {
  for (const lod of recipe.lods) {
    lod.visible.cells.length = 0;
    lod.views.forEach(disposeProceduralTreeViewBatch);
  }
  recipe.ownedProceduralMeshes.forEach((mesh) => mesh.destroy());
  recipe.ownedMaterials.forEach((material) => material.destroy());
  recipe.ownedLeafGpuData.destroy();
}

/** Writes the shrub-only transform record; white tint is shared by the Material and POSITION.w carries LOD fade. */
export function writeSeedWorldShrubInstanceRecord(
  records: Float32Array,
  recordIndex: number,
  instance: SeedWorldGroundedPopulationInstance,
  signedCoverage = 1
): void {
  const offset = recordIndex * TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS;
  if (
    !Number.isInteger(recordIndex) ||
    recordIndex < 0 ||
    offset + TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS > records.length
  ) {
    throw new RangeError("Seed World shrub instance record exceeds its buffer capacity");
  }
  const { position, rotation } = instance;
  const [scaleX, scaleY, scaleZ] = instance.producerInstance.scale;
  records[offset] = position[0];
  records[offset + 1] = position[1];
  records[offset + 2] = position[2];
  records[offset + TREE_ASSEMBLY_COMPACT_LOD_FADE_FLOAT_OFFSET] = signedCoverage;
  records[offset + 4] = rotation[0];
  records[offset + 5] = rotation[1];
  records[offset + 6] = rotation[2];
  records[offset + 7] = rotation[3];
  records[offset + 8] = scaleX;
  records[offset + 9] = scaleY;
  records[offset + 10] = scaleZ;
  records[offset + 11] = 1;
}

/** Writes the compact catalog-backed tree record shared by trunk and crown view batches. */
export function writeSeedWorldCatalogTreeStaticRecord(
  records: Float32Array,
  recordIndex: number,
  instance: SeedWorldGroundedPopulationInstance,
  variation: InstancedBirchPopulationVariation,
  catalogIndex: number,
  sizeScale = 1
): void {
  const offset = recordIndex * TREE_ASSEMBLY_INSTANCE_FLOATS;
  if (!Number.isInteger(recordIndex) || recordIndex < 0 || offset + TREE_ASSEMBLY_INSTANCE_FLOATS > records.length) {
    throw new RangeError("Seed World catalog tree record exceeds its buffer capacity");
  }
  if (
    !Number.isInteger(catalogIndex) ||
    catalogIndex < 0 ||
    catalogIndex >= PROCEDURAL_TREE_VARIATION_CATALOG_CAPACITY
  ) {
    throw new RangeError("Seed World catalog tree variation index is outside the material catalog");
  }
  const transform = tunedProceduralTreeTransform(instance, variation, sizeScale);
  records[offset] = instance.position[0];
  records[offset + 1] = instance.position[1];
  records[offset + 2] = instance.position[2];
  records[offset + 3] = 1;
  records[offset + 4] = transform.rotation[0];
  records[offset + 5] = transform.rotation[1];
  records[offset + 6] = transform.rotation[2];
  records[offset + 7] = transform.rotation[3];
  records[offset + 8] = transform.scale[0];
  records[offset + 9] = transform.scale[1];
  records[offset + 10] = transform.scale[2];
  records[offset + 11] = catalogIndex;
  // Authored spatial bounds may scale axes independently; bark repeats follow trunk height.
  const verticalScale = instance.producerInstance.scale[1];
  records[offset + 12] = resolveSeedWorldProceduralTreeBarkUvScale(
    [verticalScale, verticalScale, verticalScale],
    sizeScale
  );
  records[offset + 13] = 1;
  records[offset + 14] = 0;
  records[offset + 15] = 1;
}

/** @internal Transforms one packed tree instance's conservative local Bounds without allocating a Matrix. */
export function writeSeedWorldTreeWorldBounds(
  boundsData: Float32Array,
  recordIndex: number,
  localBounds: BoundingBox,
  records: Float32Array,
  boundsRecordIndex = recordIndex
): void {
  const boundsOffset = boundsRecordIndex * POPULATION_WORLD_BOUNDS_FLOATS;
  const recordOffset = recordIndex * TREE_ASSEMBLY_INSTANCE_FLOATS;
  if (
    !Number.isInteger(recordIndex) ||
    recordIndex < 0 ||
    boundsOffset + POPULATION_WORLD_BOUNDS_FLOATS > boundsData.length ||
    recordOffset + TREE_ASSEMBLY_INSTANCE_FLOATS > records.length
  ) {
    throw new RangeError("Seed World tree Bounds record exceeds its storage capacity");
  }

  const centerX = (localBounds.min.x + localBounds.max.x) * 0.5;
  const centerY = (localBounds.min.y + localBounds.max.y) * 0.5;
  const centerZ = (localBounds.min.z + localBounds.max.z) * 0.5;
  const extentX = (localBounds.max.x - localBounds.min.x) * 0.5;
  const extentY = (localBounds.max.y - localBounds.min.y) * 0.5;
  const extentZ = (localBounds.max.z - localBounds.min.z) * 0.5;
  const rotationX = records[recordOffset + 4]!;
  const rotationY = records[recordOffset + 5]!;
  const rotationZ = records[recordOffset + 6]!;
  const rotationW = records[recordOffset + 7]!;
  const scaleX = records[recordOffset + 8]!;
  const scaleY = records[recordOffset + 9]!;
  const scaleZ = records[recordOffset + 10]!;
  const doubledX = rotationX + rotationX;
  const doubledY = rotationY + rotationY;
  const doubledZ = rotationZ + rotationZ;
  const xx = rotationX * doubledX;
  const xy = rotationX * doubledY;
  const xz = rotationX * doubledZ;
  const yy = rotationY * doubledY;
  const yz = rotationY * doubledZ;
  const zz = rotationZ * doubledZ;
  const wx = rotationW * doubledX;
  const wy = rotationW * doubledY;
  const wz = rotationW * doubledZ;
  const m00 = (1 - (yy + zz)) * scaleX;
  const m01 = (xy + wz) * scaleX;
  const m02 = (xz - wy) * scaleX;
  const m10 = (xy - wz) * scaleY;
  const m11 = (1 - (xx + zz)) * scaleY;
  const m12 = (yz + wx) * scaleY;
  const m20 = (xz + wy) * scaleZ;
  const m21 = (yz - wx) * scaleZ;
  const m22 = (1 - (xx + yy)) * scaleZ;
  const worldCenterX = records[recordOffset]! + m00 * centerX + m10 * centerY + m20 * centerZ;
  const worldCenterY = records[recordOffset + 1]! + m01 * centerX + m11 * centerY + m21 * centerZ;
  const worldCenterZ = records[recordOffset + 2]! + m02 * centerX + m12 * centerY + m22 * centerZ;
  const worldExtentX = Math.abs(m00) * extentX + Math.abs(m10) * extentY + Math.abs(m20) * extentZ;
  const worldExtentY = Math.abs(m01) * extentX + Math.abs(m11) * extentY + Math.abs(m21) * extentZ;
  const worldExtentZ = Math.abs(m02) * extentX + Math.abs(m12) * extentY + Math.abs(m22) * extentZ;
  boundsData[boundsOffset] = worldCenterX - worldExtentX;
  boundsData[boundsOffset + 1] = worldCenterY - worldExtentY;
  boundsData[boundsOffset + 2] = worldCenterZ - worldExtentZ;
  boundsData[boundsOffset + 3] = worldCenterX + worldExtentX;
  boundsData[boundsOffset + 4] = worldCenterY + worldExtentY;
  boundsData[boundsOffset + 5] = worldCenterZ + worldExtentZ;
}

/**
 * Resolves the exact LOD reference point and conservative silhouette size from the same final transform sent to GPU.
 * No nominal-height normalization is applied: Producer, persisted variation, and Token scales are multiplied once.
 */
export function createSeedWorldTunedProceduralTreeProjection(
  instance: SeedWorldGroundedPopulationInstance,
  profile: ProductionLodGroupProfile,
  variation: InstancedBirchPopulationVariation,
  sizeScale = 1
): readonly [x: number, y: number, z: number, size: number] {
  const transform = tunedProceduralTreeTransform(instance, variation, sizeScale);
  const [referenceX, referenceY, referenceZ] = profile.localReferencePoint;
  const scaleX = Math.fround(transform.scale[0]);
  const scaleY = Math.fround(transform.scale[1]);
  const scaleZ = Math.fround(transform.scale[2]);
  const localX = referenceX * scaleX;
  const localY = referenceY * scaleY;
  const localZ = referenceZ * scaleZ;
  const rotationX = Math.fround(transform.rotation[0]);
  const rotationY = Math.fround(transform.rotation[1]);
  const rotationZ = Math.fround(transform.rotation[2]);
  const rotationW = Math.fround(transform.rotation[3]);
  const doubledCrossX = 2 * (rotationY * localZ - rotationZ * localY);
  const doubledCrossY = 2 * (rotationZ * localX - rotationX * localZ);
  const doubledCrossZ = 2 * (rotationX * localY - rotationY * localX);
  return [
    Math.fround(instance.position[0]) +
      localX +
      rotationW * doubledCrossX +
      rotationY * doubledCrossZ -
      rotationZ * doubledCrossY,
    Math.fround(instance.position[1]) +
      localY +
      rotationW * doubledCrossY +
      rotationZ * doubledCrossX -
      rotationX * doubledCrossZ,
    Math.fround(instance.position[2]) +
      localZ +
      rotationW * doubledCrossZ +
      rotationX * doubledCrossY -
      rotationY * doubledCrossX,
    profile.size *
      Math.max(Math.abs(scaleX), Math.abs(scaleY), Math.abs(scaleZ)) *
      instancedBirchVariationSilhouetteScale(variation)
  ];
}

function tunedProceduralTreeTransform(
  instance: SeedWorldGroundedPopulationInstance,
  variation: InstancedBirchPopulationVariation,
  sizeScale: number
): Readonly<{
  rotation: readonly [x: number, y: number, z: number, w: number];
  scale: readonly [x: number, y: number, z: number];
}> {
  const [rotationX, rotationY, rotationZ, rotationW] = instance.rotation;
  const yawSin = Math.sin(variation.yawRadians * 0.5);
  const yawCos = Math.cos(variation.yawRadians * 0.5);
  const [scaleX, scaleY, scaleZ] = instance.producerInstance.scale;
  return {
    rotation: [
      rotationX * yawCos - rotationZ * yawSin,
      rotationW * yawSin + rotationY * yawCos,
      rotationX * yawSin + rotationZ * yawCos,
      rotationW * yawCos - rotationY * yawSin
    ],
    scale: [
      scaleX * variation.horizontalScale * sizeScale,
      scaleY * variation.verticalScale * sizeScale,
      scaleZ * variation.horizontalScale * sizeScale
    ]
  };
}

/**
 * Keeps the authored bark repeats-per-metre stable when Population changes only whole-tree size.
 * Asset Assembly's reference scale remains factor one; every Seed World Producer scale must be uniform because
 * silhouette anisotropy is already owned by the shared authored variation.
 */
export function resolveSeedWorldProceduralTreeBarkUvScale(
  producerScale: readonly [x: number, y: number, z: number],
  sizeScale = 1
): number {
  const [scaleX, scaleY, scaleZ] = producerScale;
  if (
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    !Number.isFinite(scaleZ) ||
    scaleX <= 0 ||
    scaleY <= 0 ||
    scaleZ <= 0 ||
    scaleX !== scaleY ||
    scaleZ !== scaleY
  ) {
    throw new RangeError("Seed World procedural-tree bark UV requires one finite positive uniform Producer scale");
  }
  if (!Number.isFinite(sizeScale) || sizeScale <= 0) {
    throw new RangeError("Seed World procedural-tree bark UV size scale must be finite and positive");
  }
  return (scaleY * sizeScale) / VEGETATION_AUTHORING_REFERENCE_SCALE;
}

function srgb8ToLinear(channel: number): number {
  const normalized = Math.min(255, Math.max(0, channel)) / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

const STATIC_PROJECTION_FLOATS = 4;

function createStaticProjectionData(
  instances: readonly SeedWorldGroundedPopulationInstance[],
  profileForInstance: (instance: SeedWorldGroundedPopulationInstance) => ProductionLodGroupProfile
): Float64Array {
  const data = new Float64Array(instances.length * STATIC_PROJECTION_FLOATS);
  for (let instanceIndex = 0; instanceIndex < instances.length; instanceIndex++) {
    const instance = instances[instanceIndex];
    const profile = profileForInstance(instance);
    const [scaleX, scaleY, scaleZ] = instance.producerInstance.scale;
    const [referenceX, referenceY, referenceZ] = profile.localReferencePoint;
    const [rotationX, rotationY, rotationZ, rotationW] = instance.rotation;
    const localX = referenceX * scaleX;
    const localY = referenceY * scaleY;
    const localZ = referenceZ * scaleZ;
    const doubledCrossX = 2 * (rotationY * localZ - rotationZ * localY);
    const doubledCrossY = 2 * (rotationZ * localX - rotationX * localZ);
    const doubledCrossZ = 2 * (rotationX * localY - rotationY * localX);
    const offset = instanceIndex * STATIC_PROJECTION_FLOATS;
    data[offset] =
      instance.position[0] + localX + rotationW * doubledCrossX + rotationY * doubledCrossZ - rotationZ * doubledCrossY;
    data[offset + 1] =
      instance.position[1] + localY + rotationW * doubledCrossY + rotationZ * doubledCrossX - rotationX * doubledCrossZ;
    data[offset + 2] =
      instance.position[2] + localZ + rotationW * doubledCrossZ + rotationX * doubledCrossY - rotationY * doubledCrossX;
    data[offset + 3] = profile.size * Math.max(Math.abs(scaleX), Math.abs(scaleY), Math.abs(scaleZ));
  }
  return data;
}

function staticProjectionDistance(
  projectionData: Float64Array,
  offset: number,
  cameraPosition: Readonly<{ x: number; y: number; z: number }>
): number {
  const offsetX = cameraPosition.x - projectionData[offset]!;
  const offsetY = cameraPosition.y - projectionData[offset + 1]!;
  const offsetZ = cameraPosition.z - projectionData[offset + 2]!;
  return Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ);
}

function cameraVerticalProjectionScale(camera: Camera): number {
  if (camera.isOrthographic) return 1 / (2 * camera.orthographicSize);
  return 1 / (2 * Math.tan((camera.fieldOfView * Math.PI) / 360));
}

function exactTreeRecipeCapacities(
  populationLayout: SeedWorldPopulationPreview,
  recipes: readonly TreeRecipeSource[]
): readonly number[] {
  const capacities = new Uint32Array(recipes.length);
  for (const instance of populationLayout.treeInstances) {
    if (instance.category !== "tree") continue;
    const recipeIndex = treeRecipeIndex(recipes, instance.assetRecipeId);
    capacities[recipeIndex]++;
  }
  return Array.from(capacities);
}

/**
 * Assigns trees to their recipe's catalog by stable identity, independently of population order.
 * The Population Producer continues to own every position, scale, and yaw; this renderer-only map makes
 * each tree retain its group across deletion, insertion and full reconstruction.
 */
export function createSeedWorldTreeVariationIndexMap(
  instances: readonly Pick<SeedWorldPopulationInstance, "id" | "category" | "assetRecipeId">[],
  variationCounts: number | ReadonlyMap<string, number>
): ReadonlyMap<string, number> {
  return reconcileSeedWorldTreeVariationIndexMap(instances, variationCounts);
}

/**
 * Reconciles tree variations for a new Population layout while preserving every surviving tree's visual identity.
 * New trees derive their group from identity; removed ids disappear from the map.
 */
export function reconcileSeedWorldTreeVariationIndexMap(
  instances: readonly Pick<SeedWorldPopulationInstance, "id" | "category" | "assetRecipeId">[],
  variationCounts: number | ReadonlyMap<string, number>,
  previousAssignments: ReadonlyMap<string, number> = new Map()
): ReadonlyMap<string, number> {
  if (typeof variationCounts === "number") {
    validateSeedWorldTreeVariationCount(variationCounts);
  }
  const assignments = new Map<string, number>();
  for (const instance of instances) {
    if (instance.category !== "tree") continue;
    const recipeId = instance.assetRecipeId;
    if (!recipeId) throw new RangeError(`Seed World tree "${instance.id}" is missing its authored asset recipe`);
    if (assignments.has(instance.id)) throw new RangeError(`Seed World tree id "${instance.id}" is duplicated`);
    const variationCount = typeof variationCounts === "number" ? variationCounts : variationCounts.get(recipeId);
    if (variationCount === undefined) {
      throw new RangeError(`Seed World tree recipe "${recipeId}" is missing its authored variation count`);
    }
    validateSeedWorldTreeVariationCount(variationCount);
    const previous = previousAssignments.get(instance.id);
    if (previous !== undefined && (!Number.isInteger(previous) || previous < 0 || previous >= variationCount)) {
      throw new RangeError(`Seed World tree "${instance.id}" has invalid variation index ${previous}`);
    }
    assignments.set(instance.id, previous ?? seedWorldTreeVariationIndex(recipeId, instance.id, variationCount));
  }
  return assignments;
}

/** Validate complete ownership before publishing any restored visual assignment. */
export function restoreSeedWorldTreeVariationIndexMap(
  instances: readonly Pick<SeedWorldPopulationInstance, "id" | "category" | "assetRecipeId">[],
  variationCounts: number | ReadonlyMap<string, number>,
  saved: readonly SeedWorldSavedTreeVariation[]
): ReadonlyMap<string, number> {
  const trees = new Map(
    instances.filter(({ category }) => category === "tree").map((instance) => [instance.id, instance])
  );
  const assignments = new Map<string, number>();
  for (const entry of saved) {
    if (
      !trees.has(entry.instanceId) ||
      trees.get(entry.instanceId)!.assetRecipeId !== entry.recipeId ||
      assignments.has(entry.instanceId)
    ) {
      throw new Error(`Saved tree '${entry.instanceId}' does not match the restored population`);
    }
    assignments.set(entry.instanceId, entry.variationIndex);
  }
  if (assignments.size !== trees.size) throw new Error("Saved tree identities do not match the restored population");
  return reconcileSeedWorldTreeVariationIndexMap(instances, variationCounts, assignments);
}

function seedWorldTreeVariationIndex(recipeId: string, instanceId: string, variationCount: number): number {
  if (variationCount === 1) return 0;
  // Length-delimited recipe and instance IDs avoid ambiguous compound identities.
  const identity = `${recipeId.length}:${recipeId}${instanceId}`;
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
  // Avalanche consecutive IDs before mapping to a weighted catalog slot.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  const sample = ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000;
  if (sample < SEED_WORLD_PRIMARY_TREE_VARIATION_SHARE) return 0;
  return (
    1 +
    Math.floor(
      ((sample - SEED_WORLD_PRIMARY_TREE_VARIATION_SHARE) / (1 - SEED_WORLD_PRIMARY_TREE_VARIATION_SHARE)) *
        (variationCount - 1)
    )
  );
}

function validateSeedWorldTreeVariationCount(variationCount: number): void {
  if (!Number.isInteger(variationCount) || variationCount <= 0) {
    throw new RangeError(`Seed World tree variation count must be a positive integer; received ${variationCount}`);
  }
}

function treeRecipeIndex(recipes: readonly TreeRecipeSource[], assetRecipeId: string | undefined): number {
  if (!assetRecipeId) throw new RangeError("Seed World exact tree instance is missing its authored asset recipe");
  const recipeIndex = recipes.findIndex((recipe) => recipe.id === assetRecipeId);
  if (recipeIndex < 0) throw new RangeError(`Seed World tree recipe "${assetRecipeId}" is not loaded`);
  return recipeIndex;
}

function createSparsePopulationSubCells(
  cell: SeedWorldPopulationRuntimeCell,
  boundsData: Float32Array,
  category: "tree" | "shrub"
): readonly SparsePopulationSubCell[] {
  const buckets: number[][] = [[], [], [], []];
  const centerX = (cell.minimumWorldX + cell.maximumWorldX) * 0.5;
  const centerZ = (cell.minimumWorldZ + cell.maximumWorldZ) * 0.5;
  for (let instanceIndex = 0; instanceIndex * POPULATION_WORLD_BOUNDS_FLOATS < boundsData.length; instanceIndex++) {
    const offset = instanceIndex * POPULATION_WORLD_BOUNDS_FLOATS;
    const quadrant =
      ((boundsData[offset]! + boundsData[offset + 3]!) * 0.5 >= centerX ? 1 : 0) |
      ((boundsData[offset + 2]! + boundsData[offset + 5]!) * 0.5 >= centerZ ? 2 : 0);
    buckets[quadrant]!.push(instanceIndex);
  }
  const subCells: SparsePopulationSubCell[] = [];
  for (let quadrant = 0; quadrant < buckets.length; quadrant++) {
    const bucket = buckets[quadrant]!;
    if (bucket.length === 0) continue;
    const instanceIndices = new Uint32Array(bucket);
    subCells.push({
      occlusionKey: `${cell.id}:${category}:${quadrant}`,
      instanceIndices,
      bounds: new BoundingBox(new Vector3(), new Vector3())
    });
  }
  refreshSparsePopulationSubCellWorldBounds(subCells, boundsData);
  return subCells;
}

function capturePopulationCameraState(camera: Camera, previous: Float64Array): boolean {
  const position = camera.entity.transform.worldPosition;
  let changed = false;
  const view = camera.viewMatrix.elements;
  const projection = camera.projectionMatrix.elements;
  for (let index = 0; index < 16; index++) {
    if (!Object.is(previous[index], view[index])) changed = true;
    previous[index] = view[index];
    if (!Object.is(previous[index + 16], projection[index])) changed = true;
    previous[index + 16] = projection[index];
  }
  const orthographic = camera.isOrthographic ? 1 : 0;
  const frustumCullingEnabled = camera.enableFrustumCulling ? 1 : 0;
  if (!Object.is(previous[32], position.x)) changed = true;
  if (!Object.is(previous[33], position.y)) changed = true;
  if (!Object.is(previous[34], position.z)) changed = true;
  if (!Object.is(previous[35], camera.fieldOfView)) changed = true;
  if (!Object.is(previous[36], orthographic)) changed = true;
  if (!Object.is(previous[37], camera.orthographicSize)) changed = true;
  if (!Object.is(previous[38], camera.nearClipPlane)) changed = true;
  if (!Object.is(previous[39], frustumCullingEnabled)) changed = true;
  previous[32] = position.x;
  previous[33] = position.y;
  previous[34] = position.z;
  previous[35] = camera.fieldOfView;
  previous[36] = orthographic;
  previous[37] = camera.orthographicSize;
  previous[38] = camera.nearClipPlane;
  previous[39] = frustumCullingEnabled;
  return changed;
}

function validatePopulationSources(
  sourceLibrary: AssetAssemblySourceLibrary,
  treeAuthoringProfiles: readonly ProceduralTreeRuntimeAuthoringProfile[]
): void {
  const profilesByRecipeId = new Map(treeAuthoringProfiles.map((profile) => [profile.recipe.id, profile]));
  if (
    treeAuthoringProfiles.length === 0 ||
    profilesByRecipeId.size !== treeAuthoringProfiles.length ||
    sourceLibrary.treeRecipes.length !== treeAuthoringProfiles.length ||
    sourceLibrary.treeRecipes.some((recipe) => {
      const profile = profilesByRecipeId.get(recipe.id);
      return (
        !profile ||
        profile.recipe !== recipe ||
        !profile.recipe.proceduralRuntime ||
        profile.variations.length !== INSTANCED_BIRCH_POPULATION_VARIATION_COUNT
      );
    })
  ) {
    throw new Error("Seed World Population requires one complete authored procedural-tree profile per loaded recipe");
  }
  if (
    sourceLibrary.shrub.lods.length !== 2 ||
    sourceLibrary.shrub.lodGroup.screenRelativeTransitionHeights.length !== sourceLibrary.shrub.lods.length
  ) {
    throw new Error("Seed World Population requires the authored shrub Prefab LODGroup");
  }
  for (const category of SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.categories) {
    const family = category === "grass" ? sourceLibrary.grassFamily : sourceLibrary.flowerFamily;
    if (family.primary !== sourceLibrary[category] || family.variants.length === 0) {
      throw new Error(`Seed World Population requires an authored ${category} atom family`);
    }
    for (const source of family.variants) {
      if (source.lods.length !== 1) throw new Error(`Seed World Population requires one authored ${category} atom`);
      const fade = productionPrefabDistanceFade(source.lods[0]);
      const expected = SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.authoredMaterialFade;
      if (
        fade.enabled !== expected.enabled ||
        Math.abs(fade.distance - expected.distanceMetres) > 0.0001 ||
        Math.abs(fade.falloff - expected.falloff) > 0.0001
      ) {
        throw new Error(`Seed World ${category} variants must retain the authored 90m / 0.8 distance fade`);
      }
    }
  }
}

function detailAreaBounds(
  minimumWorldX: number,
  minimumWorldZ: number,
  maximumWorldX: number,
  maximumWorldZ: number,
  fields: SeedWorldFields,
  atomBoundsRadiusMetres: number
): BoundingBox {
  const spacing = fields.sizeMetres / (fields.heightResolution - 1);
  const originX = seedWorldOriginX(fields),
    originZ = seedWorldOriginZ(fields);
  const minimumSampleX = Math.max(0, Math.floor((minimumWorldX - originX) / spacing));
  const maximumSampleX = Math.min(fields.heightResolution - 1, Math.ceil((maximumWorldX - originX) / spacing));
  const minimumSampleZ = Math.max(0, Math.floor((minimumWorldZ - originZ) / spacing));
  const maximumSampleZ = Math.min(fields.heightResolution - 1, Math.ceil((maximumWorldZ - originZ) / spacing));
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  for (let sampleZ = minimumSampleZ; sampleZ <= maximumSampleZ; sampleZ++) {
    const row = sampleZ * fields.heightResolution;
    for (let sampleX = minimumSampleX; sampleX <= maximumSampleX; sampleX++) {
      const height =
        fields.surfaceHeights?.[row + sampleX] ?? decodeSeedWorldHeight(fields, fields.heightSamples[row + sampleX]!);
      minimumHeight = Math.min(minimumHeight, height);
      maximumHeight = Math.max(maximumHeight, height);
    }
  }
  return new BoundingBox(
    new Vector3(
      minimumWorldX - atomBoundsRadiusMetres,
      minimumHeight - atomBoundsRadiusMetres,
      minimumWorldZ - atomBoundsRadiusMetres
    ),
    new Vector3(
      maximumWorldX + atomBoundsRadiusMetres,
      maximumHeight + atomBoundsRadiusMetres,
      maximumWorldZ + atomBoundsRadiusMetres
    )
  );
}

function detailBoundsContainsCamera(bounds: BoundingBox, cameraPosition: Vector3): boolean {
  return (
    cameraPosition.x >= bounds.min.x &&
    cameraPosition.x <= bounds.max.x &&
    cameraPosition.y >= bounds.min.y &&
    cameraPosition.y <= bounds.max.y &&
    cameraPosition.z >= bounds.min.z &&
    cameraPosition.z <= bounds.max.z
  );
}

function validatePopulationLayoutTopology(current: SeedWorldPopulationPreview, next: SeedWorldPopulationPreview): void {
  if (current.detailDensityFields.length !== next.detailDensityFields.length) {
    throw new Error("Authoring vegetation cannot change Detail runtime topology");
  }
  const currentByPrototype = new Map(
    current.detailDensityFields.map((field) => [field.prototypeFamily, field] as const)
  );
  for (const field of next.detailDensityFields) {
    const previous = currentByPrototype.get(field.prototypeFamily);
    if (
      !previous ||
      previous.category !== field.category ||
      previous.assetProfileKey !== field.assetProfileKey ||
      previous.resolution !== field.resolution ||
      groundCoverSampleCount(previous) !== groundCoverSampleCount(field)
    ) {
      throw new Error(`Authoring Detail prototype '${field.prototypeFamily}' changed runtime topology`);
    }
  }
}

function validateDetailCompactionInputs(
  populationLayout: SeedWorldPopulationPreview,
  fields: SeedWorldFields,
  validatedGroundCoverSource?: SeedWorldPopulationPreview
): void {
  const prototypeFamilies = new Set<string>();
  for (const field of populationLayout.detailDensityFields) {
    if (prototypeFamilies.has(field.prototypeFamily)) {
      throw new Error(`Seed World Detail contains duplicate density field "${field.prototypeFamily}"`);
    }
    prototypeFamilies.add(field.prototypeFamily);
    const heights = field.heightRangeMetres;
    if (heights) {
      if (
        field.category !== "grass" ||
        heights.samples.length !== field.resolution ** 2 * 2 ||
        !Number.isFinite(heights.minimum) ||
        !Number.isFinite(heights.maximum) ||
        heights.minimum <= 0 ||
        heights.maximum < heights.minimum
      )
        throw new RangeError("Invalid grass ecology height field");
      // Occupancy derives only density from an accepted immutable source. Authoring and water inputs
      // still validate every height value, including when they reuse a previously published array.
      const validated = validatedGroundCoverSource?.detailDensityFields.find(
        (source) => source.prototypeFamily === field.prototypeFamily
      );
      if (validated?.heightRangeMetres !== heights)
        for (let i = 0; i < heights.samples.length; i += 2) {
          const low = heights.samples[i],
            high = heights.samples[i + 1];
          if (
            !Number.isFinite(low) ||
            !Number.isFinite(high) ||
            low < heights.minimum ||
            high < low ||
            high > heights.maximum
          )
            throw new RangeError(
              "Grass ecology height samples must be positive, ordered and inside the declared bounds"
            );
        }
    }
    const profile = populationLayout.detailSpeciesProfiles.find((candidate) => candidate.key === field.prototypeFamily);
    if (!profile) throw new RangeError(`Seed World Detail profile '${field.prototypeFamily}' is unavailable`);
    if (
      field.category === "grass" &&
      profile.habitat === "terrestrial" &&
      (field.resolution !== fields.surfaceResolution || groundCoverSampleCount(field) !== fields.surfaceResolution ** 2)
    ) {
      throw new RangeError("Seed World grass DensityField must align with the Terrain surface coverage field");
    }
  }
}

function populationCellIdsForBounds(
  fields: SeedWorldFields,
  bounds: SeedWorldAuthoringRuntimeBoundsV1
): ReadonlySet<string> {
  const sizeMetres = fields.sizeMetres;
  const cellCount = Math.ceil(sizeMetres / SEED_WORLD_POPULATION_CELL_METRES);
  const coordinate = (world: number, origin: number): number =>
    Math.min(cellCount - 1, Math.max(0, Math.floor((world - origin) / SEED_WORLD_POPULATION_CELL_METRES)));
  const minimumX = coordinate(bounds.minimumX, seedWorldOriginX(fields));
  const maximumX = coordinate(bounds.maximumX, seedWorldOriginX(fields));
  const minimumZ = coordinate(bounds.minimumZ, seedWorldOriginZ(fields));
  const maximumZ = coordinate(bounds.maximumZ, seedWorldOriginZ(fields));
  const result = new Set<string>();
  for (let cellZ = minimumZ; cellZ <= maximumZ; cellZ++) {
    for (let cellX = minimumX; cellX <= maximumX; cellX++) result.add(`cell-${cellX}-${cellZ}`);
  }
  return result;
}

function detailPatchesForBounds(
  cell: SeedWorldPopulationRuntimeCell,
  areas: readonly SeedWorldAuthoringRuntimeBoundsV1[]
): Set<number> {
  const size = SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.renderPatchMetres;
  const side = Math.ceil(SEED_WORLD_POPULATION_CELL_METRES / size),
    result = new Set<number>();
  for (let z = 0; z < side; z++)
    for (let x = 0; x < side; x++) {
      const minimumX = cell.minimumWorldX + x * size,
        minimumZ = cell.minimumWorldZ + z * size;
      if (
        areas.some(
          (area) =>
            area.minimumX <= minimumX + size &&
            area.maximumX >= minimumX &&
            area.minimumZ <= minimumZ + size &&
            area.maximumZ >= minimumZ
        )
      )
        result.add(z * side + x);
    }
  return result;
}

function detailAreaIntersectsPatches(
  cell: SeedWorldPopulationRuntimeCell,
  patches: ReadonlySet<number>,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number
): boolean {
  const size = SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.renderPatchMetres;
  const side = Math.ceil(SEED_WORLD_POPULATION_CELL_METRES / size);
  for (const index of patches) {
    const x = cell.minimumWorldX + (index % side) * size,
      z = cell.minimumWorldZ + Math.floor(index / side) * size;
    if (minimumX <= x + size && maximumX >= x && minimumZ <= z + size && maximumZ >= z) return true;
  }
  return false;
}

/** Trim coarse coverage tiles to patch lattice spans without changing candidate ordinals.
 * A lattice square straddling a patch edge stays in both spans; the jittered position decides ownership.
 */
function clipDetailCandidateRangesToPatches(
  ranges: Uint32Array,
  gridSide: number,
  side: number,
  patches: ReadonlySet<number>
): Uint32Array {
  const spans = [...patches]
    .map((index) => {
      const x = index % side,
        z = Math.floor(index / side);
      return {
        x0: Math.floor((x * gridSide) / side),
        x1: Math.ceil(((x + 1) * gridSide) / side),
        z0: Math.floor((z * gridSide) / side),
        z1: Math.ceil(((z + 1) * gridSide) / side)
      };
    })
    .sort((a, b) => a.x0 - b.x0);
  const result: number[] = [];
  for (let i = 0; i < ranges.length; i += 2) {
    const first = ranges[i]!,
      last = ranges[i + 1]!;
    for (let row = Math.floor(first / gridSide); row * gridSide < last; row++) {
      const rowStart = row * gridSide;
      for (const span of spans) {
        if (row < span.z0 || row >= span.z1) continue;
        const start = Math.max(first, rowStart + span.x0),
          end = Math.min(last, rowStart + span.x1);
        if (start >= end) continue;
        if (result.length && start <= result[result.length - 1]!) {
          result[result.length - 1] = Math.max(end, result[result.length - 1]!);
        } else result.push(start, end);
      }
    }
  }
  return Uint32Array.from(result);
}

function maximumDetailBoundsRadius(
  sourceLibrary: AssetAssemblySourceLibrary,
  grassMaximumScale = getSeedWorldAssetPlacementProfile("grass").roleScale.field!.maximum
): number {
  let maximumRadius = 0;
  for (const [category, family] of [
    ["grass", sourceLibrary.grassFamily],
    ["flower", sourceLibrary.flowerFamily]
  ] as const) {
    const maximumScale =
      category === "grass" ? grassMaximumScale : getSeedWorldAssetPlacementProfile(category).roleScale.field!.maximum;
    for (const source of family.variants) {
      const bounds = source.lods[0].renderer.mesh.bounds.clone().transform(source.lods[0].renderer.localMatrix);
      maximumRadius = Math.max(
        maximumRadius,
        detailLocalPivotRadius(bounds) *
          maximumScale *
          DETAIL_HORIZONTAL_SCALE_VARIATION_MAXIMUM *
          DETAIL_WIND_BOUNDS_RADIUS_SCALE
      );
    }
  }
  return maximumRadius;
}

function detailLocalPivotRadius(bounds: BoundingBox): number {
  return Math.sqrt(
    Math.max(bounds.min.x * bounds.min.x, bounds.max.x * bounds.max.x) +
      Math.max(bounds.min.y * bounds.min.y, bounds.max.y * bounds.max.y) +
      Math.max(bounds.min.z * bounds.min.z, bounds.max.z * bounds.max.z)
  );
}

/** Resolve the exact authored detail source for both startup validation and streamed publication. */
export function detailSourceForPrototype(
  family: AtomicAssemblySourceFamily,
  assetProfileKey: string
): AtomicAssemblySource {
  const pathSegment = `/${assetProfileKey}/`;
  const source = family.variants.find((candidate) => candidate.id.includes(pathSegment));
  if (!source) throw new Error(`Seed World Detail source "${assetProfileKey}" is absent from Asset Assembly`);
  return source;
}

function densityFieldAreaHasContent(
  field: SeedWorldDetailDensityField,
  minimumWorldX: number,
  minimumWorldZ: number,
  maximumWorldX: number,
  maximumWorldZ: number,
  terrain: SeedWorldFields
): boolean {
  const worldSizeMetres = terrain.sizeMetres;
  // Bilinear sampling reaches one source texel outside the geometric area. Match that support
  // here so an empty local texel strip cannot incorrectly discard a non-zero neighbour tail.
  const minimumX = Math.max(
    0,
    Math.floor(((minimumWorldX - seedWorldOriginX(terrain)) / worldSizeMetres) * field.resolution) - 1
  );
  const maximumX = Math.min(
    field.resolution - 1,
    Math.ceil(((maximumWorldX - seedWorldOriginX(terrain)) / worldSizeMetres) * field.resolution)
  );
  const minimumZ = Math.max(
    0,
    Math.floor(((minimumWorldZ - seedWorldOriginZ(terrain)) / worldSizeMetres) * field.resolution) - 1
  );
  const maximumZ = Math.min(
    field.resolution - 1,
    Math.ceil(((maximumWorldZ - seedWorldOriginZ(terrain)) / worldSizeMetres) * field.resolution)
  );
  const read = groundCoverDensityReader(field),
    samples = read ? undefined : field.samples;
  for (let z = minimumZ; z <= maximumZ; z++) {
    for (let x = minimumX; x <= maximumX; x++) {
      if ((read ? read(x, z) : samples![z * field.resolution + x]) !== 0) return true;
    }
  }
  return false;
}

function expectedDetailCounts(
  fields: readonly SeedWorldDetailDensityField[],
  cell: SeedWorldPopulationRuntimeCell,
  terrain: SeedWorldFields,
  densityMultiplier: (field: SeedWorldDetailDensityField) => number
): Readonly<Record<DetailCategory, number>> {
  const worldSizeMetres = terrain.sizeMetres;
  const counts: Record<DetailCategory, number> = { grass: 0, flower: 0 };
  for (const field of fields) {
    if (field.maximumDensityPerSquareMetre <= 0) continue;
    const sampleArea = (worldSizeMetres / field.resolution) ** 2;
    const minimumX = Math.max(
      0,
      Math.floor(((cell.minimumWorldX - seedWorldOriginX(terrain)) / worldSizeMetres) * field.resolution)
    );
    const maximumX = Math.min(
      field.resolution - 1,
      Math.ceil(((cell.maximumWorldX - seedWorldOriginX(terrain)) / worldSizeMetres) * field.resolution) - 1
    );
    const minimumZ = Math.max(
      0,
      Math.floor(((cell.minimumWorldZ - seedWorldOriginZ(terrain)) / worldSizeMetres) * field.resolution)
    );
    const maximumZ = Math.min(
      field.resolution - 1,
      Math.ceil(((cell.maximumWorldZ - seedWorldOriginZ(terrain)) / worldSizeMetres) * field.resolution) - 1
    );
    const category: DetailCategory = field.category;
    const multiplier = densityMultiplier(field);
    const read = groundCoverDensityReader(field),
      samples = read ? undefined : field.samples;
    for (let z = minimumZ; z <= maximumZ; z++) {
      for (let x = minimumX; x <= maximumX; x++) {
        counts[category] +=
          ((read ? read(x, z) : samples![z * field.resolution + x]) / 255) *
          field.maximumDensityPerSquareMetre *
          sampleArea *
          multiplier;
      }
    }
  }
  return counts;
}

function emptyRockSurfaceTreeCompilation(): SeedWorldRockSurfaceTreeCompilation {
  return Object.freeze({
    placements: Object.freeze([]),
    candidateCount: 0,
    sourceTriangleCount: 0,
    acceptedTriangleCount: 0
  });
}

function createRockSurfaceTreeGrounding(
  placement: SeedWorldRockSurfaceTreePlacement
): SeedWorldGroundedPopulationInstance {
  const halfYaw = placement.producerInstance.yawRadians * 0.5;
  return Object.freeze({
    producerInstance: placement.producerInstance,
    position: placement.position,
    surfaceNormal: placement.surfaceNormal,
    rotation: Object.freeze([0, Math.sin(halfYaw), 0, Math.cos(halfYaw)] as const)
  });
}

function samePopulationInstanceIds(
  left: readonly SeedWorldPopulationInstance[],
  right: readonly SeedWorldPopulationInstance[]
): boolean {
  return left.length === right.length && left.every((instance, index) => instance.id === right[index]?.id);
}

function rockSurfaceGrassPatchIsResident(
  patch: SeedWorldRockSurfaceGrassPatch,
  cameraPosition: Readonly<{ x: number; y: number; z: number }>
): boolean {
  const minimumX = patch.patchX * SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES;
  const maximumX = minimumX + SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES;
  const minimumZ = patch.patchZ * SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES;
  const maximumZ = minimumZ + SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES;
  const offsetX = Math.max(minimumX - cameraPosition.x, 0, cameraPosition.x - maximumX);
  const offsetY = Math.max(patch.minimumY - cameraPosition.y, 0, cameraPosition.y - patch.maximumY);
  const offsetZ = Math.max(minimumZ - cameraPosition.z, 0, cameraPosition.z - maximumZ);
  const distance = seedWorldPopulationDetailFadeTerminalDistance();
  return offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ <= distance * distance;
}

function detailSourceLocalBounds(source: AtomicAssemblySource): BoundingBox {
  let bounds = DETAIL_LOCAL_BOUNDS_BY_SOURCE.get(source);
  if (!bounds) {
    const binding = source.lods[0]!.renderer;
    bounds = binding.mesh.bounds.clone().transform(binding.localMatrix);
    DETAIL_LOCAL_BOUNDS_BY_SOURCE.set(source, bounds);
  }
  return bounds;
}

function createRockSurfaceGrassBatch(
  engine: Engine,
  root: Entity,
  source: AtomicAssemblySource,
  material: Material,
  patch: SeedWorldRockSurfaceGrassPatch,
  grassColorField?: SeedWorldGrassColorFieldBinding,
  grassRoadColor?: GrassRoadColor
): DetailPopulationBatch {
  if (
    patch.instanceCount <= 0 ||
    patch.transforms.length < patch.instanceCount * SEED_WORLD_ROCK_SURFACE_GRASS_TRANSFORM_FLOATS ||
    patch.transforms.length % SEED_WORLD_ROCK_SURFACE_GRASS_TRANSFORM_FLOATS !== 0 ||
    SEED_WORLD_ROCK_SURFACE_GRASS_TRANSFORM_FLOATS !== DETAIL_TRANSFORM_FLOATS
  ) {
    throw new Error("Seed World rock-surface grass requires complete compact Detail transforms");
  }
  const binding = source.lods[0]!.renderer;
  const localBounds = detailSourceLocalBounds(source);
  const bounds = new BoundingBox(new Vector3(), new Vector3());
  updateCompactedDetailBounds(bounds, patch.transforms, localBounds, patch.instanceCount);
  const entity = root.createChild(`Rock grass compact Detail patch ${patch.patchX}-${patch.patchZ}`);
  let resources: SeedWorldDetailInstancedMesh | undefined;
  try {
    const renderer = entity.addComponent(MeshRenderer);
    const instanceCount = patch.instanceCount;
    resources = createSeedWorldDetailInstancedMesh(
      engine,
      binding.mesh,
      patch.transforms,
      instanceCount,
      bounds,
      entity.name
    );
    renderer.mesh = resources.mesh;
    renderer.setMaterial(material);
    renderer.castShadows = SEED_WORLD_POPULATION_RUNTIME_PROFILE.shadows.castShadows;
    renderer.receiveShadows = SEED_WORLD_POPULATION_RUNTIME_PROFILE.shadows.receiveShadows;
    renderer.enableVertexColor = binding.enableVertexColor;
    renderer.shaderData.enableMacro(SEED_WORLD_DETAIL_COMPACT_MACRO);
    renderer.shaderData.enableMacro(SURFACE_GRASS_ATTACHMENT_MACRO);
    if (patch.rockGround) renderer.shaderData.enableMacro("RENDERER_ROCK_GRASS_GROUND");
    renderer.shaderData.setMatrix(DETAIL_LOCAL_MATRIX, binding.localMatrix);
    renderer.shaderData.setMatrix(DETAIL_LOCAL_NORMAL_MATRIX, binding.localNormalMatrix);
    if (grassColorField) bindGrassColorField(renderer, grassColorField);
    if (grassRoadColor) bindGrassRoadColor(renderer, grassRoadColor);
    setAssetEntranceRevealRangeValues(renderer, bounds.min.y, bounds.max.y);
    renderer.enabled = false;
    return {
      entity,
      renderer,
      resources,
      transforms: patch.transforms,
      localBounds,
      bounds,
      instanceCount,
      candidateCount: patch.candidateCount,
      rockSurfacePatch: patch,
      destroyed: false
    };
  } catch (error) {
    resources?.mesh.destroy();
    resources?.instanceBuffer.destroy(true);
    entity.destroy();
    throw error;
  }
}

function reuseRockSurfaceGrassBatch(
  batch: DetailPopulationBatch,
  patch: SeedWorldRockSurfaceGrassPatch,
  grassColorField?: SeedWorldGrassColorFieldBinding,
  grassRoadColor?: GrassRoadColor
): void {
  const floatCount = patch.instanceCount * DETAIL_TRANSFORM_FLOATS;
  if (
    batch.destroyed ||
    patch.instanceCount <= 0 ||
    floatCount > patch.transforms.length ||
    floatCount * Float32Array.BYTES_PER_ELEMENT > batch.resources.instanceBuffer.byteLength
  ) {
    throw new RangeError("Seed World rock-surface grass batch capacity is insufficient");
  }
  batch.transforms = patch.transforms;
  batch.instanceCount = patch.instanceCount;
  batch.candidateCount = patch.candidateCount;
  batch.rockSurfacePatch = patch;
  if (patch.rockGround) batch.renderer.shaderData.enableMacro("RENDERER_ROCK_GRASS_GROUND");
  else batch.renderer.shaderData.disableMacro("RENDERER_ROCK_GRASS_GROUND");
  batch.resources.instanceBuffer.setData(patch.transforms, 0, 0, floatCount, SetDataOptions.Discard);
  updateCompactedDetailBounds(batch.bounds, patch.transforms, batch.localBounds, patch.instanceCount);
  batch.resources.mesh.bounds = batch.bounds;
  batch.resources.mesh.instanceCount = patch.instanceCount;
  if (grassColorField) bindGrassColorField(batch.renderer, grassColorField);
  if (grassRoadColor) bindGrassRoadColor(batch.renderer, grassRoadColor);
  setAssetEntranceRevealRangeValues(batch.renderer, batch.bounds.min.y, batch.bounds.max.y);
}

function sameRockSurfaceGrassRocks(
  left: readonly SeedWorldSolvedRockObb[],
  right: readonly SeedWorldSolvedRockObb[]
): boolean {
  return left.length === right.length && left.every((rock, index) => rock === right[index]);
}

function createCompactedDetailPopulationBatch(
  engine: Engine,
  root: Entity,
  source: AtomicAssemblySource,
  material: Material,
  field: SeedWorldDetailDensityField,
  cell: SeedWorldPopulationRuntimeCell,
  fields: SeedWorldFields,
  patch: DetailCompactionPatch,
  grassColorField?: SeedWorldGrassColorFieldBinding,
  grassRoadColor?: GrassRoadColor,
  grassScaleRange?: Readonly<{ minimum: number; maximum: number }>,
  prepared?: Pick<DetailCompactionPublicationWorkItem, "bounds" | "owners">
): DetailPopulationBatch | undefined {
  if (
    field.maximumDensityPerSquareMetre <= 0 ||
    !densityFieldAreaHasContent(
      field,
      cell.minimumWorldX,
      cell.minimumWorldZ,
      cell.maximumWorldX,
      cell.maximumWorldZ,
      fields
    )
  ) {
    return undefined;
  }
  const binding = source.lods[0].renderer;
  const localBounds = detailSourceLocalBounds(source);
  const bounds = prepared?.bounds ?? new BoundingBox(new Vector3(), new Vector3());
  if (!prepared?.bounds) updateCompactedDetailBounds(bounds, patch.transforms, localBounds, patch.instanceCount);
  const entity = root.createChild(
    `${field.prototypeFamily} compact Detail Cell batch ${SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.renderPatchMetres}m patch ${patch.patchX}-${patch.patchZ}`
  );
  let resources: SeedWorldDetailInstancedMesh | undefined;
  try {
    const renderer = entity.addComponent(MeshRenderer);
    resources = createSeedWorldDetailInstancedMesh(
      engine,
      binding.mesh,
      patch.transforms,
      patch.instanceCount,
      bounds,
      entity.name
    );
    renderer.mesh = resources.mesh;
    renderer.setMaterial(material);
    renderer.castShadows = SEED_WORLD_POPULATION_RUNTIME_PROFILE.shadows.castShadows;
    renderer.receiveShadows = SEED_WORLD_POPULATION_RUNTIME_PROFILE.shadows.receiveShadows;
    renderer.enableVertexColor = binding.enableVertexColor;
    renderer.shaderData.enableMacro(SEED_WORLD_DETAIL_COMPACT_MACRO);
    renderer.shaderData.setMatrix(DETAIL_LOCAL_MATRIX, binding.localMatrix);
    renderer.shaderData.setMatrix(DETAIL_LOCAL_NORMAL_MATRIX, binding.localNormalMatrix);
    if (grassColorField) bindGrassColorField(renderer, grassColorField);
    if (grassRoadColor) bindGrassRoadColor(renderer, grassRoadColor);
    setAssetEntranceRevealRangeValues(renderer, bounds.min.y, bounds.max.y);
    renderer.enabled = true;
    return {
      entity,
      renderer,
      resources,
      transforms: patch.transforms,
      localBounds,
      bounds,
      instanceCount: patch.instanceCount,
      candidateCount: patch.candidateCount,
      prototypeFamily: field.prototypeFamily,
      detailPatch: { x: patch.patchX, z: patch.patchZ, assetProfileKey: field.assetProfileKey },
      owners: prepared
        ? prepared.owners
        : field.ownership
          ? Array.from({ length: patch.instanceCount }, (_, index) =>
              sampleSeedWorldDetailOwner(
                field,
                fields.sizeMetres,
                patch.transforms[index * DETAIL_TRANSFORM_FLOATS] - seedWorldOriginX(fields) - fields.sizeMetres / 2,
                patch.transforms[index * DETAIL_TRANSFORM_FLOATS + 2] - seedWorldOriginZ(fields) - fields.sizeMetres / 2
              )
            )
          : undefined,
      grassScaleMinimum: grassScaleRange?.minimum,
      grassScaleMaximum: grassScaleRange?.maximum,
      destroyed: false
    };
  } catch (error) {
    resources?.mesh.destroy();
    resources?.instanceBuffer.destroy(true);
    entity.destroy();
    throw error;
  }
}

/** Commit a prepared occupancy patch. Growth replaces only storage; the Mesh and its identity remain stable. */
function reuseCompactedDetailPopulationBatch(
  engine: Engine,
  batch: DetailPopulationBatch,
  work: DetailCompactionPublicationWorkItem,
  scale: Readonly<{ minimum: number; maximum: number }> | undefined,
  transformPool: DetailTransformBufferPool
): void {
  const { patch, field } = work,
    previousBuffer = batch.resources.instanceBuffer;
  const floatCount = patch.instanceCount * DETAIL_TRANSFORM_FLOATS;
  const requiredBytes = floatCount * Float32Array.BYTES_PER_ELEMENT;
  const buffer =
    requiredBytes <= previousBuffer.byteLength
      ? previousBuffer
      : new Buffer(
          engine,
          BufferBindFlag.VertexBuffer,
          Math.max(
            requiredBytes,
            Math.ceil((previousBuffer.byteLength * 1.5) / DETAIL_TRANSFORM_STRIDE_BYTES) * DETAIL_TRANSFORM_STRIDE_BYTES
          ),
          BufferUsage.Dynamic
        );
  try {
    buffer.setData(patch.transforms, 0, 0, floatCount);
    if (buffer !== previousBuffer)
      batch.resources.mesh.setVertexBufferBinding(
        buffer,
        DETAIL_TRANSFORM_STRIDE_BYTES,
        batch.resources.instanceBinding
      );
  } catch (error) {
    if (buffer !== previousBuffer) {
      batch.resources.mesh.setVertexBufferBinding(
        previousBuffer,
        DETAIL_TRANSFORM_STRIDE_BYTES,
        batch.resources.instanceBinding
      );
      buffer.destroy(true);
    }
    throw error;
  }
  const previousTransforms = batch.transforms;
  batch.resources.instanceBuffer = buffer;
  batch.transforms = patch.transforms;
  batch.instanceCount = patch.instanceCount;
  batch.candidateCount = patch.candidateCount;
  batch.prototypeFamily = field.prototypeFamily;
  batch.owners = work.owners;
  batch.grassScaleMinimum = scale?.minimum;
  batch.grassScaleMaximum = scale?.maximum;
  batch.bounds.min.copyFrom(work.bounds!.min);
  batch.bounds.max.copyFrom(work.bounds!.max);
  batch.resources.mesh.bounds = batch.bounds;
  batch.resources.mesh.instanceCount = patch.instanceCount;
  setAssetEntranceRevealRangeValues(batch.renderer, batch.bounds.min.y, batch.bounds.max.y);
  transformPool.release(previousTransforms);
  if (buffer !== previousBuffer) previousBuffer.destroy(true);
}

/**
 * Evaluates the former GPU candidate lattice once when a Cell becomes resident.
 * The runtime admits at most one new Detail Cell per update, retains the resulting instance buffer
 * across visibility changes, and leaves only ordinary instanced transforms in steady-state shaders.
 */
function createDetailFieldCompactionState(
  field: SeedWorldDetailDensityField,
  cell: SeedWorldPopulationRuntimeCell,
  fields: SeedWorldFields,
  horizontalScaleRange: Readonly<{ minimum: number; maximum: number }>,
  verticalScaleRange: Readonly<{ minimum: number; maximum: number }>,
  useEcologicalHeight: boolean,
  densityMultiplier: number,
  usesTerrainGrassCoverage: boolean,
  transformPool: DetailTransformBufferPool,
  coverage?: SeedWorldGrassCoverageSampler,
  dirtyPatches?: ReadonlySet<number>
): DetailFieldCompactionState {
  if (
    usesTerrainGrassCoverage &&
    (field.resolution !== fields.surfaceResolution || groundCoverSampleCount(field) !== fields.surfaceResolution ** 2)
  ) {
    throw new RangeError("Seed World grass DensityField must align with the Terrain surface coverage field");
  }
  const cellX = Math.round((cell.minimumWorldX - seedWorldOriginX(fields)) / SEED_WORLD_POPULATION_CELL_METRES);
  const cellZ = Math.round((cell.minimumWorldZ - seedWorldOriginZ(fields)) / SEED_WORLD_POPULATION_CELL_METRES);
  const lattice = createSeedWorldDetailCandidateLattice(
    field,
    densityMultiplier,
    cellX,
    cellZ,
    SEED_WORLD_POPULATION_CELL_METRES
  );
  const candidateGridSide = lattice.gridSide;
  const candidateCount = lattice.count;
  const candidateDensity = lattice.densityPerSquareMetre;
  const patchesPerAxis = Math.max(
    1,
    Math.ceil(SEED_WORLD_POPULATION_CELL_METRES / SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.renderPatchMetres)
  );
  const coarseRanges =
    dirtyPatches || (usesTerrainGrassCoverage && coverage?.hasGrassInArea)
      ? createSeedWorldDetailCandidateRanges(
          lattice,
          cell.minimumWorldX,
          cell.minimumWorldZ,
          SEED_WORLD_POPULATION_CELL_METRES,
          (x0, z0, x1, z1) =>
            (!dirtyPatches || detailAreaIntersectsPatches(cell, dirtyPatches, x0, z0, x1, z1)) &&
            (!usesTerrainGrassCoverage || !coverage?.hasGrassInArea || coverage.hasGrassInArea(x0, z0, x1, z1))
        )
      : undefined;
  const candidateRanges = dirtyPatches
    ? clipDetailCandidateRangesToPatches(coarseRanges!, candidateGridSide, patchesPerAxis, dirtyPatches)
    : coarseRanges;
  const patchCount = patchesPerAxis ** 2;
  const maximumCandidatesPerPatch = Math.ceil(candidateGridSide / patchesPerAxis) ** 2;
  const staging = Array.from({ length: patchCount }, (_, patch) =>
    !dirtyPatches || dirtyPatches.has(patch)
      ? transformPool.acquire(maximumCandidatesPerPatch)
      : EMPTY_DETAIL_TRANSFORMS
  );
  const acceptedCounts = new Uint32Array(patchCount);
  const candidateCounts = new Uint32Array(patchCount);
  return {
    field,
    sampleDensity: createSeedWorldDetailDensitySampler(field, fields.sizeMetres),
    useEcologicalHeight,
    cell,
    fields,
    candidateGridSide,
    candidateCount,
    candidateDensity,
    patchesPerAxis,
    staging,
    acceptedCounts,
    candidateCounts,
    horizontalScaleRange,
    verticalScaleRange,
    densityMultiplier,
    usesTerrainGrassCoverage,
    cellSeed: lattice.cellSeed,
    candidateRanges,
    dirtyPatches,
    rangeIndex: 0,
    nextOrdinal: candidateRanges ? (candidateRanges[0] ?? candidateCount) : 0
  };
}

function advanceDetailFieldCompaction(
  state: DetailFieldCompactionState,
  maximumCandidates: number,
  surfaceWeightsScratch: [grass: number, road: number, remaining: number],
  terrainNormalScratch: [x: number, y: number, z: number],
  sampleContactIsWater?: (worldX: number, worldZ: number) => boolean,
  sampleGrassCoverage?: (worldX: number, worldZ: number) => number
): number {
  const budget = Math.max(0, Math.floor(maximumCandidates));
  const {
    candidateGridSide,
    candidateCount,
    cell,
    fields,
    patchesPerAxis,
    acceptedCounts,
    candidateCounts,
    candidateDensity,
    staging,
    horizontalScaleRange,
    verticalScaleRange,
    densityMultiplier,
    usesTerrainGrassCoverage,
    cellSeed,
    sampleDensity,
    useEcologicalHeight,
    dirtyPatches,
    field
  } = state;
  const lattice = {
    gridSide: candidateGridSide,
    count: candidateCount,
    densityPerSquareMetre: candidateDensity,
    cellSeed
  };
  const endOrdinal = Math.min(
    candidateCount,
    state.nextOrdinal + budget,
    state.candidateRanges?.[state.rangeIndex + 1] ?? candidateCount
  );
  for (let ordinal = state.nextOrdinal; ordinal < endOrdinal; ordinal++) {
    const { baseSeed, worldX, worldZ } = sampleSeedWorldDetailCandidate(
      lattice,
      ordinal,
      cell.minimumWorldX,
      cell.minimumWorldZ,
      SEED_WORLD_POPULATION_CELL_METRES
    );
    const patchX = Math.min(
      patchesPerAxis - 1,
      Math.floor(((worldX - cell.minimumWorldX) / SEED_WORLD_POPULATION_CELL_METRES) * patchesPerAxis)
    );
    const patchZ = Math.min(
      patchesPerAxis - 1,
      Math.floor(((worldZ - cell.minimumWorldZ) / SEED_WORLD_POPULATION_CELL_METRES) * patchesPerAxis)
    );
    const patchIndex = patchZ * patchesPerAxis + patchX;
    if (dirtyPatches && !dirtyPatches.has(patchIndex)) continue;
    candidateCounts[patchIndex]++;
    let density: number;
    let coverageScale = 1;
    surfaceWeightsScratch[0] = 1;
    surfaceWeightsScratch[1] = 0;
    surfaceWeightsScratch[2] = 0;
    if (usesTerrainGrassCoverage) {
      sampleTerrestrialGrassSurfaceWeights(fields, worldX, worldZ, surfaceWeightsScratch);
      if (sampleGrassCoverage) {
        surfaceWeightsScratch[0] = clamp(sampleGrassCoverage(worldX, worldZ), 0, 1);
        surfaceWeightsScratch[1] = Math.min(surfaceWeightsScratch[1], 1 - surfaceWeightsScratch[0]);
        surfaceWeightsScratch[2] = 1 - surfaceWeightsScratch[0] - surfaceWeightsScratch[1];
      }
      coverageScale = seedWorldGrassCoverageScale(surfaceWeightsScratch[0]);
      // Density fields retain ecology and authored exclusions; coverage only changes clump size.
      if (coverageScale <= 0 || sampleContactIsWater?.(worldX, worldZ)) continue;
    }
    density =
      sampleDensity(
        worldX - seedWorldOriginX(fields) - fields.sizeMetres / 2,
        worldZ - seedWorldOriginZ(fields) - fields.sizeMetres / 2
      ) * densityMultiplier;
    if (!seedWorldDetailCandidatePassesDensity(lattice, baseSeed, density)) continue;
    const height = sampleSeedWorldHeight(fields, worldX, worldZ);
    if (height === undefined) continue;
    sampleSeedWorldTerrainNormal(fields, worldX, worldZ, terrainNormalScratch);
    const scaleVariation = seedWorldDetailUnitFloat(baseSeed ^ 0x63d8_3595);
    const horizontalAxisScale =
      horizontalScaleRange.minimum + (horizontalScaleRange.maximum - horizontalScaleRange.minimum) * scaleVariation;
    const ecologicalHeight =
      field.category === "grass" && useEcologicalHeight
        ? sampleSeedWorldDetailHeight(
            field,
            fields.sizeMetres,
            worldX - seedWorldOriginX(fields),
            worldZ - seedWorldOriginZ(fields),
            scaleVariation
          )
        : undefined;
    const verticalAxisScale =
      ecologicalHeight === undefined
        ? verticalScaleRange.minimum + (verticalScaleRange.maximum - verticalScaleRange.minimum) * scaleVariation
        : ecologicalHeight / GRASS_AUTHORED_HEIGHT_METRES;
    const acceptedCount = acceptedCounts[patchIndex]++;
    const patchTransforms = staging[patchIndex]!;
    const offset = acceptedCount * DETAIL_TRANSFORM_FLOATS;
    patchTransforms[offset] = worldX;
    patchTransforms[offset + 1] = height;
    patchTransforms[offset + 2] = worldZ;
    patchTransforms[offset + 3] = seedWorldDetailUnitFloat(baseSeed ^ 0xc2b2_ae35) * Math.PI * 2;
    const grassScale = verticalAxisScale * coverageScale;
    patchTransforms[offset + 4] =
      field.category === "grass"
        ? grassScale
        : horizontalAxisScale *
          (DETAIL_HORIZONTAL_SCALE_VARIATION_MINIMUM +
            DETAIL_HORIZONTAL_SCALE_VARIATION_RANGE * seedWorldDetailUnitFloat(baseSeed ^ 0x9e37_79b9));
    patchTransforms[offset + 5] = grassScale;
    patchTransforms[offset + 6] =
      field.category === "grass"
        ? grassScale
        : horizontalAxisScale *
          (DETAIL_HORIZONTAL_SCALE_VARIATION_MINIMUM +
            DETAIL_HORIZONTAL_SCALE_VARIATION_RANGE * seedWorldDetailUnitFloat(baseSeed ^ 0x85eb_ca6b));
    patchTransforms[offset + DETAIL_SURFACE_WEIGHTS_FLOAT_OFFSET] = surfaceWeightsScratch[0];
    patchTransforms[offset + DETAIL_SURFACE_WEIGHTS_FLOAT_OFFSET + 1] = surfaceWeightsScratch[1];
    patchTransforms[offset + DETAIL_SURFACE_WEIGHTS_FLOAT_OFFSET + 2] = surfaceWeightsScratch[2];
    patchTransforms[offset + DETAIL_TERRAIN_NORMAL_FLOAT_OFFSET] = terrainNormalScratch[0];
    patchTransforms[offset + DETAIL_TERRAIN_NORMAL_FLOAT_OFFSET + 1] = terrainNormalScratch[1];
    patchTransforms[offset + DETAIL_TERRAIN_NORMAL_FLOAT_OFFSET + 2] = terrainNormalScratch[2];
  }
  const evaluated = endOrdinal - state.nextOrdinal;
  state.nextOrdinal = endOrdinal;
  if (state.candidateRanges && endOrdinal === state.candidateRanges[state.rangeIndex + 1]) {
    state.rangeIndex += 2;
    state.nextOrdinal = state.candidateRanges[state.rangeIndex] ?? candidateCount;
  }
  return evaluated;
}

function bindGrassRoadColor(renderer: MeshRenderer, color: GrassRoadColor): void {
  renderer.shaderData.setVector4(RENDERER_GRASS_ROAD_COLOR, new Vector4(color[0], color[1], color[2], 1));
}

function freezeGrassRoadColor(color: GrassRoadColor): GrassRoadColor {
  if (
    color.length !== 3 ||
    !color.every((component) => Number.isFinite(component) && component >= 0 && component <= 1)
  ) {
    throw new RangeError("Seed World grass road colour components must be finite and between zero and one");
  }
  return Object.freeze([...color] as [number, number, number]);
}

function finishDetailFieldCompaction(state: DetailFieldCompactionState): readonly DetailCompactionPatch[] {
  if (state.nextOrdinal !== state.candidateCount) {
    throw new Error("Seed World Detail compaction cannot finish before every candidate is evaluated");
  }
  const patches = new Array<DetailCompactionPatch>(state.staging.length);
  for (let patchIndex = 0; patchIndex < state.staging.length; patchIndex++) {
    patches[patchIndex] = {
      patchX: patchIndex % state.patchesPerAxis,
      patchZ: Math.floor(patchIndex / state.patchesPerAxis),
      transforms: state.staging[patchIndex]!,
      instanceCount: state.acceptedCounts[patchIndex]!,
      candidateCount: state.candidateCounts[patchIndex]!
    };
  }
  return patches;
}

function createDetailCompactionPublicationWorkItems(
  completed: readonly Readonly<{
    field: SeedWorldDetailDensityField;
    patches: readonly DetailCompactionPatch[];
  }>[],
  transformPool: DetailTransformBufferPool
): readonly DetailCompactionPublicationWorkItem[] {
  const groups: Array<{
    readonly field: SeedWorldDetailDensityField;
    readonly patchX: number;
    readonly patchZ: number;
    readonly patches: DetailCompactionPatch[];
    instanceCount: number;
    candidateCount: number;
  }> = [];
  for (const result of completed) {
    for (const patch of result.patches) {
      if (patch.instanceCount === 0) {
        transformPool.release(patch.transforms);
        continue;
      }
      let group: (typeof groups)[number] | undefined;
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        const candidate = groups[groupIndex]!;
        if (
          candidate.field.category === result.field.category &&
          candidate.field.assetProfileKey === result.field.assetProfileKey &&
          candidate.patchX === patch.patchX &&
          candidate.patchZ === patch.patchZ
        ) {
          group = candidate;
          break;
        }
      }
      if (group) {
        group.patches.push(patch);
        group.instanceCount += patch.instanceCount;
        group.candidateCount += patch.candidateCount;
      } else {
        group = {
          field: result.field,
          patchX: patch.patchX,
          patchZ: patch.patchZ,
          patches: [patch],
          instanceCount: patch.instanceCount,
          candidateCount: patch.candidateCount
        };
        groups.push(group);
      }
    }
  }

  const workItems = new Array<DetailCompactionPublicationWorkItem>(groups.length);
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex]!;
    const onlyPatch = group.patches.length === 1 ? group.patches[0]! : undefined;
    const direct = Boolean(
      onlyPatch &&
        onlyPatch.transforms.length <=
          group.instanceCount * DETAIL_TRANSFORM_FLOATS * DETAIL_TRANSFORM_DIRECT_TRANSFER_CAPACITY_RATIO
    );
    workItems[groupIndex] = {
      field: group.field,
      copySources: direct ? undefined : group.patches,
      sourceIndex: 0,
      sourceOffset: 0,
      targetOffset: 0,
      shuffle: group.field.category === "grass" ? createGrassDensityShuffle(group.instanceCount) : undefined,
      preparedInstances: 0,
      prepared: false,
      patch: {
        patchX: group.patchX,
        patchZ: group.patchZ,
        transforms: direct ? onlyPatch!.transforms : EMPTY_DETAIL_TRANSFORMS,
        instanceCount: group.instanceCount,
        candidateCount: group.candidateCount
      }
    };
  }
  return workItems;
}

function createRockSurfaceGrassDensity(
  populationLayout: SeedWorldPopulationPreview,
  fields: SeedWorldFields,
  densityMultiplier: number
): SeedWorldRockSurfaceGrassDensity {
  const terrestrialGrassKeys = new Set(
    populationLayout.detailSpeciesProfiles
      .filter((profile) => profile.category === "grass" && profile.habitat === "terrestrial")
      .map((profile) => profile.key)
  );
  const densityFields = populationLayout.detailDensityFields.filter((field) =>
    terrestrialGrassKeys.has(field.prototypeFamily)
  );
  const maximumDensityPerSquareMetre = densityFields.reduce(
    (sum, field) => sum + field.maximumDensityPerSquareMetre * densityMultiplier,
    0
  );
  const samplers = densityFields.map((field) => createSeedWorldDetailDensitySampler(field, fields.sizeMetres));
  return Object.freeze({
    maximumDensityPerSquareMetre,
    sampleDensityPerSquareMetre(worldX: number, worldZ: number): number {
      let density = 0;
      const x = worldX - seedWorldOriginX(fields) - fields.sizeMetres / 2;
      const z = worldZ - seedWorldOriginZ(fields) - fields.sizeMetres / 2;
      for (const sample of samplers) {
        density += sample(x, z) * densityMultiplier;
      }
      return density;
    }
  });
}

function sampleTerrestrialGrassSurfaceWeights(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  out: [grass: number, road: number, remaining: number]
): void {
  const resolution = fields.surfaceResolution;
  // Match Terrain's endpoint-aligned alphamap grid for grass density and clump scale.
  const x = clamp((worldX - seedWorldOriginX(fields)) / fields.sizeMetres, 0, 1) * (resolution - 1);
  const z = clamp((worldZ - seedWorldOriginZ(fields)) / fields.sizeMetres, 0, 1) * (resolution - 1);
  const x0 = clamp(Math.floor(x), 0, resolution - 1);
  const z0 = clamp(Math.floor(z), 0, resolution - 1);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const z1 = Math.min(resolution - 1, z0 + 1);
  const fractionX = clamp(x - x0, 0, 1);
  const fractionZ = clamp(z - z0, 0, 1);
  const index00 = z0 * resolution + x0;
  const index10 = z0 * resolution + x1;
  const index01 = z1 * resolution + x0;
  const index11 = z1 * resolution + x1;
  const grass00 = resolveSeedWorldGrassSurfaceWeight(fields, index00);
  const grass10 = resolveSeedWorldGrassSurfaceWeight(fields, index10);
  const grass01 = resolveSeedWorldGrassSurfaceWeight(fields, index01);
  const grass11 = resolveSeedWorldGrassSurfaceWeight(fields, index11);
  const road00 = fields.materialWeights[index00 * 4 + 3]!;
  const road10 = fields.materialWeights[index10 * 4 + 3]!;
  const road01 = fields.materialWeights[index01 * 4 + 3]!;
  const road11 = fields.materialWeights[index11 * 4 + 3]!;
  out[0] = bilinearSurfaceWeight(grass00, grass10, grass01, grass11, fractionX, fractionZ);
  out[1] = bilinearSurfaceWeight(road00, road10, road01, road11, fractionX, fractionZ);
  out[2] = bilinearSurfaceWeight(
    Math.max(0, 255 - grass00 - road00),
    Math.max(0, 255 - grass10 - road10),
    Math.max(0, 255 - grass01 - road01),
    Math.max(0, 255 - grass11 - road11),
    fractionX,
    fractionZ
  );
}

function bilinearSurfaceWeight(
  value00: number,
  value10: number,
  value01: number,
  value11: number,
  fractionX: number,
  fractionZ: number
): number {
  const near = value00 * (1 - fractionX) + value10 * fractionX;
  const far = value01 * (1 - fractionX) + value11 * fractionX;
  return (near * (1 - fractionZ) + far * fractionZ) / 255;
}

function sampleSeedWorldTerrainNormal(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  out: [x: number, y: number, z: number]
): void {
  const originX = seedWorldOriginX(fields),
    originZ = seedWorldOriginZ(fields);
  const metresPerTexel = fields.sizeMetres / fields.heightResolution;
  const left = sampleSeedWorldHeight(fields, Math.max(originX, worldX - metresPerTexel), worldZ);
  const right = sampleSeedWorldHeight(fields, Math.min(originX + fields.sizeMetres, worldX + metresPerTexel), worldZ);
  const down = sampleSeedWorldHeight(fields, worldX, Math.max(originZ, worldZ - metresPerTexel));
  const up = sampleSeedWorldHeight(fields, worldX, Math.min(originZ + fields.sizeMetres, worldZ + metresPerTexel));
  if (left === undefined || right === undefined || down === undefined || up === undefined) {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return;
  }
  const normalX = left - right;
  const normalY = metresPerTexel * 2;
  const normalZ = down - up;
  const inverseLength = 1 / Math.max(Math.hypot(normalX, normalY, normalZ), Number.EPSILON);
  out[0] = normalX * inverseLength;
  out[1] = normalY * inverseLength;
  out[2] = normalZ * inverseLength;
}

function rescaleGrassDetailBatchHeight(
  batch: DetailPopulationBatch,
  scaleRange: Readonly<{ minimum: number; maximum: number }>
): void {
  const previousMinimum = batch.grassScaleMinimum;
  const previousMaximum = batch.grassScaleMaximum;
  if (previousMinimum === undefined || previousMaximum === undefined) return;
  const previousSpan = previousMaximum - previousMinimum;
  const transformFloatCount = batch.instanceCount * DETAIL_TRANSFORM_FLOATS;
  for (let offset = 0; offset < transformFloatCount; offset += DETAIL_TRANSFORM_FLOATS) {
    const coverageScale = grassDetailCoverageScale(batch.transforms, offset);
    const previousScale =
      coverageScale > Number.EPSILON ? batch.transforms[offset + 5]! / coverageScale : previousMinimum;
    const variation =
      previousSpan > Number.EPSILON
        ? clamp((previousScale - previousMinimum) / previousSpan, 0, 1)
        : stableGrassHeightVariation(batch.transforms[offset]!, batch.transforms[offset + 2]!);
    const verticalScale = scaleRange.minimum + (scaleRange.maximum - scaleRange.minimum) * variation;
    batch.transforms[offset + 4] =
      batch.transforms[offset + 5] =
      batch.transforms[offset + 6] =
        verticalScale * coverageScale;
  }
  batch.grassScaleMinimum = scaleRange.minimum;
  batch.grassScaleMaximum = scaleRange.maximum;
  if (batch.instanceCount === 0) return;
  batch.resources.instanceBuffer.setData(batch.transforms, 0, 0, transformFloatCount, SetDataOptions.Discard);
  updateCompactedDetailBounds(batch.bounds, batch.transforms, batch.localBounds, batch.instanceCount);
  batch.resources.mesh.bounds = batch.bounds;
  setAssetEntranceRevealRangeValues(batch.renderer, batch.bounds.min.y, batch.bounds.max.y);
}

function grassDetailCoverageScale(transforms: Float32Array, offset: number): number {
  const surfaceCoverage = transforms[offset + DETAIL_SURFACE_WEIGHTS_FLOAT_OFFSET]!;
  return seedWorldGrassCoverageScale(surfaceCoverage);
}

function stableGrassHeightVariation(worldX: number, worldZ: number): number {
  return seedWorldDetailUnitFloat(Math.imul(Math.round(worldX * 1_000), 0x9e37_79b9) ^ Math.round(worldZ * 1_000));
}

function refreshDetailBatchGrounding(batch: DetailPopulationBatch, fields: SeedWorldFields): void {
  if (batch.instanceCount === 0) return;
  const terrainNormal: [x: number, y: number, z: number] = [0, 1, 0];
  const transformFloatCount = batch.instanceCount * DETAIL_TRANSFORM_FLOATS;
  for (let offset = 0; offset < transformFloatCount; offset += DETAIL_TRANSFORM_FLOATS) {
    const worldX = batch.transforms[offset]!;
    const worldZ = batch.transforms[offset + 2]!;
    const height = sampleSeedWorldHeight(fields, worldX, worldZ);
    if (height === undefined) continue;
    sampleSeedWorldTerrainNormal(fields, worldX, worldZ, terrainNormal);
    batch.transforms[offset + 1] = height;
    batch.transforms[offset + DETAIL_TERRAIN_NORMAL_FLOAT_OFFSET] = terrainNormal[0];
    batch.transforms[offset + DETAIL_TERRAIN_NORMAL_FLOAT_OFFSET + 1] = terrainNormal[1];
    batch.transforms[offset + DETAIL_TERRAIN_NORMAL_FLOAT_OFFSET + 2] = terrainNormal[2];
  }
  batch.resources.instanceBuffer.setData(batch.transforms, 0, 0, transformFloatCount, SetDataOptions.Discard);
  updateCompactedDetailBounds(batch.bounds, batch.transforms, batch.localBounds, batch.instanceCount);
  // Mesh copies bounds on assignment; keep engine culling synchronized with the mutable batch bounds.
  batch.resources.mesh.bounds = batch.bounds;
  setAssetEntranceRevealRangeValues(batch.renderer, batch.bounds.min.y, batch.bounds.max.y);
}

function updateCompactedDetailBounds(
  bounds: BoundingBox,
  transforms: Float32Array,
  localBounds: BoundingBox,
  instanceCount = transforms.length / DETAIL_TRANSFORM_FLOATS,
  firstInstance = 0,
  lastInstance = instanceCount
): void {
  const localPivotRadius = detailLocalPivotRadius(localBounds) * DETAIL_WIND_BOUNDS_RADIUS_SCALE;
  let minimumX = firstInstance ? bounds.min.x : Number.POSITIVE_INFINITY;
  let minimumY = firstInstance ? bounds.min.y : Number.POSITIVE_INFINITY;
  let minimumZ = firstInstance ? bounds.min.z : Number.POSITIVE_INFINITY;
  let maximumX = firstInstance ? bounds.max.x : Number.NEGATIVE_INFINITY;
  let maximumY = firstInstance ? bounds.max.y : Number.NEGATIVE_INFINITY;
  let maximumZ = firstInstance ? bounds.max.z : Number.NEGATIVE_INFINITY;
  const transformFloatCount = lastInstance * DETAIL_TRANSFORM_FLOATS;
  for (
    let offset = firstInstance * DETAIL_TRANSFORM_FLOATS;
    offset < transformFloatCount;
    offset += DETAIL_TRANSFORM_FLOATS
  ) {
    const radius =
      localPivotRadius * Math.max(transforms[offset + 4]!, transforms[offset + 5]!, transforms[offset + 6]!);
    const positionX = transforms[offset]!;
    const positionY = transforms[offset + 1]!;
    const positionZ = transforms[offset + 2]!;
    minimumX = Math.min(minimumX, positionX - radius);
    minimumY = Math.min(minimumY, positionY - radius);
    minimumZ = Math.min(minimumZ, positionZ - radius);
    maximumX = Math.max(maximumX, positionX + radius);
    maximumY = Math.max(maximumY, positionY + radius);
    maximumZ = Math.max(maximumZ, positionZ + radius);
  }
  bounds.min.x = minimumX;
  bounds.min.y = minimumY;
  bounds.min.z = minimumZ;
  bounds.max.x = maximumX;
  bounds.max.y = maximumY;
  bounds.max.z = maximumZ;
}

function disposeDetailBatch(batch: DetailPopulationBatch, transformPool?: DetailTransformBufferPool): void {
  if (batch.destroyed) return;
  if (batch.entrance) {
    batch.entrance.owner.batches.delete(batch);
    batch.entrance = undefined;
  }
  batch.destroyed = true;
  batch.renderer.enabled = false;
  batch.renderer.mesh = null!;
  batch.renderer.setMaterials([]);
  batch.resources.mesh.destroy();
  batch.resources.instanceBuffer.destroy(true);
  batch.entranceBuffer?.destroy(true);
  batch.rockAppearanceBuffer?.destroy(true);
  batch.entity.destroy();
  transformPool?.release(batch.transforms);
}

function removeUnordered<T>(values: T[], value: T): void {
  const index = values.indexOf(value);
  if (index < 0) return;
  const lastIndex = values.length - 1;
  values[index] = values[lastIndex]!;
  values.length = lastIndex;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function detachTreeLeafLightingTuning(tuning: TreeLeafLightingTuning): TreeLeafLightingTuning {
  return {
    ...tuning,
    baseColorRgb: [...tuning.baseColorRgb],
    secondColorRgb: [...tuning.secondColorRgb],
    translucencyColorRgb: [...tuning.translucencyColorRgb]
  };
}

/** Pure validated replacement used by both the live panel and focused runtime tests. */
export function patchSeedWorldTreeVariationControls(
  controls: readonly InstancedBirchVariationControls[],
  variationIndex: number,
  patch: Readonly<Partial<InstancedBirchVariationControls>>
): readonly InstancedBirchVariationControls[] {
  validateInstancedBirchVariationControls(controls);
  if (!Number.isInteger(variationIndex) || variationIndex < 0 || variationIndex >= controls.length) {
    throw new RangeError(`Seed World tree variation ${variationIndex + 1} is unavailable`);
  }
  const next = detachTreeVariationControls(controls);
  const current = next[variationIndex]!;
  next[variationIndex] = {
    ...current,
    ...patch,
    leafColorRgb: [...(patch.leafColorRgb ?? current.leafColorRgb)] as InstancedBirchVariationControls["leafColorRgb"],
    barkColorRgb: [...(patch.barkColorRgb ?? current.barkColorRgb)] as InstancedBirchVariationControls["barkColorRgb"]
  };
  validateInstancedBirchVariationControls(next);
  return Object.freeze(next.map((candidate) => Object.freeze(candidate)));
}

function detachTreeVariationControls(
  controls: readonly InstancedBirchVariationControls[]
): InstancedBirchVariationControls[] {
  return controls.map((controls) => ({
    ...controls,
    leafColorRgb: [...controls.leafColorRgb] as InstancedBirchVariationControls["leafColorRgb"],
    barkColorRgb: [...controls.barkColorRgb] as InstancedBirchVariationControls["barkColorRgb"]
  }));
}

/** Continuous recipe controls interpolate in their rendered units; density uses shader dissolve. */
export function interpolateSeedWorldTreeVariation(
  from: InstancedBirchPopulationVariation,
  to: InstancedBirchPopulationVariation,
  progress: number
): InstancedBirchPopulationVariation {
  if (progress === 1) return to;
  const lerp = (start: number, end: number): number => start + (end - start) * progress;
  return {
    ...to,
    yawRadians: lerp(from.yawRadians, to.yawRadians),
    horizontalScale: lerp(from.horizontalScale, to.horizontalScale),
    verticalScale: lerp(from.verticalScale, to.verticalScale),
    branchLengthScale: lerp(from.branchLengthScale, to.branchLengthScale),
    leafSizeScale: lerp(from.leafSizeScale, to.leafSizeScale),
    trunkThicknessScale: lerp(from.trunkThicknessScale, to.trunkThicknessScale),
    branchCurvatureRadiansPerMeter: lerp(from.branchCurvatureRadiansPerMeter, to.branchCurvatureRadiansPerMeter),
    branchDirectionSeed: to.branchDirectionSeed,
    leafColorRgb: to.leafColorRgb.map((value, index) =>
      lerp(from.leafColorRgb[index]!, value)
    ) as unknown as InstancedBirchPopulationVariation["leafColorRgb"],
    barkColorMultiplier: to.barkColorMultiplier.map((value, index) =>
      lerp(from.barkColorMultiplier[index]!, value)
    ) as unknown as InstancedBirchPopulationVariation["barkColorMultiplier"]
  };
}

function detachTreePopulationVariation(
  variation: InstancedBirchPopulationVariation
): InstancedBirchPopulationVariation {
  return Object.freeze({
    ...variation,
    leafColorRgb: [...variation.leafColorRgb] as InstancedBirchPopulationVariation["leafColorRgb"],
    barkColorMultiplier: [...variation.barkColorMultiplier] as InstancedBirchPopulationVariation["barkColorMultiplier"]
  });
}

function createProceduralTreeVariationLocalBounds(
  trunkBounds: readonly BoundingBox[],
  crownBounds: readonly BoundingBox[],
  variations: readonly InstancedBirchPopulationVariation[]
): readonly ProceduralTreeVariationBounds[] {
  if (trunkBounds.length !== crownBounds.length || trunkBounds.length === 0) {
    throw new Error("Procedural tree variation Bounds require matching non-empty trunk and crown LODs");
  }
  return variations.map((variation) => {
    const parts: BoundingBox[] = [];
    for (let lodIndex = 0; lodIndex < trunkBounds.length; lodIndex++) {
      parts.push(
        createInstancedBirchVariationLocalBounds(trunkBounds[lodIndex]!, [variation]),
        createInstancedBirchVariationLocalBounds(crownBounds[lodIndex]!, [variation])
      );
    }
    const combined = detachBoundingBox(parts[0]!);
    for (let partIndex = 1; partIndex < parts.length; partIndex++) {
      BoundingBox.merge(combined, parts[partIndex]!, combined);
    }
    return { combined, parts };
  });
}

function detachBoundingBox(bounds: BoundingBox): BoundingBox {
  return new BoundingBox(
    new Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
    new Vector3(bounds.max.x, bounds.max.y, bounds.max.z)
  );
}

function worldBounds(fields: SeedWorldFields): BoundingBox {
  return new BoundingBox(
    new Vector3(seedWorldOriginX(fields), decodeSeedWorldHeight(fields, 0), seedWorldOriginZ(fields)),
    new Vector3(
      seedWorldOriginX(fields) + fields.sizeMetres,
      decodeSeedWorldHeight(fields, 65535),
      seedWorldOriginZ(fields) + fields.sizeMetres
    )
  );
}
function findObservationAnchor(
  plan: SeedWorldPlan,
  fields: SeedWorldFields
): Readonly<{ x: number; y: number; z: number }> {
  const half = fields.sizeMetres * 0.5;
  const step = 48;
  let best: { x: number; y: number; z: number; score: number } | undefined;
  for (let z = -half + INITIAL_ORBIT_VIEW_CLEARANCE_METRES; z < half - INITIAL_ORBIT_VIEW_CLEARANCE_METRES; z += step) {
    for (
      let x = -half + INITIAL_ORBIT_VIEW_CLEARANCE_METRES;
      x < half - INITIAL_ORBIT_VIEW_CLEARANCE_METRES;
      x += step
    ) {
      const sample = sampleSeedWorldPopulation(plan, fields, x, z);
      if (
        !sample ||
        sample.landCover !== SeedWorldLandCover.Grassland ||
        sample.water ||
        sample.slope > 0.2 ||
        sample.riverDistanceMetres < 18 ||
        sample.roadDistanceMetres < 14
      ) {
        continue;
      }
      let forestNeighbours = 0;
      for (const [offsetX, offsetZ] of [
        [-48, 0],
        [48, 0],
        [0, -48],
        [0, 48]
      ] as const) {
        const neighbour = sampleSeedWorldPopulation(plan, fields, x + offsetX, z + offsetZ);
        forestNeighbours += Number(neighbour?.landCover === SeedWorldLandCover.Forest);
      }
      // This is the default ROAM inspection anchor, not an ecological placement rule.
      // Keep it inside an open, flat grass habitat so the first real view exercises the
      // authored dense grass/flower buffers instead of immediately entering a forest edge.
      const score = 2 + sample.moisture * 0.85 - forestNeighbours * 0.7 - sample.slope * 1.2;
      if (!best || score > best.score) best = { x, y: sample.height, z, score };
    }
  }
  if (best) return best;
  const fallback = sampleSeedWorldPopulation(plan, fields, 0, 0);
  return { x: 0, y: fallback?.height ?? 120, z: 0 };
}

type DetailPickIdentity = (category: "grass" | "flower", x: number, z: number, owner?: string) => string | undefined;
interface DetailPickData {
  renderer: MeshRenderer;
  entity: Entity;
  instanceCount: number;
  transforms: Float32Array;
  owners?: readonly (string | undefined)[];
}
class SeedWorldDetailPickBatch extends SeedWorldArrayPickBatch {
  data!: DetailPickData;
  category: "grass" | "flower" = "grass";
  identity?: DetailPickIdentity;
  override instanced = true;
  override resolve(index: number): string | undefined {
    return this.identity?.(
      this.category,
      this.data.transforms[index * DETAIL_TRANSFORM_FLOATS]!,
      this.data.transforms[index * DETAIL_TRANSFORM_FLOATS + 2]!,
      this.data.owners?.[index]
    );
  }
}
