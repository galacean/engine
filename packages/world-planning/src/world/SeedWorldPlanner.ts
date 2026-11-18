import { compileSeedWorldNaturalHeightField, type SeedWorldFbmParameters } from "../runtime/SeedWorldFields.ts";
import {
  compileSeedWorldRiverCurves,
  rasterizeSeedWorldRiverField,
  sampleSeedWorldRiverCurve,
  seedWorldRiverBankRadius,
  type SeedWorldRiverCurve
} from "../runtime/SeedWorldRiverCurves.ts";
import {
  sampleSeedWorldWetlandInfluence,
  SEED_WORLD_WETLAND_BANK_EXPANSION_METRES,
  SEED_WORLD_WETLAND_SDF_TRANSITION_METRES
} from "./SeedWorldWetland";
import { SEED_WORLD_ASSET_PLACEMENT_PROFILE_VERSION } from "./SeedWorldAssetPlacementProfile";
import {
  SEED_WORLD_DETAIL_SPECIES_PROFILES,
  SEED_WORLD_DETAIL_SPECIES_PROFILE_VERSION
} from "./SeedWorldDetailSpecies";
import {
  SEED_WORLD_TREE_SPECIES_PROFILES,
  SEED_WORLD_TREE_SPECIES_PROFILE_VERSION,
  type SeedWorldTreeSpeciesProfile
} from "@galacean/engine-vegetation/world/SeedWorldTreeSpecies";
import {
  SEED_WORLD_TREE_COMMUNITY_PROFILE,
  SEED_WORLD_TREE_COMMUNITY_PROFILE_VERSION,
  type SeedWorldTreeCommunityProfile
} from "@galacean/engine-vegetation/world/SeedWorldTreeCommunity";
import { SEED_WORLD_ROAD_HALF_WIDTH_METRES } from "./SeedWorldFeatureGeometry";
import {
  sampleSeedWorldHeightBrushMask,
  SEED_WORLD_HILL_BRUSH_KEYS,
  SEED_WORLD_MOUNTAIN_DETAIL_BRUSH_KEYS,
  type SeedWorldHeightBrushMaskKey
} from "@galacean/engine-terrain/world/SeedWorldHeightBrush";
import { resolveSeedWorldClimateMoisture } from "@galacean/engine-terrain/world/SeedWorldSoilMoisture";
import {
  compileSeedWorldGeologyHeightfield,
  sampleSeedWorldGeologyCoastSignedDistanceMetres,
  sampleSeedWorldGeologyHeight,
  type SeedWorldGeologyLayout
} from "../runtime/SeedWorldGeologyLayout.ts";

export { SEED_WORLD_WETLAND_MAXIMUM_MOUNTAIN_UPLIFT_METRES } from "./SeedWorldWetland";

/** Coarse semantic lattice from which runtime terrain fields are compiled. */
export const SEED_WORLD_PLAN_RESOLUTION = 128;
/** Finite world extent rendered by the first Seed World demo. */
export const SEED_WORLD_SIZE_METRES = 3_072;
/** Uniform scale applied to discharge-derived river widths in world metres. */
export const SEED_WORLD_RIVER_WIDTH_SCALE = 5 / 3;
/** Default minimum and maximum river-bed depths derived from normalized discharge. */
export const SEED_WORLD_RIVER_DEPTH_RANGE_METRES = Object.freeze({ minimum: 3, maximum: 14 });
/** Terrain-constrained range used by each river point's dry-bank transition. */
export const SEED_WORLD_RIVER_BANK_FEATHER_RANGE_METRES = Object.freeze({ minimum: 4, maximum: 10 });
const PLAN_RESOLUTION = SEED_WORLD_PLAN_RESOLUTION;
const PLAN_SIZE_METRES = SEED_WORLD_SIZE_METRES;
const HYDROLOGY_EPSILON = 1e-6;
const SPAWN_CENTER = Object.freeze({ x: 0.5, y: 0.5 });
const SPAWN_PROTECTED_RADIUS = 0.065;
const SPAWN_MOUNTAIN_CLEARANCE_RADIUS = 0.09;
const SPAWN_HEIGHT_ATTENUATION_START_RADIUS = 0.035;
const SPAWN_HEIGHT_ATTENUATION_END_RADIUS = 0.08;
const MOUNTAIN_MAJOR_RADIUS_RANGE = Object.freeze({ minimum: 0.14, maximum: 0.22 });
const MOUNTAIN_MINOR_RADIUS_RANGE = Object.freeze({ minimum: 0.085, maximum: 0.13 });
const MOUNTAIN_UPLIFT_RANGE_METRES = Object.freeze({ minimum: 110, maximum: 175 });
/** Maximum authored mountain uplift represented by the planning R16 preview cache. */
export const SEED_WORLD_MAXIMUM_MOUNTAIN_UPLIFT_METRES = 230;
const HIGHLAND_UPLIFT_RANGE_METRES = Object.freeze({
  minimum: 175,
  maximum: SEED_WORLD_MAXIMUM_MOUNTAIN_UPLIFT_METRES
});
const MOUNTAIN_LAYER_SMOOTH_UNION_METRES = 20;
const MAXIMUM_VISIBLE_TRIBUTARIES = 3;
const RIVER_CROSS_SECTION_SAMPLE_DISTANCE_METRES = 48;
const RIVER_CONFINEMENT_RELIEF_RANGE_METRES = Object.freeze({ open: 0.5, confined: 12 });
const RIVER_CONFINED_WIDTH_FACTOR = 0.55;
/** Maximum rise divided by horizontal run retained by the final one-metre road surface. */
export const SEED_WORLD_MAXIMUM_ROAD_GRADE = 0.27;
/** Stricter planning grade that reserves room for continuous rasterization at bends and junctions. */
export const SEED_WORLD_MAXIMUM_ROAD_ROUTING_GRADE = 0.2;
const ROAD_NATURAL_HEIGHT_RESOLUTION = 64;
const BRIDGE_DRY_ABUTMENT_METRES = 4;
const ROAD_ROUTE_SMOOTHING_PASSES = 3;
const ROAD_EXACT_SAMPLE_SPACING_METRES = 1;
const ROAD_CONTINUOUS_CONSTRAINT_SAMPLE_SPACING_METRES = SEED_WORLD_ROAD_HALF_WIDTH_METRES * 0.5;
const ROAD_MAXIMUM_WETLAND_INFLUENCE = 0.5 / 255;
/** Default natural-road profile shared by routing, 2D coverage, and later field compilation. */
export const SEED_WORLD_ROAD_STYLE: SeedWorldRoadStyle = Object.freeze({
  waterViewRadiusMetres: 500,
  coreHalfWidthMetres: SEED_WORLD_ROAD_HALF_WIDTH_METRES,
  minimumCoreHalfWidthMetres: 2.75,
  shoulderWidthMetres: Object.freeze([1.5, 8] as const),
  confinedReliefMetres: 10
});
const planValidationCache = new WeakMap<SeedWorldPlan, readonly SeedWorldPlanIssue[]>();
const coastSamplingParametersCache = new WeakMap<
  SeedWorldCoastShape,
  Readonly<{ cosine: number; sine: number; inverseRadiusX: number; inverseRadiusZ: number }>
>();
const NEIGHBORS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
] as const;

/** Ordered causal stages represented by the packed Root Seed. */
export const SeedWorldStages = ["geology", "hydrology", "ecology", "road", "detail"] as const;

/** One named stage in the world-planning dependency graph. */
export type SeedWorldStage = (typeof SeedWorldStages)[number];

/** Bit widths that partition the full unsigned 32-bit Root Seed. */
export const SeedWorldStageBitWidths = Object.freeze({
  geology: 10,
  hydrology: 7,
  ecology: 5,
  road: 7,
  detail: 3
} satisfies Record<SeedWorldStage, number>);

/** Debug-visible codes packed into the full unsigned 32-bit Root Seed. */
export interface SeedWorldStageCodes {
  readonly geology: number;
  readonly hydrology: number;
  readonly ecology: number;
  readonly road: number;
  readonly detail: number;
}

/** Internal full-width random streams derived from the packed Root Seed. */
export interface SeedWorldStageSeeds {
  /** Terrain morphology and summit placement. */
  readonly geology: number;
  /** Rainfall variation and water-network selection constrained by terrain. */
  readonly hydrology: number;
  /** Habitat clustering constrained by terrain and water. */
  readonly ecology: number;
  /** POI selection and pathfinding constrained by the natural plan. */
  readonly road: number;
  /** Rocks and other small-scale emphasis constrained by every upstream stage. */
  readonly detail: number;
}

/** Named generation streams derived from existing causal stage streams. */
export interface SeedWorldGenerationStreams {
  /** Geology-owned terrain intent stream. */
  readonly terrain: number;
  /** Feature-bound discrete-decoration stream. */
  readonly decor: number;
  /** Habitat-driven vegetation population stream. */
  readonly vegetation: number;
}

/** Input for one deterministic world plan. */
export interface SeedWorldPlanRequest {
  /** Full 32-bit world identity. It is the only value persisted outside debug UI. */
  readonly rootSeed: number;
  /** Optional shared geology layout replacing legacy brush-authored terrain at the first planning stage. */
  readonly geologyLayout?: SeedWorldGeologyLayout;
  /** Optional ground-noise profile shared with the supplied geology layout. */
  readonly fbm?: SeedWorldFbmParameters;
}

/**
 * Normalized point in the generated planning domain.
 * `(0.5, 0.5)` maps to world origin; increasing `x` and `y` map to increasing world X and Z.
 */
export interface SeedWorldPoint {
  /** World-X coordinate normalized to the inclusive range 0–1. */
  readonly x: number;
  /** World-Z coordinate normalized to the inclusive range 0–1. */
  readonly y: number;
}

/** Continuous spawn-area constraints consumed by terrain compilers. */
export interface SeedWorldSpawnReserve {
  /** Normalized location that maps to the world-space spawn origin. */
  readonly center: SeedWorldPoint;
  /** Radius kept free of summit annotations. */
  readonly protectedRadiusMetres: number;
  /** Minimum distance enforced between the spawn origin and mountain-brush centers. */
  readonly mountainClearanceRadiusMetres: number;
  /** Radius inside which mountain uplift is fully suppressed. */
  readonly heightAttenuationStartRadiusMetres: number;
  /** Radius outside which mountain uplift reaches full strength. */
  readonly heightAttenuationEndRadiusMetres: number;
}

/** One R16 mask layer within a generated mountain brush. */
export interface SeedWorldMountainBrushLayer {
  /** Stable layer identity within the owning brush. */
  readonly id: string;
  /** Semantic layer role used by tests and authoring diagnostics. */
  readonly role: "base" | "detail";
  /** Versioned grayscale R16 mask. */
  readonly maskKey: SeedWorldHeightBrushMaskKey;
  /** Radius relative to the owning mountain support ellipse. */
  readonly radiusScale: number;
  /** Local counter-clockwise mask rotation relative to the owning brush. */
  readonly angleOffsetRadians: number;
  /** Maximum height contribution relative to the owning brush uplift. */
  readonly strengthRatio: number;
}

/** One continuous multi-layer uplift brush belonging to a generated mountain ridge. */
export interface SeedWorldMountainBrush {
  /** Stable identity within the plan. */
  readonly id: string;
  /** Normalized brush center. */
  readonly center: SeedWorldPoint;
  /** Major ellipse radius in world metres. */
  readonly majorRadiusMetres: number;
  /** Minor ellipse radius in world metres. */
  readonly minorRadiusMetres: number;
  /** Counter-clockwise brush orientation in the normalized X-Z plane. */
  readonly angleRadians: number;
  /** Maximum uplift contributed to the shared mountain envelope before coast and spawn attenuation. */
  readonly upliftMetres: number;
  /** World-space blend radius used when the hill and mountain layers overlap. */
  readonly smoothUnionMetres: number;
  /** Broad hill foundation and localized mountain-detail masks sampled by 2D and Heightmap compilation. */
  readonly layers: readonly SeedWorldMountainBrushLayer[];
}

/** Ordered mountain intent generated as one ridge chain. */
export interface SeedWorldMountainRidge {
  /** Stable identity within the plan. */
  readonly id: string;
  /** Continuous uplift brushes ordered along the ridge. */
  readonly brushes: readonly SeedWorldMountainBrush[];
}

/** Parameters of the continuous coast level set shared by every downstream field. */
export interface SeedWorldCoastShape {
  /** Physical width and depth of the represented world. */
  readonly sizeMetres: number;
  /** Normalized center of the island's broad superellipse. */
  readonly center: SeedWorldPoint;
  /** Broad superellipse radius along its local X axis. */
  readonly radiusXMetres: number;
  /** Broad superellipse radius along its local Z axis. */
  readonly radiusZMetres: number;
  /** Counter-clockwise rotation of the broad superellipse. */
  readonly angleRadians: number;
  /** Superellipse exponent controlling broad coastal squareness. */
  readonly squareness: number;
  /** Stable random source for broad and coastal warping. */
  readonly warpSeed: number;
  /** Calibrated level-set threshold that produces the Seed-specific land ratio. */
  readonly contourLevel: number;
  /** Optional geology-layout coastline replacing the legacy superellipse sampler. */
  readonly geology?: Readonly<{
    /** Unsigned geology entropy owning the coastline noise. */
    readonly geologySeed: number;
    /** Resolved geology parameters required by the analytic coastline. */
    readonly parameters: SeedWorldGeologyLayout["parameters"];
  }>;
}

/** One generated summit retained for map annotation and future terrain compilation. */
export interface SeedWorldSummit extends SeedWorldPoint {
  /** Normalized summit elevation. */
  readonly elevation: number;
}

/** One sampled point on a downhill river reach. */
export interface SeedWorldRiverPoint extends SeedWorldPoint {
  /** Depression-filled elevation used by the drainage solver. */
  readonly elevation: number;
  /** Upstream rainfall accumulated at this point. */
  readonly discharge: number;
  /** River width in metres derived from discharge. */
  readonly widthMetres: number;
  /** River-bed depth in metres derived from the same accumulated discharge as width. */
  readonly depthMetres: number;
  /** Dry-bank feather in metres after terrain-confinement response. */
  readonly bankFeatherMetres: number;
  /** Authoritative monotonically descending terrain-bed elevation in world metres. */
  readonly bedElevationMetres: number;
  /** Whether this sample is a preserved tributary confluence on the trunk. */
  readonly junction?: boolean;
}

/** One source-to-confluence, confluence-to-confluence, or confluence-to-outlet river reach. */
export interface SeedWorldRiverReach {
  /** Stable identity within this plan. */
  readonly id: string;
  /** Main source-to-ocean channel or one direct tributary that merges into it. */
  readonly kind: "trunk" | "tributary";
  /** Ordered downstream samples. */
  readonly points: readonly SeedWorldRiverPoint[];
}

/** Planning point that the road network must connect. */
export interface SeedWorldPoi {
  /** Stable identity within this plan. */
  readonly id: string;
  /** Coarse semantic role used only by the planning preview. */
  readonly kind: "settlement" | "lookout" | "crossroads";
  /** Normalized location. */
  readonly position: SeedWorldPoint;
}

/** One sampled point on a planned road. */
export interface SeedWorldRoadPoint extends SeedWorldPoint {
  /** Coarse preview marker derived from authoritative bridge arc intervals. */
  readonly bridge: boolean;
  /** Road-independent natural terrain elevation used by the hard grade gate. */
  readonly naturalHeightMetres: number;
  /** Stable paved half-width derived from local terrain confinement and the Road stage Seed. */
  readonly coreHalfWidthMetres: number;
  /** Soft surface shoulder beyond the paved core, in metres. */
  readonly shoulderWidthMetres: number;
}

/** Versioned road-planning and surface-width configuration embedded in the generated plan. */
export interface SeedWorldRoadStyle {
  /** Soft radius within which a routed road receives no water-view cost. */
  readonly waterViewRadiusMetres: number;
  /** Base paved half-width before terrain confinement and low-frequency variation. */
  readonly coreHalfWidthMetres: number;
  /** Minimum paved half-width retained in confined terrain. */
  readonly minimumCoreHalfWidthMetres: number;
  /** Minimum and maximum soft shoulder width outside the paved core. */
  readonly shoulderWidthMetres: readonly [minimum: number, maximum: number];
  /** Cross-slope relief in metres at which the road reaches its narrowest profile. */
  readonly confinedReliefMetres: number;
}

/** One exact arc-length interval where a road bridge spans a canonical water channel. */
export interface SeedWorldRoadBridgeInterval {
  /** Dry-bank start of the bridge deck measured along the road. */
  readonly startArcMetres: number;
  /** Dry-bank end of the bridge deck measured along the road. */
  readonly endArcMetres: number;
  /** First arc position owned by water inside the bridge. */
  readonly waterStartArcMetres: number;
  /** Last arc position owned by water inside the bridge. */
  readonly waterEndArcMetres: number;
}

/** One route connecting two planning points. */
export interface SeedWorldRoad {
  /** Stable identity within this plan. */
  readonly id: string;
  /** Source planning point identity. */
  readonly fromPoiId: string;
  /** Destination planning point identity. */
  readonly toPoiId: string;
  /** Ordered route samples. */
  readonly points: readonly SeedWorldRoadPoint[];
  /** Exact bridge spans compiled from canonical channel geometry. */
  readonly bridgeIntervals: readonly SeedWorldRoadBridgeInterval[];
}

/** Inclusive integer range generated per upstream feature. */
export interface SeedWorldCountRange {
  /** Minimum generated count. */
  readonly minimum: number;
  /** Maximum generated count. */
  readonly maximum: number;
}

/** Natural-feature grammar used by the shared rock compiler. */
export interface SeedWorldRockDecorationRule {
  /** Stable category-specific rule identity. */
  readonly id: string;
  /** Discrete decoration category. */
  readonly category: "rock";
  /** Upstream feature which owns generated clusters. */
  readonly sourceKind: "mountain" | "wetland" | "riverbank" | "river" | "roadside" | "lake-outcrop";
  /** Asset-neutral profile selected by this semantic feature grammar. */
  readonly profileKey: "cliff-rock";
  /** Cluster-anchor count generated per source feature. */
  readonly clustersPerFeature: SeedWorldCountRange;
  /** Discrete rock count generated around each accepted anchor. */
  readonly piecesPerCluster: SeedWorldCountRange;
  /** Preferred spacing along the owning feature contour or arc. */
  readonly spacingMetres: number;
  /** Maximum stable offset perpendicular to the owning feature. */
  readonly lateralJitterMetres: number;
  /** Optional per-instance multiplier range applied after the authored role size is resolved. */
  readonly sizeMultiplierRange?: readonly [minimum: number, maximum: number];
  /** Optional fraction of fitted world height intentionally left visible above Hfinal. */
  readonly visibleHeightRatio?: number;
  /** Optional normalized MountainProfile band used by mountain anchors. */
  readonly mountainProfileBand?: readonly [number, number];
  /** Maximum final Heightmap slope accepted at a mountain-rock anchor. */
  readonly maximumSlopeDegrees?: number;
  /** Optional continuous inside-wetland distance range used to prefer shoreline anchors. */
  readonly wetlandDistanceMetres?: Readonly<{ minimum: number; preferredMaximum: number; maximum: number }>;
  /** Optional dry-bank offset used by arc-length river decorations. */
  readonly riverBankOffsetMetres?: readonly [minimum: number, maximum: number];
  /** Optional fraction of the local half-width used by in-channel rocks. */
  readonly riverChannelOffsetRatio?: readonly [minimum: number, maximum: number];
  /** Optional interior shoreline clearance used to select emergent lake outcrop anchors. */
  readonly lakeInteriorDistanceMetres?: readonly [minimum: number, preferred: number];
  /** Optional minimum connected water area eligible for a lake outcrop. */
  readonly minimumWaterAreaSquareMetres?: number;
  /** Optional connected-water area represented by one lake-outcrop cluster. */
  readonly lakeOutcropAreaPerClusterSquareMetres?: number;
  /** Optional maximum bed depth accepted at lake-outcrop anchors. */
  readonly maximumWaterDepthMetres?: number;
  /** Dry offset beyond the variable-width road shoulder used by roadside clusters. */
  readonly roadsideOffsetMetres?: readonly [minimum: number, maximum: number];
}

/** Unified debris grammar compiled radially around accepted parent rocks. */
export interface SeedWorldStoneDecorationRule {
  /** Stable category-specific rule identity. */
  readonly id: string;
  /** Discrete decoration category. */
  readonly category: "debris";
  /** Parent-rock feature class owning generated debris. */
  readonly sourceKind: "mountain" | "riverbank" | "river" | "roadside" | "lake-outcrop";
  /** Asset-neutral variants selected independently for every debris piece. */
  readonly profileKeys: readonly ("feature-stone" | "small-stone")[];
  /** Fraction of parent rocks receiving debris. */
  readonly parentCoverage: number;
  /** Inclusive debris count around one selected parent. */
  readonly piecesPerParent: SeedWorldCountRange;
  /** Extra radial distance beyond the parent and child footprints. */
  readonly radialOffsetMetres: readonly [minimum: number, maximum: number];
  /** Optional visual support contraction used when authored bounds exceed the visible parent silhouette. */
  readonly parentSupportRadiusRatio?: number;
  /** Maximum accepted final-terrain slope angle in degrees. */
  readonly maximumSlopeDegrees: number;
  /** Optional per-instance multiplier range applied after the authored role size is resolved. */
  readonly sizeMultiplierRange?: readonly [minimum: number, maximum: number];
}

/** Sparse mushroom clusters bound to accepted rock footprints. */
export interface SeedWorldMushroomDecorationRule {
  /** Stable category-specific rule identity. */
  readonly id: string;
  /** Discrete decoration category. */
  readonly category: "mushroom";
  /** Parent feature grammar. */
  readonly sourceKind: "rock-edge";
  /** Asset-neutral authored mushroom profile. */
  readonly profileKey: "mushroom";
  /** Fraction of parent rocks that receive a cluster. */
  readonly parentCoverage: number;
  /** Mushroom pieces attempted around one selected parent. */
  readonly piecesPerCluster: SeedWorldCountRange;
  /** Extra gap beyond the parent footprint edge. */
  readonly edgeOffsetMetres: readonly [minimum: number, maximum: number];
  /** Minimum normalized moisture accepted by this species. */
  readonly minimumMoisture: number;
  /** Maximum final-terrain slope accepted by the cluster. */
  readonly maximumSlope: number;
}

/** One category-specific feature decoration rule. */
export type SeedWorldFeatureDecorationRule =
  | SeedWorldRockDecorationRule
  | SeedWorldStoneDecorationRule
  | SeedWorldMushroomDecorationRule;

/** Habitat-density intent consumed later by the existing Population Cell path. */
export interface SeedWorldVegetationRule {
  /** Stable vegetation category. */
  readonly category: "tree" | "shrub" | "flower" | "grass";
  /** Asset-neutral profile selected by this habitat grammar. */
  readonly profileKey: "tree" | "shrub" | "flower" | "grass";
  /** Target accepted population density within terrain that passes this category's habitat gate. */
  readonly targetDensityPerSquareMetre: number;
  /** Minimum relative density retained inside qualified habitat so noise clusters do not globally thin the authored target. */
  readonly minimumQualifiedDensity: number;
  /** Stable candidate count evaluated inside each Population Cell. */
  readonly candidatesPerCell: number;
  /** World-space cluster-noise wavelength. */
  readonly clusterWavelengthMetres: number;
  /** Cluster-noise contrast applied after habitat suitability. */
  readonly clusterContrast: number;
  /** Relative response to forest habitat. */
  readonly forestWeight: number;
  /** Relative response to grassland habitat. */
  readonly grasslandWeight: number;
  /** Accepted normalized moisture interval. */
  readonly moistureRange: readonly [number, number];
  /** Maximum accepted planner slope. */
  readonly maximumSlope: number;
}

/**
 * Maximum discrete vegetation cardinality accepted by one exact single/cluster
 * authoring operation. Area brushes remain density fields and do not use this
 * bound. Keeping the limit beside the runtime operation contract makes the
 * public API and the deterministic solver share one executable capacity rule.
 */
export const SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES = 512;

interface SeedWorldTreeScatterOperationBase {
  /** Stable operation identity derived from the Root Seed. */
  readonly id: string;
  /** Whole-plant category that compiles to exact transforms. */
  readonly category: "tree" | "shrub";
  /** Asset-neutral family resolved by the placement profile. */
  readonly prototypeFamily: "tree" | "shrub";
  /** Target stable instance density inside the brush before category-specific placement rules. */
  readonly densityPerSquareMetre: number;
  /** Minimum authored world height before profile-relative scale resolution. */
  readonly minimumHeightMetres: number;
  /** Maximum authored world height before profile-relative scale resolution. */
  readonly maximumHeightMetres: number;
  /** Whether X-Z scale follows the resolved vertical scale. */
  readonly lockWidthToHeight: boolean;
  /** Whether each exact instance receives its stable yaw from the operation seed. */
  readonly randomRotation: boolean;
  /** Stable colour-variation strength carried to the final instance consumer. */
  readonly colorVariation: number;
  /** Named Root-Seed child used only by this operation. */
  readonly seed: number;
}

/** One Seed-generated habitat fill or explicit local tree/shrub brush retained as world-authoring input. */
export type SeedWorldTreeScatterOperation = SeedWorldTreeScatterOperationBase &
  (
    | {
        /** Applies this operation across its qualified habitat without pretending it is a local brush. */
        readonly distribution: "habitat-fill";
      }
    | {
        /** Applies this operation only inside one explicit user or Prompt brush. */
        readonly distribution: "local-brush";
        /** Stable Authoring resource identity shared by every prototype operation emitted for this brush. */
        readonly authoringBrushId: string;
        /** Normalized brush centre in the generated world. */
        readonly center: SeedWorldPoint;
        /** Circular authoring-brush radius in metres. */
        readonly radiusMetres: number;
        /**
         * Exact discrete cardinality for single/cluster authoring. When present,
         * shrubs may overlap to materialize this many instances; constrained
         * trees still reject the authoring transaction when the count cannot fit.
         */
        readonly exactInstanceCount?: number;
        /** A single instance is pinned to the authored centre; a cluster is deterministically scattered. */
        readonly exactPlacement?: "center" | "scatter";
      }
  );

interface SeedWorldDetailBrushOperationBase {
  /** Stable operation identity derived from the Root Seed. */
  readonly id: string;
  /** Dense-detail category compiled into a DensityField rather than map points. */
  readonly category: "grass" | "flower";
  /** Initial hard-edged mask; authored texture masks can extend this key later. */
  readonly brushMaskKey: "hard-circle";
  /** Authored Detail prototype selected by the operation. */
  readonly prototypeFamily: string;
  /** Unity-like paint opacity applied to this operation. */
  readonly opacity: number;
  /** Maximum detail density in accepted square metres. */
  readonly targetDensityPerSquareMetre: number;
  /** Named Root-Seed child used only by this operation. */
  readonly seed: number;
}

/** Water footprint carried by an aquatic local Detail operation into the Field Worker. */
export type SeedWorldAquaticHabitatMask =
  | Readonly<{
      kind: "radial";
      center: SeedWorldPoint;
      radiusMetres: number;
      featureKind: "pond" | "lake";
      shorelineIrregularityPermille: number;
      seed: number;
    }>
  | Readonly<{
      kind: "corridor";
      points: readonly SeedWorldPoint[];
      halfWidthMetres: number;
    }>;

/** One Seed-generated habitat fill or explicit local Detail brush retained as density-field authoring input. */
export type SeedWorldDetailBrushOperation = SeedWorldDetailBrushOperationBase &
  (
    | {
        /** Applies this operation across its qualified habitat without exposing a fictitious brush circle. */
        readonly distribution: "habitat-fill";
      }
    | {
        /** Applies this operation only inside one explicit user or Prompt brush. */
        readonly distribution: "local-brush";
        /** Normalized brush centre in the generated world. */
        readonly center: SeedWorldPoint;
        /** Circular authoring-brush radius in metres. */
        readonly radiusMetres: number;
        /** Authored Water footprints; the immutable WorldFields waterMask is always included as well. */
        readonly aquaticHabitatMasks?: readonly SeedWorldAquaticHabitatMask[];
      }
  );

/** Mutually exclusive planning cover stored per raster cell. */
export enum SeedWorldLandCover {
  Grassland = 0,
  Forest = 1,
  Wetland = 2
}

/** Complete deterministic planning result generated from a Root Seed and effective stage Seeds. */
export interface SeedWorldPlan {
  /** Contract version for diagnostics and future persistence. */
  readonly version: 29;
  /** Versioned authored asset-placement catalog required to replay exact transforms. */
  readonly assetPlacementProfileVersion: number;
  /** Versioned Detail-species catalog required to reproduce authored density fields. */
  readonly detailSpeciesProfileVersion: number;
  /** Versioned whole-tree species catalog required to reproduce exact species and height selection. */
  readonly treeSpeciesProfileVersion: number;
  /** Configurable moisture, mountain, height, and asset mapping for every whole-tree species. */
  readonly treeSpeciesProfiles: readonly SeedWorldTreeSpeciesProfile[];
  /** Versioned stand, gap, cohort-size, and competition policy required to reproduce whole-tree structure. */
  readonly treeCommunityProfileVersion: number;
  /** Configurable first-principles tree-community policy compiled once by the Worker. */
  readonly treeCommunityProfile: SeedWorldTreeCommunityProfile;
  /** Unsigned 32-bit Root Seed. */
  readonly rootSeed: number;
  /** Debug-visible packed codes; never stored separately from `rootSeed`. */
  readonly stageCodes: SeedWorldStageCodes;
  /** Internal full-width streams derived only from `rootSeed`. */
  readonly stageSeeds: SeedWorldStageSeeds;
  /** Named terrain, decoration, and vegetation streams derived from causal stage streams. */
  readonly generationStreams: SeedWorldGenerationStreams;
  /** Width and height of every square raster field. */
  readonly resolution: number;
  /** Physical width and height of the planning domain. */
  readonly sizeMetres: number;
  /** Shared terrain-layout result consumed by Height, roads, overlays, and downstream compilers. */
  readonly geologyLayout?: SeedWorldGeologyLayout;
  /** Continuous coast level set from which land ownership and the coastline are derived. */
  readonly coastShape: SeedWorldCoastShape;
  /** Continuous spawn protection applied to mountain uplift. */
  readonly spawnReserve: SeedWorldSpawnReserve;
  /** Authoritative mountain intent grouped into generated ridge chains. */
  readonly mountainRidges: readonly SeedWorldMountainRidge[];
  /** One-time R16 planning cache of the mountain brushes; 2D diagnostics never resample brush algorithms. */
  readonly mountainUpliftSamples: Uint16Array;
  /** Binary island ownership; zero denotes ocean and one denotes land. */
  readonly landMask: Uint8Array;
  /** World-clipped coast preview sampled from the same continuous coast field. */
  readonly coastline: readonly SeedWorldPoint[];
  /** Normalized terrain elevation in row-major order. */
  readonly height: Float32Array;
  /** Normalized terrain slope in row-major order. */
  readonly slope: Float32Array;
  /** Normalized signed terrain curvature in row-major order. */
  readonly curvature: Float32Array;
  /** Normalized upstream water accumulation in row-major order. */
  readonly flow: Float32Array;
  /** Normalized terrain moisture in row-major order. */
  readonly moisture: Float32Array;
  /** Final mutually exclusive land cover in row-major order. */
  readonly landCover: Uint8Array;
  /** Pre-road continuous wetland intent used by ecology, routing, and field compilation. */
  readonly naturalWetlandIntent: Float32Array;
  /** Cells belonging to the derived drainage network. */
  readonly riverMask: Uint8Array;
  /** Coarse-cell distance to the derived river network. */
  readonly riverDistance: Uint16Array;
  /** Road clearance cells, including bridge crossings. */
  readonly roadMask: Uint8Array;
  /** Coarse-cell distance to the semantic road network. */
  readonly roadDistance: Uint16Array;
  /** Seed-derived map annotations; terrain compilation must consume `mountainRidges` instead. */
  readonly summits: readonly SeedWorldSummit[];
  /** Downhill reaches whose width follows accumulated discharge. */
  readonly rivers: readonly SeedWorldRiverReach[];
  /** Connected roads planned after terrain and hydrology. */
  readonly roads: readonly SeedWorldRoad[];
  /** Versioned road routing, visibility, and variable-width intent. */
  readonly roadStyle: SeedWorldRoadStyle;
  /** Points connected by the road network. */
  readonly pois: readonly SeedWorldPoi[];
  /** Feature-bound decoration grammars; these are intent rather than generated component points. */
  readonly featureDecorationRules: readonly SeedWorldFeatureDecorationRule[];
  /** Habitat-density grammars consumed by the Population Cell path. */
  readonly vegetationRules: readonly SeedWorldVegetationRule[];
  /** Unity-style whole-plant brush operations; compile once into exact tree and shrub transforms. */
  readonly treeScatterOperations: readonly SeedWorldTreeScatterOperation[];
  /** Unity-style Detail brush operations; compile once into species density fields. */
  readonly detailBrushOperations: readonly SeedWorldDetailBrushOperation[];
}

/** Deterministic invariant violation reported by the planner validator. */
export interface SeedWorldPlanIssue {
  /** Stable machine-readable issue category. */
  readonly code: string;
  /** Human-readable evidence. */
  readonly message: string;
}

/**
 * Samples the continuous coast level set in an approximate world-metre scale.
 * Positive values are land, negative values are ocean, and zero is the authoritative shoreline.
 * This is a smooth level-set field rather than an exact Euclidean distance near highly warped coast segments.
 * @param shape Seed-specific coast parameters published by the planner.
 * @param point Normalized X-Z location to sample.
 * @returns Signed coast field in approximate world metres.
 */
export function sampleSeedWorldCoastSignedFieldMetres(shape: SeedWorldCoastShape, point: SeedWorldPoint): number {
  if (shape.geology) {
    return sampleSeedWorldGeologyCoastSignedDistanceMetres(
      shape.geology,
      (point.x - 0.5) * shape.sizeMetres,
      (point.y - 0.5) * shape.sizeMetres
    );
  }
  return sampleCoastNormalizedField(shape, point) * Math.min(shape.radiusXMetres, shape.radiusZMetres);
}

/**
 * Samples continuous mountain uplift using the same coast and spawn constraints as the 2D planner.
 * @param intent Authoritative coast, spawn, ridge, and world-scale intent from one plan.
 * @param point Normalized X-Z location to sample.
 * @returns Continuous mountain envelope added to the base terrain, in world metres.
 */
export function sampleSeedWorldMountainUpliftMetres(
  intent: Pick<SeedWorldPlan, "sizeMetres" | "geologyLayout" | "coastShape" | "spawnReserve" | "mountainRidges">,
  point: SeedWorldPoint
): number {
  if (intent.geologyLayout) {
    const sample = sampleSeedWorldGeologyHeight(
      intent.geologyLayout,
      (point.x - 0.5) * intent.sizeMetres,
      (point.y - 0.5) * intent.sizeMetres
    );
    return sample.beltUpliftMetres + sample.hillPedestalMetres + sample.reliefMetres;
  }
  const coastField = sampleCoastNormalizedField(intent.coastShape, point);
  const coastSupport = smoothstep(-0.025, 0.04, coastField);
  const spawnDistanceMetres = pointDistance(point, intent.spawnReserve.center) * intent.sizeMetres;
  const spawnAttenuation = smoothstep(
    intent.spawnReserve.heightAttenuationStartRadiusMetres,
    intent.spawnReserve.heightAttenuationEndRadiusMetres,
    spawnDistanceMetres
  );
  let maximumBrushUpliftMetres = 0;
  for (const ridge of intent.mountainRidges) {
    for (const brush of ridge.brushes) {
      maximumBrushUpliftMetres = Math.max(maximumBrushUpliftMetres, brush.upliftMetres);
    }
  }
  if (maximumBrushUpliftMetres === 0) return 0;

  let remainingEnvelope = 1;
  for (const ridge of intent.mountainRidges) {
    for (const brush of ridge.brushes) {
      const cosine = Math.cos(brush.angleRadians);
      const sine = Math.sin(brush.angleRadians);
      const offsetX = point.x - brush.center.x;
      const offsetZ = point.y - brush.center.y;
      const majorRadius = brush.majorRadiusMetres / intent.sizeMetres;
      const minorRadius = brush.minorRadiusMetres / intent.sizeMetres;
      const localX = (offsetX * cosine + offsetZ * sine) / majorRadius;
      const localZ = (-offsetX * sine + offsetZ * cosine) / minorRadius;
      const brushUpliftMetres = sampleSeedWorldMountainBrushUpliftMetres(brush, localX, localZ);
      const normalizedContribution = (brushUpliftMetres * coastSupport * spawnAttenuation) / maximumBrushUpliftMetres;
      remainingEnvelope *= 1 - normalizedContribution;
    }
  }
  return (1 - remainingEnvelope) * maximumBrushUpliftMetres;
}

/**
 * Samples the hill foundation and mountain-detail masks of one brush.
 * @param brush Authoritative mountain brush with its versioned R16 layers.
 * @param localX Local X coordinate normalized by the brush's major radius.
 * @param localZ Local Z coordinate normalized by the brush's minor radius.
 * @returns Combined uplift in world metres, clamped to the brush's configured maximum.
 */
export function sampleSeedWorldMountainBrushUpliftMetres(
  brush: SeedWorldMountainBrush,
  localX: number,
  localZ: number
): number {
  if (!Number.isFinite(localX) || !Number.isFinite(localZ) || Math.hypot(localX, localZ) >= 1) return 0;
  let combinedHeightMetres = 0;
  for (const layer of brush.layers) {
    const cosine = Math.cos(layer.angleOffsetRadians);
    const sine = Math.sin(layer.angleOffsetRadians);
    const layerX = (localX * cosine + localZ * sine) / layer.radiusScale;
    const layerZ = (-localX * sine + localZ * cosine) / layer.radiusScale;
    if (Math.hypot(layerX, layerZ) >= 1) continue;
    const layerHeightMetres =
      sampleSeedWorldHeightBrushMask(layer.maskKey, layerX, layerZ) * brush.upliftMetres * layer.strengthRatio;
    combinedHeightMetres = smoothMaximumMetres(combinedHeightMetres, layerHeightMetres, brush.smoothUnionMetres);
  }
  return Math.min(brush.upliftMetres, combinedHeightMetres);
}

/**
 * Samples distance to the nearest complete mountain foothill support boundary.
 * Positive values are outside every foothill, negative values are inside at least one foothill.
 * @param intent Authoritative ridge and world-scale intent from one plan.
 * @param point Normalized X-Z location to sample.
 * @returns Approximate signed distance to the nearest foothill boundary in metres.
 */
export function sampleSeedWorldMountainFoothillSignedDistanceMetres(
  intent: Pick<SeedWorldPlan, "sizeMetres" | "mountainRidges">,
  point: SeedWorldPoint
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const ridge of intent.mountainRidges) {
    for (const brush of ridge.brushes) {
      const cosine = Math.cos(brush.angleRadians);
      const sine = Math.sin(brush.angleRadians);
      const offsetX = (point.x - brush.center.x) * intent.sizeMetres;
      const offsetZ = (point.y - brush.center.y) * intent.sizeMetres;
      const localX = (offsetX * cosine + offsetZ * sine) / brush.majorRadiusMetres;
      const localZ = (-offsetX * sine + offsetZ * cosine) / brush.minorRadiusMetres;
      const distance = Math.hypot(localX, localZ);
      const signedDistance = (distance - 1) * Math.min(brush.majorRadiusMetres, brush.minorRadiusMetres);
      nearest = Math.min(nearest, signedDistance);
    }
  }
  return nearest;
}

interface GeologyResult {
  readonly height: Float32Array;
  readonly slope: Float32Array;
  readonly curvature: Float32Array;
  readonly coastShape: SeedWorldCoastShape;
  readonly spawnReserve: SeedWorldSpawnReserve;
  readonly mountainRidges: readonly SeedWorldMountainRidge[];
  readonly mountainUpliftSamples: Uint16Array;
  readonly landMask: Uint8Array;
  readonly coastline: readonly SeedWorldPoint[];
  readonly summits: readonly SeedWorldSummit[];
}

interface VisibleRiverPath {
  readonly kind: "trunk" | "tributary";
  readonly cells: readonly number[];
}

interface HydrologyResult {
  readonly drainageHeight: Float32Array;
  readonly downstream: Int32Array;
  readonly discharge: Float32Array;
  readonly riverMask: Uint8Array;
  readonly riverDistance: Uint16Array;
  readonly moisture: Float32Array;
  readonly rivers: readonly SeedWorldRiverReach[];
  readonly riverThreshold: number;
  readonly maximumDischarge: number;
}

interface RoadResult {
  readonly pois: readonly SeedWorldPoi[];
  readonly roads: readonly SeedWorldRoad[];
  readonly roadMask: Uint8Array;
  readonly roadDistance: Uint16Array;
}

interface EcologyResult {
  readonly landCover: Uint8Array;
  readonly roadWetlandDistance: Uint16Array;
  readonly naturalWetlandIntent: Float32Array;
}

interface HeapEntry {
  readonly index: number;
  readonly priority: number;
}

/**
 * Generates and validates a complete 2D world plan from one packed Root Seed.
 * Each stage stream incorporates only its own code and the causal prefixes before it.
 */
export class SeedWorldPlanner {
  /**
   * Generates one deterministic terrain, drainage, road, ecology, and detail plan.
   * @param request Full unsigned 32-bit Root Seed.
   * @returns Complete planning data for visualization and downstream compilation.
   * @throws {RangeError} When the Root Seed is not an unsigned 32-bit integer.
   * @throws {Error} When an internal planning invariant is violated.
   */
  static generate(request: SeedWorldPlanRequest): SeedWorldPlan {
    assertUnsignedSeed(request.rootSeed, "Root Seed");
    const stageSeeds = resolveStageSeeds(request);
    const stageCodes = unpackSeedWorldRoot(request.rootSeed);
    const generationStreams = deriveGenerationStreams(stageSeeds);
    const geology = request.geologyLayout
      ? generateGeologyFromLayout(request.geologyLayout, request.fbm)
      : generateGeology(stageSeeds.geology);
    const hydrology = generateHydrology(geology, stageSeeds.hydrology);
    const ecology = generateEcology(geology, hydrology, stageSeeds.ecology);
    const emptyRoadMask = new Uint8Array(PLAN_RESOLUTION * PLAN_RESOLUTION);
    const preRoadPlan: SeedWorldPlan = {
      version: 29,
      assetPlacementProfileVersion: SEED_WORLD_ASSET_PLACEMENT_PROFILE_VERSION,
      detailSpeciesProfileVersion: SEED_WORLD_DETAIL_SPECIES_PROFILE_VERSION,
      treeSpeciesProfileVersion: SEED_WORLD_TREE_SPECIES_PROFILE_VERSION,
      treeSpeciesProfiles: SEED_WORLD_TREE_SPECIES_PROFILES,
      treeCommunityProfileVersion: SEED_WORLD_TREE_COMMUNITY_PROFILE_VERSION,
      treeCommunityProfile: SEED_WORLD_TREE_COMMUNITY_PROFILE,
      rootSeed: request.rootSeed,
      stageCodes,
      stageSeeds,
      generationStreams,
      resolution: PLAN_RESOLUTION,
      sizeMetres: PLAN_SIZE_METRES,
      ...(request.geologyLayout ? { geologyLayout: request.geologyLayout } : {}),
      coastShape: geology.coastShape,
      spawnReserve: geology.spawnReserve,
      mountainRidges: geology.mountainRidges,
      mountainUpliftSamples: geology.mountainUpliftSamples,
      landMask: geology.landMask,
      coastline: geology.coastline,
      height: geology.height,
      slope: geology.slope,
      curvature: geology.curvature,
      flow: normalizeCopy(hydrology.discharge),
      moisture: hydrology.moisture,
      landCover: ecology.landCover,
      naturalWetlandIntent: ecology.naturalWetlandIntent,
      riverMask: hydrology.riverMask,
      riverDistance: hydrology.riverDistance,
      roadMask: emptyRoadMask,
      roadDistance: distanceFromMask(emptyRoadMask, PLAN_RESOLUTION),
      summits: geology.summits,
      rivers: hydrology.rivers,
      roads: Object.freeze([]),
      pois: Object.freeze([]),
      roadStyle: SEED_WORLD_ROAD_STYLE,
      featureDecorationRules: createFeatureDecorationRules(generationStreams.decor),
      vegetationRules: createVegetationRules(generationStreams.vegetation),
      treeScatterOperations: Object.freeze([]),
      detailBrushOperations: Object.freeze([])
    };
    const naturalHeightMetres = compileSeedWorldNaturalHeightField(preRoadPlan, ROAD_NATURAL_HEIGHT_RESOLUTION);
    const roads = generateRoads(
      geology,
      hydrology,
      ecology,
      naturalHeightMetres,
      ROAD_NATURAL_HEIGHT_RESOLUTION,
      stageSeeds.road
    );
    const finalLandCover = clearRoadCorridor(ecology.landCover, roads.roadMask);
    const vegetationOperations = createVegetationOperations(generationStreams.vegetation);
    const plan: SeedWorldPlan = {
      version: 29,
      assetPlacementProfileVersion: SEED_WORLD_ASSET_PLACEMENT_PROFILE_VERSION,
      detailSpeciesProfileVersion: SEED_WORLD_DETAIL_SPECIES_PROFILE_VERSION,
      treeSpeciesProfileVersion: SEED_WORLD_TREE_SPECIES_PROFILE_VERSION,
      treeSpeciesProfiles: SEED_WORLD_TREE_SPECIES_PROFILES,
      treeCommunityProfileVersion: SEED_WORLD_TREE_COMMUNITY_PROFILE_VERSION,
      treeCommunityProfile: SEED_WORLD_TREE_COMMUNITY_PROFILE,
      rootSeed: request.rootSeed,
      stageCodes,
      stageSeeds,
      generationStreams,
      resolution: PLAN_RESOLUTION,
      sizeMetres: PLAN_SIZE_METRES,
      ...(request.geologyLayout ? { geologyLayout: request.geologyLayout } : {}),
      coastShape: geology.coastShape,
      spawnReserve: geology.spawnReserve,
      mountainRidges: geology.mountainRidges,
      mountainUpliftSamples: geology.mountainUpliftSamples,
      landMask: geology.landMask,
      coastline: geology.coastline,
      height: geology.height,
      slope: geology.slope,
      curvature: geology.curvature,
      flow: normalizeCopy(hydrology.discharge),
      moisture: hydrology.moisture,
      landCover: finalLandCover,
      naturalWetlandIntent: ecology.naturalWetlandIntent,
      riverMask: hydrology.riverMask,
      riverDistance: hydrology.riverDistance,
      roadMask: roads.roadMask,
      roadDistance: roads.roadDistance,
      summits: geology.summits,
      rivers: hydrology.rivers,
      roads: roads.roads,
      pois: roads.pois,
      roadStyle: SEED_WORLD_ROAD_STYLE,
      featureDecorationRules: createFeatureDecorationRules(generationStreams.decor),
      vegetationRules: createVegetationRules(generationStreams.vegetation),
      treeScatterOperations: vegetationOperations.treeScatterOperations,
      detailBrushOperations: vegetationOperations.detailBrushOperations
    };
    const issues = SeedWorldPlanner.validate(plan);
    if (issues.length > 0) {
      throw new Error(`Seed World Planner generated an invalid plan: ${issues[0].code}: ${issues[0].message}`);
    }
    return plan;
  }

  /**
   * Checks cross-stage natural and collision invariants without judging visual quality.
   * @param plan Planning result to inspect.
   * @returns Every deterministic invariant violation found in the plan.
   */
  static validate(plan: SeedWorldPlan): readonly SeedWorldPlanIssue[] {
    const cached = planValidationCache.get(plan);
    if (cached) return cached;
    const issues: SeedWorldPlanIssue[] = [];
    if (
      plan.treeCommunityProfileVersion !== SEED_WORLD_TREE_COMMUNITY_PROFILE_VERSION ||
      plan.treeCommunityProfile.version !== plan.treeCommunityProfileVersion
    ) {
      issues.push({
        code: "tree-community-version",
        message: "tree-community profile version does not match the Plan"
      });
    }
    if (plan.treeSpeciesProfileVersion !== SEED_WORLD_TREE_SPECIES_PROFILE_VERSION) {
      issues.push({ code: "tree-species-version", message: "tree-species profile version does not match the Plan" });
    }
    const speciesKeys = new Set<string>();
    for (const species of plan.treeSpeciesProfiles) {
      const paletteWeight = species.palettes.reduce((sum, palette) => sum + palette.relativeAbundance, 0);
      const paletteHasInvalidBounds = species.palettes.some(({ geometryBounds }) =>
        geometryBounds.minimum.some(
          (minimum, axis) =>
            !Number.isFinite(minimum) ||
            !Number.isFinite(geometryBounds.maximum[axis]) ||
            minimum >= geometryBounds.maximum[axis]!
        )
      );
      if (
        speciesKeys.has(species.key) ||
        !species.enabled ||
        species.relativeAbundance < 0 ||
        species.densityMultiplier <= 0 ||
        species.waterEdgeAbundanceMultiplier <= 0 ||
        species.ecotoneWavelengthMetres <= 0 ||
        species.palettes.length === 0 ||
        paletteWeight <= 0 ||
        paletteHasInvalidBounds ||
        species.palettes.some((palette) => palette.assetRecipeId.length === 0 || palette.relativeAbundance < 0)
      ) {
        issues.push({ code: "tree-species-profile", message: `${species.key} has invalid ecology or palette values` });
      }
      speciesKeys.add(species.key);
    }
    const cohortWeight = plan.treeCommunityProfile.cohorts.reduce((sum, cohort) => sum + cohort.populationWeight, 0);
    if (Math.abs(cohortWeight - 1) > 1e-6) {
      issues.push({ code: "tree-community-weight", message: `tree cohort weights sum to ${cohortWeight}; expected 1` });
    }
    if (
      plan.treeCommunityProfile.backgroundDensityMultiplier < 0 ||
      plan.treeCommunityProfile.standCoreDensityMultiplier <= plan.treeCommunityProfile.backgroundDensityMultiplier ||
      plan.treeCommunityProfile.canopyGapRetention < 0 ||
      plan.treeCommunityProfile.canopyGapRetention > 1 ||
      plan.treeCommunityProfile.speciesPurity[0] < 0 ||
      plan.treeCommunityProfile.speciesPurity[1] > 1 ||
      plan.treeCommunityProfile.speciesPurity[1] < plan.treeCommunityProfile.speciesPurity[0] ||
      plan.treeCommunityProfile.palettePurity[0] < 0 ||
      plan.treeCommunityProfile.palettePurity[1] > 1 ||
      plan.treeCommunityProfile.palettePurity[1] < plan.treeCommunityProfile.palettePurity[0] ||
      plan.treeCommunityProfile.speciesPatchRadiusMetres[0] <= 0 ||
      plan.treeCommunityProfile.speciesPatchRadiusMetres[1] < plan.treeCommunityProfile.speciesPatchRadiusMetres[0] ||
      plan.treeCommunityProfile.groveLinkDistanceMetres <= 0 ||
      !Number.isInteger(plan.treeCommunityProfile.minimumTreesPerGrove) ||
      plan.treeCommunityProfile.minimumTreesPerGrove < 2
    ) {
      issues.push({
        code: "tree-community-density",
        message: "tree-community density or grove-membership policy is invalid"
      });
    }
    const groveAnchorKeys = new Set<string>();
    for (const anchor of plan.treeCommunityProfile.groveAnchors) {
      const [supportMinimum, supportMaximum] = anchor.supportRangeMetres;
      const [fullMinimum, fullMaximum] = anchor.fullInfluenceRangeMetres;
      if (
        groveAnchorKeys.has(anchor.key) ||
        supportMaximum <= supportMinimum ||
        fullMinimum < supportMinimum ||
        fullMaximum < fullMinimum ||
        fullMaximum > supportMaximum ||
        anchor.weight <= 0
      ) {
        issues.push({ code: "tree-community-anchor", message: `${anchor.key} has an invalid grove distance band` });
      }
      groveAnchorKeys.add(anchor.key);
    }
    const riparianMoisture = plan.treeCommunityProfile.riparianMoisture;
    if (
      riparianMoisture.minimumMoisture < 0 ||
      riparianMoisture.fullInfluenceMoisture <= riparianMoisture.minimumMoisture ||
      riparianMoisture.fullInfluenceMoisture > 1 ||
      riparianMoisture.fullInfluenceRiverDistanceMetres <= 0 ||
      riparianMoisture.maximumRiverDistanceMetres <= riparianMoisture.fullInfluenceRiverDistanceMetres ||
      riparianMoisture.parentRankMultiplier < 1 ||
      riparianMoisture.additionalParentMinimumInfluence <= 0 ||
      riparianMoisture.additionalParentMinimumInfluence > 1 ||
      riparianMoisture.additionalParentSpacingMetres <= 0 ||
      riparianMoisture.standDensityMultiplier < 1
    ) {
      issues.push({
        code: "tree-community-riparian-moisture",
        message: "riparian moisture thresholds or multipliers are invalid"
      });
    }
    if (
      plan.treeCommunityProfile.ninetyDegreeSlopeDensityMultiplier <= 0 ||
      plan.treeCommunityProfile.ninetyDegreeSlopeDensityMultiplier >= 1
    ) {
      issues.push({
        code: "tree-community-slope-density",
        message: "tree slope-density retention is invalid"
      });
    }
    for (const cohort of plan.treeCommunityProfile.cohorts) {
      if (
        cohort.scaleRange[0] <= 0 ||
        cohort.scaleRange[1] < cohort.scaleRange[0] ||
        cohort.minimumSpacingMetres[0] <= 0 ||
        cohort.minimumSpacingMetres[1] < cohort.minimumSpacingMetres[0]
      ) {
        issues.push({ code: "tree-community-cohort", message: `${cohort.key} has an invalid height or spacing range` });
      }
    }
    const expectedCells = plan.resolution * plan.resolution;
    for (const [name, field] of [
      ["landMask", plan.landMask],
      ["mountainUpliftSamples", plan.mountainUpliftSamples],
      ["height", plan.height],
      ["slope", plan.slope],
      ["curvature", plan.curvature],
      ["flow", plan.flow],
      ["moisture", plan.moisture],
      ["landCover", plan.landCover],
      ["naturalWetlandIntent", plan.naturalWetlandIntent],
      ["riverMask", plan.riverMask],
      ["riverDistance", plan.riverDistance],
      ["roadMask", plan.roadMask],
      ["roadDistance", plan.roadDistance]
    ] as const) {
      if (field.length !== expectedCells) {
        issues.push({ code: "raster-size", message: `${name} has ${field.length} cells; expected ${expectedCells}` });
      }
    }

    const spawnCell = normalizedPointIndex(plan.spawnReserve.center, plan.resolution);
    if (plan.landMask[spawnCell] === 0) {
      issues.push({ code: "spawn-ocean", message: "the fixed world origin lies outside the generated island" });
    }
    for (const summit of plan.summits) {
      if (pointDistance(summit, plan.spawnReserve.center) * plan.sizeMetres < plan.spawnReserve.protectedRadiusMetres) {
        issues.push({ code: "spawn-summit", message: "a summit overlaps the fixed world-origin reserve" });
      }
    }

    const trunks = plan.rivers.filter((river) => river.kind === "trunk");
    if (trunks.length !== 1) {
      issues.push({ code: "river-trunk", message: `expected one primary river trunk; received ${trunks.length}` });
    }
    const trunkCells = new Set(trunks[0]?.points.map((point) => normalizedPointIndex(point, plan.resolution)) ?? []);
    const tributaries = plan.rivers.filter((river) => river.kind === "tributary");
    if (tributaries.length > MAXIMUM_VISIBLE_TRIBUTARIES) {
      issues.push({
        code: "river-density",
        message: `${tributaries.length} visible tributaries exceed the preview budget`
      });
    }
    for (const tributary of tributaries) {
      const confluence = tributary.points[tributary.points.length - 1];
      if (!confluence || !trunkCells.has(normalizedPointIndex(confluence, plan.resolution))) {
        issues.push({ code: "river-confluence", message: `${tributary.id} does not terminate on the primary trunk` });
      }
    }

    for (const river of plan.rivers) {
      if (river.points.length < 2) {
        issues.push({ code: "river-empty", message: `${river.id} has fewer than two points` });
        continue;
      }
      for (let index = 1; index < river.points.length; index++) {
        const upstream = river.points[index - 1];
        const downstream = river.points[index];
        if (downstream.elevation >= upstream.elevation) {
          issues.push({ code: "river-uphill", message: `${river.id} rises at point ${index}` });
        }
        if (downstream.bedElevationMetres > upstream.bedElevationMetres + 1e-6) {
          issues.push({
            code: "river-bed-uphill",
            message: `seed=${plan.rootSeed} stage=hydrology id=${river.id} arc=${index} XZ=${downstream.x.toFixed(6)},${downstream.y.toFixed(6)} H=${downstream.bedElevationMetres.toFixed(4)} rise=${(downstream.bedElevationMetres - upstream.bedElevationMetres).toFixed(6)} grade=n/a SDF=0 bridgeInterval=none category=river-bed requiredMargin=rise<=1e-6`
          });
        }
        if (downstream.discharge < upstream.discharge) {
          issues.push({ code: "river-discharge", message: `${river.id} loses discharge at point ${index}` });
        }
        if (downstream.depthMetres < upstream.depthMetres) {
          issues.push({ code: "river-depth", message: `${river.id} becomes shallower downstream at point ${index}` });
        }
      }
    }

    const trunk = trunks[0];
    if (trunk) {
      for (const tributary of tributaries) {
        const confluence = tributary.points.at(-1);
        if (!confluence) continue;
        const matchingTrunkPoint = trunk.points.find(
          (point) => Math.abs(point.x - confluence.x) <= 1e-9 && Math.abs(point.y - confluence.y) <= 1e-9
        );
        if (
          !matchingTrunkPoint ||
          Math.abs(matchingTrunkPoint.bedElevationMetres - confluence.bedElevationMetres) > 1e-6
        ) {
          issues.push({
            code: "river-bed-confluence",
            message: `seed=${plan.rootSeed} stage=hydrology id=${tributary.id} arc=mouth XZ=${confluence.x.toFixed(6)},${confluence.y.toFixed(6)} H=${confluence.bedElevationMetres.toFixed(4)} rise=${matchingTrunkPoint ? (confluence.bedElevationMetres - matchingTrunkPoint.bedElevationMetres).toFixed(6) : "missing"} grade=n/a SDF=0 bridgeInterval=none category=river-bed requiredMargin=continuous`
          });
        }
      }
    }

    const connectedPois = new Set<string>();
    if (plan.pois[0]) connectedPois.add(plan.pois[0].id);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const road of plan.roads) {
        const fromConnected = connectedPois.has(road.fromPoiId);
        const toConnected = connectedPois.has(road.toPoiId);
        if (fromConnected === toConnected) continue;
        connectedPois.add(fromConnected ? road.toPoiId : road.fromPoiId);
        expanded = true;
      }
    }
    if (connectedPois.size !== plan.pois.length) {
      issues.push({ code: "road-disconnected", message: `${plan.pois.length - connectedPois.size} POIs are isolated` });
    }

    const validationRiverGeometry = compileRoadRiverGeometry(compileSeedWorldRiverCurves(plan));
    for (const road of plan.roads) {
      if (road.points.length < 2) {
        issues.push({ code: "road-empty", message: `${road.id} has fewer than two points` });
        continue;
      }
      for (const point of road.points) {
        const cell = normalizedPointIndex(point, plan.resolution);
        if (plan.landMask[cell] === 0) {
          issues.push({ code: "road-ocean", message: `${road.id} leaves the generated landmass` });
        }
      }
      for (let pointIndex = 1; pointIndex < road.points.length; pointIndex++) {
        const start = road.points[pointIndex - 1];
        const end = road.points[pointIndex];
        const run = pointDistance(start, end) * plan.sizeMetres;
        const rise = Math.abs(end.naturalHeightMetres - start.naturalHeightMetres);
        const grade = run > 0 ? rise / run : 0;
        if (grade > SEED_WORLD_MAXIMUM_ROAD_ROUTING_GRADE + 1e-6) {
          issues.push({
            code: "road-grade",
            message: `seed=${plan.rootSeed} stage=road id=${road.id} arc=${pointIndex} XZ=${end.x.toFixed(6)},${end.y.toFixed(6)} H=${end.naturalHeightMetres.toFixed(3)} rise=${rise.toFixed(3)} grade=${grade.toFixed(6)} SDF=n/a bridgeInterval=none category=road requiredMargin=grade<=${SEED_WORLD_MAXIMUM_ROAD_ROUTING_GRADE}`
          });
        }
      }
      for (const interval of road.bridgeIntervals) {
        if (
          interval.startArcMetres >= interval.waterStartArcMetres ||
          interval.waterStartArcMetres > interval.waterEndArcMetres ||
          interval.waterEndArcMetres >= interval.endArcMetres
        ) {
          issues.push({
            code: "bridge-interval",
            message: `seed=${plan.rootSeed} stage=road id=${road.id} arc=${interval.waterStartArcMetres.toFixed(2)} XZ=n/a H=n/a rise=n/a grade=n/a SDF=n/a bridgeInterval=${interval.startArcMetres.toFixed(2)}-${interval.endArcMetres.toFixed(2)} category=bridge requiredMargin=dry-water-dry`
          });
        }
      }
      const roadSamples = sampleRoadPolyline(road.points, ROAD_EXACT_SAMPLE_SPACING_METRES);
      for (const sample of roadSamples) {
        const waterSdf = sampleRoadRiverWaterSignedDistanceMetres(validationRiverGeometry, sample.point);
        const bridgeInterval = road.bridgeIntervals.find(
          (interval) => sample.arcMetres >= interval.startArcMetres && sample.arcMetres <= interval.endArcMetres
        );
        const wetland = sampleRoadNaturalWetlandInfluence(
          sample.point,
          plan,
          plan.moisture,
          plan.slope,
          plan.resolution,
          validationRiverGeometry
        );
        if (waterSdf <= 0 && !bridgeInterval) {
          issues.push({
            code: "road-water",
            message: `seed=${plan.rootSeed} stage=road id=${road.id} arc=${sample.arcMetres.toFixed(2)} XZ=${sample.point.x.toFixed(6)},${sample.point.y.toFixed(6)} H=n/a rise=n/a grade=n/a SDF=${waterSdf.toFixed(3)} bridgeInterval=none category=road requiredMargin=water requires bridge`
          });
          break;
        }
        if (wetland >= ROAD_MAXIMUM_WETLAND_INFLUENCE && !bridgeInterval) {
          issues.push({
            code: "road-wetland",
            message: `seed=${plan.rootSeed} stage=road id=${road.id} arc=${sample.arcMetres.toFixed(2)} XZ=${sample.point.x.toFixed(6)},${sample.point.y.toFixed(6)} H=n/a rise=n/a grade=n/a SDF=${wetland.toFixed(6)} bridgeInterval=none category=road requiredMargin=wetland-rgba8=0`
          });
          break;
        }
      }
      for (const interval of road.bridgeIntervals) {
        const intervalSamples = roadSamples.filter(
          (sample) => sample.arcMetres >= interval.startArcMetres && sample.arcMetres <= interval.endArcMetres
        );
        const first = intervalSamples[0];
        const last = intervalSamples.at(-1);
        const containsWater = intervalSamples.some(
          (sample) => sampleRoadRiverWaterSignedDistanceMetres(validationRiverGeometry, sample.point) <= 0
        );
        const endpointsDry =
          first !== undefined &&
          last !== undefined &&
          sampleRoadRiverWaterSignedDistanceMetres(validationRiverGeometry, first.point) > 0 &&
          sampleRoadRiverWaterSignedDistanceMetres(validationRiverGeometry, last.point) > 0;
        if (!containsWater || !endpointsDry) {
          issues.push({
            code: "bridge-dryness",
            message: `seed=${plan.rootSeed} stage=road id=${road.id} arc=${interval.startArcMetres.toFixed(2)} XZ=${first ? `${first.point.x.toFixed(6)},${first.point.y.toFixed(6)}` : "missing"} H=n/a rise=n/a grade=n/a SDF=${first ? sampleRoadRiverWaterSignedDistanceMetres(validationRiverGeometry, first.point).toFixed(3) : "missing"} bridgeInterval=${interval.startArcMetres.toFixed(2)}-${interval.endArcMetres.toFixed(2)} category=bridge requiredMargin=dry endpoints and wet interior`
          });
        }
      }
    }

    for (let index = 0; index < Math.min(expectedCells, plan.landCover.length); index++) {
      if (plan.riverMask[index] !== 0 && plan.landCover[index] === SeedWorldLandCover.Forest) {
        issues.push({ code: "forest-river", message: `forest occupies river cell ${index}` });
      }
      if (
        plan.roadMask[index] !== 0 &&
        (plan.landCover[index] === SeedWorldLandCover.Forest || plan.landCover[index] === SeedWorldLandCover.Wetland)
      ) {
        issues.push({ code: "cover-road", message: `land cover occupies road clearance cell ${index}` });
      }
    }

    const frozen = Object.freeze(issues);
    planValidationCache.set(plan, frozen);
    return frozen;
  }
}

function isHighlandGeology(seed: number): boolean {
  return avalanche32(seed ^ 0x784d_31ab) < 0x1000_0000;
}

/** Style-independent water ownership used to route roads around final hydrology. */
export interface SeedWorldRoadWaterExclusion {
  /** Row-major non-zero water ownership. */
  readonly wetMask: Uint8Array;
  /** Width and height of `wetMask`. */
  readonly resolution: number;
}

/**
 * Replans the existing named Road stream after final static-water geometry is known.
 * @param plan Root-Seed semantic plan whose geology and category streams stay unchanged.
 * @param naturalHeightMetres Road-independent H0 samples used by the hard grade gate.
 * @param naturalHeightResolution Width and height of the inclusive H0 lattice.
 * @param waterExclusion Final style-independent water ownership shared with Height and Water.
 * @returns A plan with dry roads and the legacy river authority replaced by the final water mask.
 * @throws {Error} When no deterministic dry route can connect the generated POIs.
 */
export function replanSeedWorldRoadsForWaterExclusion(
  plan: SeedWorldPlan,
  naturalHeightMetres: Float32Array,
  naturalHeightResolution: number,
  waterExclusion: SeedWorldRoadWaterExclusion
): SeedWorldPlan {
  if (plan.resolution !== PLAN_RESOLUTION || plan.sizeMetres !== PLAN_SIZE_METRES) {
    throw new RangeError("Seed World road replanning requires the canonical Plan extent.");
  }
  if (
    !Number.isInteger(naturalHeightResolution) ||
    naturalHeightResolution < 2 ||
    naturalHeightMetres.length !== naturalHeightResolution * naturalHeightResolution
  ) {
    throw new RangeError("Seed World road replanning requires one square H0 lattice.");
  }
  if (
    !Number.isInteger(waterExclusion.resolution) ||
    waterExclusion.resolution < 2 ||
    waterExclusion.wetMask.length !== waterExclusion.resolution * waterExclusion.resolution
  ) {
    throw new RangeError("Seed World road replanning requires one square water-exclusion mask.");
  }
  const waterMask = resampleRoadWaterExclusion(waterExclusion, PLAN_RESOLUTION);
  const waterDistance = distanceFromMask(waterMask, PLAN_RESOLUTION);
  const geology: GeologyResult = {
    height: plan.height,
    slope: plan.slope,
    curvature: plan.curvature,
    coastShape: plan.coastShape,
    spawnReserve: plan.spawnReserve,
    mountainRidges: plan.mountainRidges,
    mountainUpliftSamples: plan.mountainUpliftSamples,
    landMask: plan.landMask,
    coastline: plan.coastline,
    summits: plan.summits
  };
  const downstream = new Int32Array(PLAN_RESOLUTION * PLAN_RESOLUTION);
  downstream.fill(-1);
  const hydrology: HydrologyResult = {
    drainageHeight: plan.height,
    downstream,
    discharge: plan.flow,
    riverMask: new Uint8Array(PLAN_RESOLUTION * PLAN_RESOLUTION),
    riverDistance: waterDistance,
    moisture: plan.moisture,
    rivers: Object.freeze([]),
    riverThreshold: 1,
    maximumDischarge: 1
  };
  const naturalWetlandIntent = Float32Array.from(waterMask, (value) => (value ? 1 : 0));
  const ecology: EcologyResult = {
    landCover: plan.landCover,
    roadWetlandDistance: waterDistance,
    naturalWetlandIntent
  };
  const roads = generateRoads(
    geology,
    hydrology,
    ecology,
    naturalHeightMetres,
    naturalHeightResolution,
    plan.stageSeeds.road
  );
  return Object.freeze({
    ...plan,
    landCover: clearRoadCorridor(plan.landCover, roads.roadMask),
    rivers: Object.freeze([]),
    riverMask: waterMask,
    riverDistance: waterDistance,
    roadMask: roads.roadMask,
    roadDistance: roads.roadDistance,
    roads: roads.roads,
    pois: roads.pois
  });
}

function resampleRoadWaterExclusion(exclusion: SeedWorldRoadWaterExclusion, targetResolution: number): Uint8Array {
  const result = new Uint8Array(targetResolution * targetResolution);
  for (let y = 0; y < targetResolution; y++) {
    const sourceMinimumY = Math.floor((y / targetResolution) * exclusion.resolution);
    const sourceMaximumY = Math.min(
      exclusion.resolution - 1,
      Math.ceil(((y + 1) / targetResolution) * exclusion.resolution)
    );
    for (let x = 0; x < targetResolution; x++) {
      const sourceMinimumX = Math.floor((x / targetResolution) * exclusion.resolution);
      const sourceMaximumX = Math.min(
        exclusion.resolution - 1,
        Math.ceil(((x + 1) / targetResolution) * exclusion.resolution)
      );
      for (
        let sourceY = sourceMinimumY;
        sourceY <= sourceMaximumY && result[y * targetResolution + x] === 0;
        sourceY++
      ) {
        for (let sourceX = sourceMinimumX; sourceX <= sourceMaximumX; sourceX++) {
          if (exclusion.wetMask[sourceY * exclusion.resolution + sourceX] === 0) continue;
          result[y * targetResolution + x] = 1;
          break;
        }
      }
    }
  }
  return result;
}

function generateGeologyFromLayout(layout: SeedWorldGeologyLayout, fbm?: SeedWorldFbmParameters): GeologyResult {
  if (layout.worldSizeMetres !== PLAN_SIZE_METRES) {
    throw new RangeError("Seed World geology layout must match the planner extent");
  }
  const field = compileSeedWorldGeologyHeightfield(layout, PLAN_RESOLUTION, fbm);
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  for (const value of field.heights) {
    minimumHeight = Math.min(minimumHeight, value);
    maximumHeight = Math.max(maximumHeight, value);
  }
  const heightRange = Math.max(1, maximumHeight - minimumHeight);
  const height = Float32Array.from(field.heights, (value) => (value - minimumHeight) / heightRange);
  const slope = Float32Array.from(field.slopesDegrees, (value) => clamp(value / 90, 0, 1));
  const curvature = Float32Array.from(field.curvaturePerMetre, (value) => clamp(value * 64, -1, 1));
  const landMask = Uint8Array.from(field.heights, (value) => (value >= 0 ? 1 : 0));
  const mountainUpliftSamples = new Uint16Array(field.heights.length);
  for (let index = 0; index < mountainUpliftSamples.length; index++) {
    const uplift = field.beltUpliftHeights[index]! + field.hillPedestalHeights[index]! + field.reliefHeights[index]!;
    mountainUpliftSamples[index] = Math.round(clamp(uplift / SEED_WORLD_MAXIMUM_MOUNTAIN_UPLIFT_METRES, 0, 1) * 0xffff);
  }
  const coastShape: SeedWorldCoastShape = Object.freeze({
    sizeMetres: PLAN_SIZE_METRES,
    center: SPAWN_CENTER,
    radiusXMetres: PLAN_SIZE_METRES * 0.5,
    radiusZMetres: PLAN_SIZE_METRES * 0.5,
    angleRadians: 0,
    squareness: 2,
    warpSeed: layout.geologySeed,
    contourLevel: 0,
    geology: Object.freeze({ geologySeed: layout.geologySeed, parameters: layout.parameters })
  });
  const spawnReserve: SeedWorldSpawnReserve = Object.freeze({
    center: SPAWN_CENTER,
    protectedRadiusMetres: 0,
    mountainClearanceRadiusMetres: 0,
    heightAttenuationStartRadiusMetres: 0,
    heightAttenuationEndRadiusMetres: 0
  });
  const mountainRidges = Object.freeze<readonly SeedWorldMountainRidge[]>(
    layout.hills.map((hill) =>
      Object.freeze({
        id: `geology-${hill.id}`,
        brushes: Object.freeze([
          Object.freeze({
            id: hill.id,
            center: Object.freeze({
              x: hill.center.x / PLAN_SIZE_METRES + 0.5,
              y: hill.center.z / PLAN_SIZE_METRES + 0.5
            }),
            majorRadiusMetres: hill.bodyRadiusMetres.major,
            minorRadiusMetres: hill.bodyRadiusMetres.minor,
            angleRadians: hill.rotationRadians,
            upliftMetres: hill.pedestalLiftMetres + hill.peakReliefMetres,
            smoothUnionMetres: 0,
            layers: Object.freeze([])
          })
        ])
      })
    )
  );
  const summits = Object.freeze<readonly SeedWorldSummit[]>(
    layout.hills.map((hill) =>
      Object.freeze({
        x: hill.center.x / PLAN_SIZE_METRES + 0.5,
        y: hill.center.z / PLAN_SIZE_METRES + 0.5,
        elevation: clamp((hill.pedestalLiftMetres + hill.peakReliefMetres) / 420, 0, 1)
      })
    )
  );
  return Object.freeze({
    height,
    slope,
    curvature,
    coastShape,
    spawnReserve,
    mountainRidges,
    mountainUpliftSamples,
    landMask,
    coastline: Object.freeze([]),
    summits
  });
}

function generateGeology(seed: number): GeologyResult {
  const random = new RandomStream(seed);
  const coastShape = createCoastShape(random, seed);
  const spawnReserve: SeedWorldSpawnReserve = Object.freeze({
    center: SPAWN_CENTER,
    protectedRadiusMetres: SPAWN_PROTECTED_RADIUS * PLAN_SIZE_METRES,
    mountainClearanceRadiusMetres: SPAWN_MOUNTAIN_CLEARANCE_RADIUS * PLAN_SIZE_METRES,
    heightAttenuationStartRadiusMetres: SPAWN_HEIGHT_ATTENUATION_START_RADIUS * PLAN_SIZE_METRES,
    heightAttenuationEndRadiusMetres: SPAWN_HEIGHT_ATTENUATION_END_RADIUS * PLAN_SIZE_METRES
  });
  const mountainRidges: SeedWorldMountainRidge[] = [];
  const upliftRange = isHighlandGeology(seed) ? HIGHLAND_UPLIFT_RANGE_METRES : MOUNTAIN_UPLIFT_RANGE_METRES;
  const ridgeCount = random.integer(3, 7);
  const ridgeSlotCount = ridgeCount + 1;
  const ridgeGapSlot = avalanche32(seed ^ 0x4b3a_217d) % ridgeSlotCount;
  const ridgeRingRotation = (avalanche32(seed ^ 0x92d6_41e3) / 0x1_0000_0000) * Math.PI * 2;
  for (let ridgeIndex = 0; ridgeIndex < ridgeCount; ridgeIndex++) {
    const brushes: SeedWorldMountainBrush[] = [];
    const orientationJitter = random.range(-0.3, 0.3);
    const directionJitter = random.range(-0.14, 0.14);
    const ridgeSlot = ridgeIndex >= ridgeGapSlot ? ridgeIndex + 1 : ridgeIndex;
    const centerDirection = ridgeRingRotation + (ridgeSlot / ridgeSlotCount) * Math.PI * 2 + directionJitter;
    const angle = centerDirection + Math.PI * 0.5 + orientationJitter;
    const centerRadius = random.range(0.29, 0.34);
    const centerX = SPAWN_CENTER.x + Math.cos(centerDirection) * centerRadius;
    const centerY = SPAWN_CENTER.y + Math.sin(centerDirection) * centerRadius;
    const ridgeLength = random.range(0.1, 0.22);
    const summitCount = random.integer(1, 4);
    for (let summitIndex = 0; summitIndex < summitCount; summitIndex++) {
      const fraction = summitCount === 1 ? 0.5 : summitIndex / (summitCount - 1);
      const along = (fraction - 0.5) * ridgeLength;
      const lateral = random.range(-0.035, 0.035);
      const x = centerX + Math.cos(angle) * along - Math.sin(angle) * lateral;
      const y = centerY + Math.sin(angle) * along + Math.cos(angle) * lateral;
      const id = `ridge-${ridgeIndex}-brush-${summitIndex}`;
      const brush = fitMountainBrushToNaturalDomain(
        {
          id,
          center: { x, y },
          majorRadiusMetres:
            random.range(MOUNTAIN_MAJOR_RADIUS_RANGE.minimum, MOUNTAIN_MAJOR_RADIUS_RANGE.maximum) * PLAN_SIZE_METRES,
          minorRadiusMetres:
            random.range(MOUNTAIN_MINOR_RADIUS_RANGE.minimum, MOUNTAIN_MINOR_RADIUS_RANGE.maximum) * PLAN_SIZE_METRES,
          angleRadians: angle + random.range(-0.22, 0.22),
          upliftMetres: random.range(upliftRange.minimum, upliftRange.maximum),
          smoothUnionMetres: MOUNTAIN_LAYER_SMOOTH_UNION_METRES,
          layers: createMountainBrushLayers(seed, id)
        },
        coastShape,
        spawnReserve
      );
      if (!brush) continue;
      brushes.push(brush);
    }
    if (brushes.length > 0) mountainRidges.push({ id: `ridge-${ridgeIndex}`, brushes: Object.freeze(brushes) });
  }
  if (mountainRidges.length === 0) {
    mountainRidges.push({
      id: "ridge-fallback",
      brushes: Object.freeze([
        {
          id: "ridge-fallback-brush-0",
          center: { x: 0.24, y: 0.26 },
          majorRadiusMetres: 0.145 * PLAN_SIZE_METRES,
          minorRadiusMetres: 0.092 * PLAN_SIZE_METRES,
          angleRadians: Math.PI * 0.25,
          upliftMetres: 125,
          smoothUnionMetres: MOUNTAIN_LAYER_SMOOTH_UNION_METRES,
          layers: createMountainBrushLayers(seed, "ridge-fallback-brush-0")
        }
      ])
    });
  }
  const mountainIntent = { sizeMetres: PLAN_SIZE_METRES, coastShape, spawnReserve, mountainRidges };

  const cellCount = PLAN_RESOLUTION * PLAN_RESOLUTION;
  const height = new Float32Array(cellCount);
  const mountainUpliftSamples = new Uint16Array(cellCount);
  const landMask = new Uint8Array(cellCount);
  for (let y = 0; y < PLAN_RESOLUTION; y++) {
    for (let x = 0; x < PLAN_RESOLUTION; x++) {
      const normalizedX = x / (PLAN_RESOLUTION - 1);
      const normalizedY = y / (PLAN_RESOLUTION - 1);
      const point = { x: normalizedX, y: normalizedY };
      const coastField = sampleCoastNormalizedField(coastShape, point);
      if (coastField >= 0) landMask[y * PLAN_RESOLUTION + x] = 1;
      const landBlend = smoothstep(-0.025, 0.04, coastField);
      const inland = smoothstep(0, 0.16, coastField);
      const mountainUpliftMetres = sampleSeedWorldMountainUpliftMetres(mountainIntent, point);
      const index = y * PLAN_RESOLUTION + x;
      mountainUpliftSamples[index] = Math.round(
        Math.min(1, mountainUpliftMetres / SEED_WORLD_MAXIMUM_MOUNTAIN_UPLIFT_METRES) * 65_535
      );
      height[index] = landBlend * (0.025 + inland * 0.045) + mountainUpliftMetres / upliftRange.maximum;
    }
  }
  normalizeField(height);
  const slope = new Float32Array(cellCount);
  const curvature = new Float32Array(cellCount);
  calculateTerrainDerivatives(height, slope, curvature, PLAN_RESOLUTION);
  const summits = mountainRidges
    .flatMap((ridge) => ridge.brushes)
    .map((brush) => ({
      x: brush.center.x,
      y: brush.center.y,
      elevation: bilinearSample(height, brush.center.x, brush.center.y, PLAN_RESOLUTION)
    }))
    .filter((summit) => summit.elevation > 0.48)
    .sort((left, right) => right.elevation - left.elevation);
  return {
    height,
    slope,
    curvature,
    coastShape,
    spawnReserve,
    mountainRidges: Object.freeze(mountainRidges),
    mountainUpliftSamples,
    landMask,
    coastline: traceCoastline(coastShape),
    summits
  };
}

function createMountainBrushLayers(seed: number, brushId: string): readonly SeedWorldMountainBrushLayer[] {
  const layerSeed = deriveSeedWorldNamedSeed(seed, `mountain-layers:${brushId}`);
  const hillIndex = avalanche32(layerSeed ^ 0x2d41_76ab) % SEED_WORLD_HILL_BRUSH_KEYS.length;
  const detailIndex = avalanche32(layerSeed ^ 0x7e83_19c5) % SEED_WORLD_MOUNTAIN_DETAIL_BRUSH_KEYS.length;
  const baseAngle = unitHash(0x13, layerSeed) * Math.PI * 0.7 - Math.PI * 0.35;
  const detailAngle = unitHash(0x29, layerSeed) * Math.PI * 2 - Math.PI;
  return Object.freeze([
    Object.freeze({
      id: `${brushId}-base`,
      role: "base" as const,
      maskKey: SEED_WORLD_HILL_BRUSH_KEYS[hillIndex]!,
      radiusScale: 1,
      angleOffsetRadians: baseAngle,
      strengthRatio: 0.76 + unitHash(0x37, layerSeed) * 0.1
    }),
    Object.freeze({
      id: `${brushId}-detail`,
      role: "detail" as const,
      maskKey: SEED_WORLD_MOUNTAIN_DETAIL_BRUSH_KEYS[detailIndex]!,
      radiusScale: 0.7 + unitHash(0x4d, layerSeed) * 0.12,
      angleOffsetRadians: detailAngle,
      strengthRatio: 0.86 + unitHash(0x61, layerSeed) * 0.08
    })
  ]);
}

function fitMountainBrushToNaturalDomain(
  brush: SeedWorldMountainBrush,
  coastShape: SeedWorldCoastShape,
  spawnReserve: SeedWorldSpawnReserve
): SeedWorldMountainBrush | undefined {
  for (let attempt = 0; attempt < 8; attempt++) {
    const radiusScale = 0.94 ** attempt;
    const candidate = Object.freeze({
      ...brush,
      majorRadiusMetres: brush.majorRadiusMetres * radiusScale,
      minorRadiusMetres: brush.minorRadiusMetres * radiusScale
    });
    if (mountainBrushSupportIsValid(candidate, coastShape, spawnReserve)) return candidate;
  }
  return undefined;
}

function mountainBrushSupportIsValid(
  brush: SeedWorldMountainBrush,
  coastShape: SeedWorldCoastShape,
  spawnReserve: SeedWorldSpawnReserve
): boolean {
  const cosine = Math.cos(brush.angleRadians);
  const sine = Math.sin(brush.angleRadians);
  const majorRadius = brush.majorRadiusMetres / PLAN_SIZE_METRES;
  const minorRadius = brush.minorRadiusMetres / PLAN_SIZE_METRES;
  for (const ringScale of [0, 0.5, 1]) {
    const sampleCount = ringScale === 0 ? 1 : 64;
    for (let index = 0; index < sampleCount; index++) {
      const angle = (index / sampleCount) * Math.PI * 2;
      const localX = Math.cos(angle) * majorRadius * ringScale;
      const localZ = Math.sin(angle) * minorRadius * ringScale;
      const point = {
        x: brush.center.x + localX * cosine - localZ * sine,
        y: brush.center.y + localX * sine + localZ * cosine
      };
      if (sampleSeedWorldCoastSignedFieldMetres(coastShape, point) <= 0) return false;
      if (pointDistance(point, spawnReserve.center) * PLAN_SIZE_METRES < spawnReserve.mountainClearanceRadiusMetres) {
        return false;
      }
    }
  }
  return true;
}

function createCoastShape(random: RandomStream, seed: number): SeedWorldCoastShape {
  const shape: SeedWorldCoastShape = {
    sizeMetres: PLAN_SIZE_METRES,
    center: {
      x: SPAWN_CENTER.x + random.range(-0.028, 0.028),
      y: SPAWN_CENTER.y + random.range(-0.028, 0.028)
    },
    radiusXMetres: random.range(0.49, 0.56) * PLAN_SIZE_METRES,
    radiusZMetres: random.range(0.47, 0.55) * PLAN_SIZE_METRES,
    angleRadians: random.range(0, Math.PI),
    squareness: random.range(2.5, 3.8),
    warpSeed: seed ^ 0x5e6a_93d1,
    contourLevel: 0
  };
  const targetLandRatio = random.range(0.7, 0.86);
  const calibrationResolution = 48;
  const potentials: number[] = [];
  for (let y = 0; y < calibrationResolution; y++) {
    for (let x = 0; x < calibrationResolution; x++) {
      potentials.push(
        sampleCoastPotential(shape, { x: x / (calibrationResolution - 1), y: y / (calibrationResolution - 1) })
      );
    }
  }
  potentials.sort((left, right) => left - right);
  const seaLevelIndex = Math.floor((1 - targetLandRatio) * (potentials.length - 1));
  return { ...shape, contourLevel: potentials[seaLevelIndex] };
}

function sampleCoastNormalizedField(shape: SeedWorldCoastShape, point: SeedWorldPoint): number {
  return sampleCoastPotential(shape, point) - shape.contourLevel;
}

function sampleCoastPotential(shape: SeedWorldCoastShape, point: SeedWorldPoint): number {
  let parameters = coastSamplingParametersCache.get(shape);
  if (!parameters) {
    parameters = Object.freeze({
      cosine: Math.cos(shape.angleRadians),
      sine: Math.sin(shape.angleRadians),
      inverseRadiusX: shape.sizeMetres / shape.radiusXMetres,
      inverseRadiusZ: shape.sizeMetres / shape.radiusZMetres
    });
    coastSamplingParametersCache.set(shape, parameters);
  }
  const offsetX = point.x - shape.center.x;
  const offsetY = point.y - shape.center.y;
  const localX = (offsetX * parameters.cosine + offsetY * parameters.sine) * parameters.inverseRadiusX;
  const localY = (-offsetX * parameters.sine + offsetY * parameters.cosine) * parameters.inverseRadiusZ;
  const radius = Math.pow(
    Math.pow(Math.abs(localX), shape.squareness) + Math.pow(Math.abs(localY), shape.squareness),
    1 / shape.squareness
  );
  const broadWarp = (valueNoise(point.x * 2.1, point.y * 2.1, shape.warpSeed) - 0.5) * 0.26;
  const coastalWarp = (valueNoise(point.x * 5.4, point.y * 5.4, shape.warpSeed ^ 0x6bc1_7a45) - 0.5) * 0.09;
  return 1 - radius + broadWarp + coastalWarp;
}

function traceCoastline(shape: SeedWorldCoastShape): readonly SeedWorldPoint[] {
  const points: SeedWorldPoint[] = [];
  for (let index = 0; index < 192; index++) {
    const angle = (index / 192) * Math.PI * 2;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    let insideRadius = 0;
    let outsideRadius = 0.9;
    for (let iteration = 0; iteration < 18; iteration++) {
      const radius = (insideRadius + outsideRadius) * 0.5;
      const x = shape.center.x + directionX * radius;
      const y = shape.center.y + directionY * radius;
      if (sampleCoastNormalizedField(shape, { x, y }) >= 0) insideRadius = radius;
      else outsideRadius = radius;
    }
    points.push({
      x: clamp(shape.center.x + directionX * insideRadius, 0, 1),
      y: clamp(shape.center.y + directionY * insideRadius, 0, 1)
    });
  }
  return Object.freeze(points);
}

function generateHydrology(geology: GeologyResult, seed: number): HydrologyResult {
  const cellCount = PLAN_RESOLUTION * PLAN_RESOLUTION;
  const drainageHeight = new Float32Array(cellCount);
  const downstream = new Int32Array(cellCount);
  downstream.fill(-1);
  const visited = new Uint8Array(cellCount);
  const heap = new MinHeap();
  for (let index = 0; index < cellCount; index++) {
    if (geology.landMask[index] !== 0) continue;
    visited[index] = 1;
    drainageHeight[index] = 0;
    heap.push({ index, priority: 0 });
  }
  while (heap.size > 0) {
    const current = heap.pop()!;
    const currentX = current.index % PLAN_RESOLUTION;
    const currentY = Math.floor(current.index / PLAN_RESOLUTION);
    for (const [offsetX, offsetY] of NEIGHBORS) {
      const x = currentX + offsetX;
      const y = currentY + offsetY;
      if (x < 0 || y < 0 || x >= PLAN_RESOLUTION || y >= PLAN_RESOLUTION) continue;
      const index = y * PLAN_RESOLUTION + x;
      if (visited[index] !== 0) continue;
      visited[index] = 1;
      downstream[index] = current.index;
      drainageHeight[index] = Math.max(geology.height[index], drainageHeight[current.index] + HYDROLOGY_EPSILON);
      heap.push({ index, priority: drainageHeight[index] + unitHash(index, seed) * 1e-8 });
    }
  }

  const discharge = new Float32Array(cellCount);
  for (let y = 0; y < PLAN_RESOLUTION; y++) {
    for (let x = 0; x < PLAN_RESOLUTION; x++) {
      const index = y * PLAN_RESOLUTION + x;
      if (geology.landMask[index] === 0) continue;
      const rainfall = 0.55 + 0.9 * valueNoise((x / PLAN_RESOLUTION) * 5.2, (y / PLAN_RESOLUTION) * 5.2, seed);
      discharge[index] = rainfall;
    }
  }
  const descending = Array.from({ length: cellCount }, (_, index) => index).sort(
    (left, right) => drainageHeight[right] - drainageHeight[left]
  );
  for (const index of descending) {
    const target = downstream[index];
    if (target >= 0) discharge[target] += discharge[index];
  }

  const visiblePaths = selectVisibleRiverPaths(geology, downstream, discharge);
  const riverMask = new Uint8Array(cellCount);
  for (const path of visiblePaths) {
    for (const cell of path.cells) riverMask[cell] = 1;
  }
  const maximumDischarge = Math.max(...visiblePaths.flatMap((path) => path.cells.map((cell) => discharge[cell])));
  const riverThreshold = Math.min(...visiblePaths.map((path) => discharge[path.cells[0]]));
  const riverDistance = distanceFromMask(riverMask, PLAN_RESOLUTION);
  const oceanMask = new Uint8Array(cellCount);
  for (let index = 0; index < cellCount; index++) oceanMask[index] = geology.landMask[index] === 0 ? 1 : 0;
  const oceanDistance = distanceFromMask(oceanMask, PLAN_RESOLUTION);
  const normalizedDischarge = normalizeCopy(discharge);
  const planCellMetres = PLAN_SIZE_METRES / PLAN_RESOLUTION;
  const moisture = new Float32Array(cellCount);
  for (let y = 0; y < PLAN_RESOLUTION; y++) {
    for (let x = 0; x < PLAN_RESOLUTION; x++) {
      const index = y * PLAN_RESOLUTION + x;
      const climate = valueNoise((x / PLAN_RESOLUTION) * 4.5, (y / PLAN_RESOLUTION) * 4.5, seed ^ 0x71b5_39c3);
      if (geology.landMask[index] === 0) {
        moisture[index] = 1;
        continue;
      }
      moisture[index] = resolveSeedWorldClimateMoisture({
        climate,
        elevation: geology.height[index]!,
        slope: geology.slope[index]!,
        curvature: geology.curvature[index]!,
        flow: normalizedDischarge[index]!,
        oceanDistanceMetres: oceanDistance[index]! * planCellMetres
      });
    }
  }
  const trunkConfluences = new Set(
    visiblePaths.filter((path) => path.kind === "tributary").map((path) => path.cells[path.cells.length - 1])
  );
  return {
    drainageHeight,
    downstream,
    discharge,
    riverMask,
    riverDistance,
    moisture,
    rivers: compileRiverBedProfiles(
      visiblePaths.map((path, index) =>
        createRiverReach(
          path,
          drainageHeight,
          discharge,
          maximumDischarge,
          geology,
          index,
          path.kind === "trunk" ? trunkConfluences : undefined
        )
      )
    ),
    riverThreshold,
    maximumDischarge
  };
}

function selectVisibleRiverPaths(
  geology: GeologyResult,
  downstream: Int32Array,
  discharge: Float32Array
): readonly VisibleRiverPath[] {
  const upstream = Array.from({ length: downstream.length }, () => [] as number[]);
  const outlets: number[] = [];
  for (let index = 0; index < downstream.length; index++) {
    if (geology.landMask[index] === 0) continue;
    const target = downstream[index];
    if (target < 0 || geology.landMask[target] === 0) outlets.push(index);
    else upstream[target].push(index);
  }
  const { longestDistance, preferredUpstream } = calculateLongestUpstreamPaths(geology, downstream, upstream);
  const maximumOutletDischarge = Math.max(...outlets.map((candidate) => discharge[candidate]));
  const outlet = outlets.reduce((best, candidate) => {
    if (best < 0) return candidate;
    const candidateScore =
      longestDistance[candidate] * (0.85 + 0.15 * Math.sqrt(discharge[candidate] / maximumOutletDischarge));
    const bestScore = longestDistance[best] * (0.85 + 0.15 * Math.sqrt(discharge[best] / maximumOutletDischarge));
    return candidateScore > bestScore ? candidate : best;
  }, -1);
  if (outlet < 0) throw new Error("Seed World island has no land-to-ocean drainage outlet");

  const outletToHeadwater = tracePreferredUpstream(outlet, preferredUpstream);
  const headwaterToOutlet = [...outletToHeadwater].reverse();
  const firstVisible = headwaterToOutlet.findIndex((cell) => geology.height[cell] > 0.12);
  const visibleCellCount = firstVisible < 0 ? 0 : headwaterToOutlet.length - firstVisible;
  const trunkCells = headwaterToOutlet.slice(visibleCellCount >= 8 ? firstVisible : 0);
  const trunkSet = new Set(trunkCells);
  const candidates: Array<{
    readonly cells: readonly number[];
    readonly confluence: number;
    readonly score: number;
  }> = [];
  for (let trunkIndex = 2; trunkIndex < trunkCells.length - 2; trunkIndex++) {
    const confluence = trunkCells[trunkIndex];
    const trunkUpstream = trunkCells[trunkIndex - 1];
    for (const branchMouth of upstream[confluence]) {
      if (branchMouth === trunkUpstream || trunkSet.has(branchMouth)) continue;
      const confluenceDischarge = Math.max(discharge[confluence], Number.EPSILON);
      const relativeDischarge = discharge[branchMouth] / confluenceDischarge;
      const mouthToHeadwater = traceDominantUpstream(branchMouth, upstream, discharge);
      const headwaterToMouth = [...mouthToHeadwater].reverse();
      const branchInitiation = discharge[outlet] * 0.004;
      const firstBranchCell = headwaterToMouth.findIndex((cell) => discharge[cell] >= branchInitiation);
      const visibleBranch = headwaterToMouth.slice(Math.max(0, firstBranchCell));
      if (visibleBranch.length < 5) continue;
      candidates.push({
        cells: [...visibleBranch, confluence],
        confluence,
        score: relativeDischarge * Math.sqrt(visibleBranch.length)
      });
    }
  }
  candidates.sort((left, right) => right.score - left.score);
  const selected: VisibleRiverPath[] = [];
  for (const candidate of candidates) {
    if (
      selected.some(
        (path) =>
          pointDistance(
            cellPoint(path.cells[path.cells.length - 1], PLAN_RESOLUTION),
            cellPoint(candidate.confluence, PLAN_RESOLUTION)
          ) < 0.085
      )
    ) {
      continue;
    }
    selected.push({ kind: "tributary", cells: candidate.cells });
    if (selected.length >= MAXIMUM_VISIBLE_TRIBUTARIES) break;
  }
  return Object.freeze([{ kind: "trunk", cells: Object.freeze(trunkCells) }, ...selected]);
}

function calculateLongestUpstreamPaths(
  geology: GeologyResult,
  downstream: Int32Array,
  upstream: readonly (readonly number[])[]
): Readonly<{ longestDistance: Float32Array; preferredUpstream: Int32Array }> {
  const longestDistance = new Float32Array(downstream.length);
  const preferredUpstream = new Int32Array(downstream.length);
  preferredUpstream.fill(-1);
  const remainingUpstreams = new Uint8Array(downstream.length);
  const queue = new Int32Array(downstream.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < downstream.length; index++) {
    if (geology.landMask[index] === 0) continue;
    remainingUpstreams[index] = upstream[index].length;
    if (upstream[index].length === 0) {
      longestDistance[index] = 1;
      queue[tail++] = index;
    }
  }
  while (head < tail) {
    const current = queue[head++];
    const target = downstream[current];
    if (target < 0 || geology.landMask[target] === 0) continue;
    const currentX = current % PLAN_RESOLUTION;
    const currentY = Math.floor(current / PLAN_RESOLUTION);
    const targetX = target % PLAN_RESOLUTION;
    const targetY = Math.floor(target / PLAN_RESOLUTION);
    const candidateDistance = longestDistance[current] + Math.hypot(targetX - currentX, targetY - currentY);
    if (candidateDistance > longestDistance[target]) {
      longestDistance[target] = candidateDistance;
      preferredUpstream[target] = current;
    }
    remainingUpstreams[target]--;
    if (remainingUpstreams[target] === 0) queue[tail++] = target;
  }
  return { longestDistance, preferredUpstream };
}

function tracePreferredUpstream(start: number, preferredUpstream: Int32Array): readonly number[] {
  const cells = [start];
  let current = start;
  while (preferredUpstream[current] >= 0) {
    current = preferredUpstream[current];
    cells.push(current);
  }
  return cells;
}

function traceDominantUpstream(
  start: number,
  upstream: readonly (readonly number[])[],
  discharge: Float32Array
): readonly number[] {
  const cells = [start];
  let current = start;
  while (upstream[current].length > 0) {
    current = upstream[current].reduce((best, candidate) =>
      discharge[candidate] > discharge[best] ? candidate : best
    );
    cells.push(current);
  }
  return cells;
}

function createRiverReach(
  path: VisibleRiverPath,
  drainageHeight: Float32Array,
  discharge: Float32Array,
  maximumDischarge: number,
  geology: GeologyResult,
  index: number,
  requiredCells?: ReadonlySet<number>
): SeedWorldRiverReach {
  const sampledCells = path.cells.filter(
    (cell, pointIndex) =>
      pointIndex === 0 || pointIndex === path.cells.length - 1 || pointIndex % 2 === 0 || requiredCells?.has(cell)
  );
  let previousDepthMetres: number = SEED_WORLD_RIVER_DEPTH_RANGE_METRES.minimum;
  const points = sampledCells.map((cell, pointIndex) => {
    const dischargeResponse = Math.pow(discharge[cell] / maximumDischarge, 0.45);
    const confinement = sampleRiverCrossSectionConfinement(sampledCells, pointIndex, geology);
    const widthMetres =
      SEED_WORLD_RIVER_WIDTH_SCALE * (2.5 + 24 * dischargeResponse) * mix(1, RIVER_CONFINED_WIDTH_FACTOR, confinement);
    const depthMetres = Math.min(
      SEED_WORLD_RIVER_DEPTH_RANGE_METRES.maximum,
      mix(SEED_WORLD_RIVER_DEPTH_RANGE_METRES.minimum, 11.2, dischargeResponse) * mix(1, 1.25, confinement)
    );
    previousDepthMetres = Math.max(previousDepthMetres, depthMetres);
    return {
      ...cellPoint(cell, PLAN_RESOLUTION),
      elevation: drainageHeight[cell],
      discharge: discharge[cell],
      widthMetres,
      depthMetres: previousDepthMetres,
      bankFeatherMetres: mix(
        SEED_WORLD_RIVER_BANK_FEATHER_RANGE_METRES.maximum,
        SEED_WORLD_RIVER_BANK_FEATHER_RANGE_METRES.minimum,
        confinement
      ),
      bedElevationMetres: 0,
      junction: requiredCells?.has(cell) || undefined
    };
  });
  return {
    id: path.kind === "trunk" ? "river-trunk" : `river-tributary-${index}`,
    kind: path.kind,
    points
  };
}

function sampleRiverCrossSectionConfinement(
  cells: readonly number[],
  pointIndex: number,
  geology: GeologyResult
): number {
  const current = cellPoint(cells[pointIndex], PLAN_RESOLUTION);
  const previous = cellPoint(cells[Math.max(0, pointIndex - 1)], PLAN_RESOLUTION);
  const next = cellPoint(cells[Math.min(cells.length - 1, pointIndex + 1)], PLAN_RESOLUTION);
  const tangentX = next.x - previous.x;
  const tangentY = next.y - previous.y;
  const tangentLength = Math.max(Number.EPSILON, Math.hypot(tangentX, tangentY));
  const offset = RIVER_CROSS_SECTION_SAMPLE_DISTANCE_METRES / PLAN_SIZE_METRES;
  const normalX = (-tangentY / tangentLength) * offset;
  const normalY = (tangentX / tangentLength) * offset;
  const centreHeight = bilinearSample(geology.height, current.x, current.y, PLAN_RESOLUTION);
  const leftHeight = bilinearSample(geology.height, current.x + normalX, current.y + normalY, PLAN_RESOLUTION);
  const rightHeight = bilinearSample(geology.height, current.x - normalX, current.y - normalY, PLAN_RESOLUTION);
  const reliefMetres =
    (Math.max(0, leftHeight - centreHeight) + Math.max(0, rightHeight - centreHeight)) *
    0.5 *
    HIGHLAND_UPLIFT_RANGE_METRES.maximum;
  return smoothstep(
    RIVER_CONFINEMENT_RELIEF_RANGE_METRES.open,
    RIVER_CONFINEMENT_RELIEF_RANGE_METRES.confined,
    reliefMetres
  );
}

function compileRiverBedProfiles(reaches: readonly SeedWorldRiverReach[]): readonly SeedWorldRiverReach[] {
  const trunk = reaches.find((reach) => reach.kind === "trunk");
  if (!trunk) return reaches;
  const trunkArc = riverPointArcMetres(trunk.points);
  const trunkLength = trunkArc.at(-1) ?? 0;
  const trunkSourceBed = clamp(24 + trunk.points[0].elevation * 112, 32, 128);
  const trunkMouthBed = -1.5;
  const trunkPoints = trunk.points.map((point, index) => ({
    ...point,
    bedElevationMetres: mix(trunkSourceBed, trunkMouthBed, trunkLength > 0 ? trunkArc[index] / trunkLength : 1)
  }));
  const trunkProfile: SeedWorldRiverReach = { ...trunk, points: Object.freeze(trunkPoints) };
  const result = [trunkProfile];
  for (const reach of reaches) {
    if (reach === trunk) continue;
    const confluence = reach.points.at(-1);
    if (!confluence) continue;
    const trunkConfluence = trunkPoints.reduce((nearest, point) =>
      pointDistance(point, confluence) < pointDistance(nearest, confluence) ? point : nearest
    );
    const arc = riverPointArcMetres(reach.points);
    const length = arc.at(-1) ?? 0;
    const drainageRise = Math.max(0, reach.points[0].elevation - confluence.elevation);
    const sourceBed = trunkConfluence.bedElevationMetres + clamp(8 + drainageRise * 84 + length * 0.004, 10, 56);
    result.push({
      ...reach,
      points: Object.freeze(
        reach.points.map((point, index) => ({
          ...point,
          bedElevationMetres: mix(sourceBed, trunkConfluence.bedElevationMetres, length > 0 ? arc[index] / length : 1)
        }))
      )
    });
  }
  return Object.freeze(result);
}

function riverPointArcMetres(points: readonly SeedWorldPoint[]): readonly number[] {
  const result = [0];
  for (let index = 1; index < points.length; index++) {
    result.push(result[index - 1] + pointDistance(points[index - 1], points[index]) * PLAN_SIZE_METRES);
  }
  return result;
}

function generateRoads(
  geology: GeologyResult,
  hydrology: HydrologyResult,
  ecology: EcologyResult,
  naturalHeightMetres: Float32Array,
  naturalHeightResolution: number,
  seed: number
): RoadResult {
  const random = new RandomStream(seed);
  const riverCurves = compileSeedWorldRiverCurves({ sizeMetres: PLAN_SIZE_METRES, rivers: hydrology.rivers });
  const riverGeometry = compileRoadRiverGeometry(riverCurves);
  const terrainIntent = {
    sizeMetres: PLAN_SIZE_METRES,
    coastShape: geology.coastShape,
    spawnReserve: geology.spawnReserve,
    mountainRidges: geology.mountainRidges
  };
  const exactRoadDryMask = compileExactRoadDryMask(geology, hydrology, ecology, riverGeometry, SEED_WORLD_ROAD_STYLE);
  const roadComponent = largestRoadComponent(
    geology,
    hydrology,
    ecology,
    naturalHeightMetres,
    naturalHeightResolution,
    exactRoadDryMask
  );
  const pois: SeedWorldPoi[] = [];
  const targetPoiCount = random.integer(3, 6);
  for (let attempt = 0; attempt < 1_200 && pois.length < targetPoiCount; attempt++) {
    const x = random.integer(8, PLAN_RESOLUTION - 8);
    const y = random.integer(8, PLAN_RESOLUTION - 8);
    const index = y * PLAN_RESOLUTION + x;
    if (
      roadComponent[index] === 0 ||
      geology.height[index] < 0.055 ||
      geology.height[index] > 0.76 ||
      geology.slope[index] > 0.38 ||
      hydrology.riverMask[index] !== 0 ||
      hydrology.riverDistance[index] < 2 ||
      ecology.naturalWetlandIntent[index] > 0
    ) {
      continue;
    }
    const point = cellPoint(index, PLAN_RESOLUTION);
    if (pois.some((poi) => pointDistance(point, poi.position) < 0.12)) continue;
    const kind = pois.length === 0 ? "settlement" : geology.height[index] > 0.5 ? "lookout" : "crossroads";
    pois.push({ id: `poi-${pois.length + 1}`, kind, position: point });
  }
  if (pois.length < 2) {
    const fallbackCells = Array.from({ length: geology.height.length }, (_, index) => index)
      .filter((index) => {
        const x = index % PLAN_RESOLUTION;
        const y = Math.floor(index / PLAN_RESOLUTION);
        return (
          roadComponent[index] !== 0 &&
          x > 1 &&
          y > 1 &&
          x < PLAN_RESOLUTION - 2 &&
          y < PLAN_RESOLUTION - 2 &&
          hydrology.riverDistance[index] >= 2 &&
          ecology.naturalWetlandIntent[index] === 0 &&
          geology.slope[index] < 0.55
        );
      })
      .sort((left, right) => geology.slope[left] - geology.slope[right]);
    for (const index of fallbackCells) {
      const point = cellPoint(index, PLAN_RESOLUTION);
      if (pois.some((poi) => pointDistance(point, poi.position) < 0.22)) continue;
      pois.push({
        id: `poi-${pois.length + 1}`,
        kind: pois.length === 0 ? "settlement" : "crossroads",
        position: point
      });
      if (pois.length >= 2) break;
    }
  }
  const edges = randomBranchingRoadEdges(pois, seed);
  const roads: SeedWorldRoad[] = [];
  const connectedPoiIds = new Set<string>();
  const roadMask = new Uint8Array(PLAN_RESOLUTION * PLAN_RESOLUTION);
  const occupiedRoadCells = new Uint8Array(PLAN_RESOLUTION * PLAN_RESOLUTION);
  const occupiedRoadEdges = new Set<string>();
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
    const [fromIndex, toIndex] = edges[edgeIndex];
    const from = pois[fromIndex];
    const to = pois[toIndex];
    if (roads.length > 0 && !connectedPoiIds.has(from.id)) continue;
    const blockedCells = new Uint8Array(PLAN_RESOLUTION * PLAN_RESOLUTION);
    let cellPath: number[];
    let routePoints: readonly SeedWorldPoint[];
    let bridgeIntervals: readonly SeedWorldRoadBridgeInterval[];
    for (;;) {
      try {
        cellPath = routeRoad(
          from.position,
          to.position,
          geology,
          hydrology,
          ecology,
          naturalHeightMetres,
          naturalHeightResolution,
          seed ^ edgeIndex,
          blockedCells,
          occupiedRoadCells,
          occupiedRoadEdges,
          false,
          exactRoadDryMask,
          SEED_WORLD_ROAD_STYLE
        );
      } catch {
        cellPath = [];
      }
      if (cellPath.length < 2) {
        routePoints = [];
        bridgeIntervals = [];
        break;
      }
      const routedPoints = cellPath.map((cell) => cellPoint(cell, PLAN_RESOLUTION));
      routePoints = smoothRoadRoutePoints(
        routedPoints,
        geology,
        hydrology,
        ecology,
        naturalHeightMetres,
        naturalHeightResolution,
        riverGeometry,
        terrainIntent,
        occupiedRoadCells,
        cellPath[0],
        SEED_WORLD_ROAD_STYLE
      );
      bridgeIntervals = compileRoadBridgeIntervals(
        routePoints,
        riverGeometry,
        terrainIntent,
        hydrology.moisture,
        geology.slope,
        PLAN_RESOLUTION
      );
      const invalidSegment = findUnbridgedWetlandSegment(
        routePoints,
        bridgeIntervals,
        terrainIntent,
        hydrology.moisture,
        geology.slope,
        PLAN_RESOLUTION,
        riverGeometry
      );
      if (invalidSegment < 0) break;
      const blockedPathIndex = invalidSegment < cellPath.length - 1 ? invalidSegment : invalidSegment - 1;
      const blockedCell = cellPath[blockedPathIndex];
      if (blockedPathIndex <= 0 || blockedCell === undefined || blockedCells[blockedCell] !== 0) {
        throw new Error(`Seed World road routing cannot avoid wetland seed=${seed >>> 0} edge=${edgeIndex}`);
      }
      blockedCells[blockedCell] = 1;
    }
    if (cellPath.length < 2) continue;
    const pointArcs = riverPointArcMetres(routePoints);
    const points = compileRoadPoints(
      routePoints,
      pointArcs,
      bridgeIntervals,
      naturalHeightMetres,
      naturalHeightResolution,
      seed ^ edgeIndex,
      SEED_WORLD_ROAD_STYLE
    );
    for (let pathIndex = 0; pathIndex < cellPath.length; pathIndex++) {
      const cell = cellPath[pathIndex];
      occupiedRoadCells[cell] = 1;
      paintMaskDisk(roadMask, cell, PLAN_RESOLUTION, 1);
      if (pathIndex > 0) occupiedRoadEdges.add(roadEdgeKey(cellPath[pathIndex - 1], cell));
    }
    roads.push({
      id: `road-${roads.length + 1}`,
      fromPoiId: from.id,
      toPoiId: to.id,
      points,
      bridgeIntervals
    });
    connectedPoiIds.add(from.id);
    connectedPoiIds.add(to.id);
  }
  const connectedPois = pois.filter((poi) => connectedPoiIds.has(poi.id));
  return { pois: connectedPois, roads, roadMask, roadDistance: distanceFromMask(roadMask, PLAN_RESOLUTION) };
}

function smoothRoadRoutePoints(
  routedPoints: readonly SeedWorldPoint[],
  geology: GeologyResult,
  hydrology: HydrologyResult,
  ecology: EcologyResult,
  naturalHeightMetres: Float32Array,
  naturalHeightResolution: number,
  riverGeometry: RoadRiverGeometry,
  terrainIntent: Pick<SeedWorldPlan, "sizeMetres" | "coastShape" | "spawnReserve" | "mountainRidges">,
  occupiedRoadCells: Uint8Array,
  allowedOccupiedCell: number,
  style: SeedWorldRoadStyle
): readonly SeedWorldPoint[] {
  if (routedPoints.length < 3) return routedPoints;
  let smoothed = [...routedPoints];
  for (let pass = 0; pass < ROAD_ROUTE_SMOOTHING_PASSES; pass++) {
    const next: SeedWorldPoint[] = [smoothed[0]];
    for (let index = 1; index < smoothed.length - 1; index++) {
      const previous = next.at(-1)!;
      const current = smoothed[index];
      const following = smoothed[index + 1];
      const candidate = Object.freeze({
        x: mix(current.x, (smoothed[index - 1].x + following.x) * 0.5, 0.46),
        y: mix(current.y, (smoothed[index - 1].y + following.y) * 0.5, 0.46)
      });
      next.push(
        roadRouteSegmentIsValid(
          previous,
          candidate,
          geology,
          hydrology,
          ecology,
          naturalHeightMetres,
          naturalHeightResolution,
          riverGeometry,
          terrainIntent,
          occupiedRoadCells,
          allowedOccupiedCell,
          style
        ) &&
          roadRouteSegmentIsValid(
            candidate,
            following,
            geology,
            hydrology,
            ecology,
            naturalHeightMetres,
            naturalHeightResolution,
            riverGeometry,
            terrainIntent,
            occupiedRoadCells,
            allowedOccupiedCell,
            style
          )
          ? candidate
          : current
      );
    }
    next.push(smoothed.at(-1)!);
    smoothed = next;
  }
  return Object.freeze(smoothed);
}

function roadRouteSegmentIsValid(
  start: SeedWorldPoint,
  end: SeedWorldPoint,
  geology: GeologyResult,
  hydrology: HydrologyResult,
  ecology: EcologyResult,
  naturalHeightMetres: Float32Array,
  naturalHeightResolution: number,
  riverGeometry: RoadRiverGeometry,
  terrainIntent: Pick<SeedWorldPlan, "sizeMetres" | "coastShape" | "spawnReserve" | "mountainRidges">,
  occupiedRoadCells: Uint8Array,
  allowedOccupiedCell: number,
  style: SeedWorldRoadStyle
): boolean {
  const lengthMetres = pointDistance(start, end) * PLAN_SIZE_METRES;
  const sampleCount = Math.max(1, Math.ceil(lengthMetres / (PLAN_SIZE_METRES / PLAN_RESOLUTION)));
  let previous = start;
  for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex++) {
    const progress = sampleIndex / sampleCount;
    const point = Object.freeze({ x: mix(start.x, end.x, progress), y: mix(start.y, end.y, progress) });
    const cell = normalizedPointIndex(point, PLAN_RESOLUTION);
    if (!roadCellIsTraversable(cell, geology, hydrology, ecology)) return false;
    if (occupiedRoadCells[cell] !== 0 && cell !== allowedOccupiedCell) return false;
    if (
      sampleRoadRiverWaterSignedDistanceMetres(riverGeometry, point) <= style.coreHalfWidthMetres ||
      sampleRoadNaturalWetlandInfluence(
        point,
        terrainIntent,
        hydrology.moisture,
        geology.slope,
        PLAN_RESOLUTION,
        riverGeometry
      ) >= ROAD_MAXIMUM_WETLAND_INFLUENCE
    ) {
      return false;
    }
    if (!roadStepHasExactCoastClearance(previous, point, geology)) return false;
    const run = pointDistance(previous, point) * PLAN_SIZE_METRES;
    if (run > Number.EPSILON) {
      const previousHeight = bilinearSample(naturalHeightMetres, previous.x, previous.y, naturalHeightResolution);
      const height = bilinearSample(naturalHeightMetres, point.x, point.y, naturalHeightResolution);
      if (Math.abs(height - previousHeight) / run > SEED_WORLD_MAXIMUM_ROAD_ROUTING_GRADE) return false;
    }
    previous = point;
  }
  return true;
}

function compileRoadPoints(
  routePoints: readonly SeedWorldPoint[],
  pointArcs: readonly number[],
  bridgeIntervals: readonly SeedWorldRoadBridgeInterval[],
  naturalHeightMetres: Float32Array,
  naturalHeightResolution: number,
  seed: number,
  style: SeedWorldRoadStyle
): readonly SeedWorldRoadPoint[] {
  return Object.freeze(
    routePoints.map((point, pointIndex) => {
      const previous = routePoints[Math.max(0, pointIndex - 1)];
      const next = routePoints[Math.min(routePoints.length - 1, pointIndex + 1)];
      const tangentX = next.x - previous.x;
      const tangentY = next.y - previous.y;
      const tangentLength = Math.hypot(tangentX, tangentY);
      const normalX = tangentLength > 0 ? -tangentY / tangentLength : 0;
      const normalY = tangentLength > 0 ? tangentX / tangentLength : 1;
      const reliefSampleOffset = 20 / PLAN_SIZE_METRES;
      const centreHeight = bilinearSample(naturalHeightMetres, point.x, point.y, naturalHeightResolution);
      const leftHeight = bilinearSample(
        naturalHeightMetres,
        point.x + normalX * reliefSampleOffset,
        point.y + normalY * reliefSampleOffset,
        naturalHeightResolution
      );
      const rightHeight = bilinearSample(
        naturalHeightMetres,
        point.x - normalX * reliefSampleOffset,
        point.y - normalY * reliefSampleOffset,
        naturalHeightResolution
      );
      const enclosingRelief = (Math.max(0, leftHeight - centreHeight) + Math.max(0, rightHeight - centreHeight)) * 0.5;
      const confinement = smoothstep(1, style.confinedReliefMetres, enclosingRelief);
      const coreNoise = valueNoise(point.x * 12, point.y * 12, seed ^ 0x6ef2_81a5);
      const shoulderNoise = valueNoise(point.x * 16, point.y * 16, seed ^ 0x71c4_0d93);
      const coreHalfWidthMetres = Math.min(
        style.coreHalfWidthMetres,
        Math.max(
          style.minimumCoreHalfWidthMetres,
          mix(style.coreHalfWidthMetres, style.minimumCoreHalfWidthMetres, confinement) * mix(0.84, 1.16, coreNoise)
        )
      );
      const shoulderWidthMetres =
        mix(style.shoulderWidthMetres[1], style.shoulderWidthMetres[0], confinement) * mix(0.72, 1.28, shoulderNoise);
      return Object.freeze({
        ...point,
        naturalHeightMetres: centreHeight,
        coreHalfWidthMetres,
        shoulderWidthMetres,
        bridge: bridgeIntervals.some(
          (interval) =>
            pointArcs[pointIndex] >= interval.startArcMetres && pointArcs[pointIndex] <= interval.endArcMetres
        )
      });
    })
  );
}

function generateEcology(geology: GeologyResult, hydrology: HydrologyResult, seed: number): EcologyResult {
  const landCover = new Uint8Array(PLAN_RESOLUTION * PLAN_RESOLUTION);
  const roadWetlandMask = new Uint8Array(PLAN_RESOLUTION * PLAN_RESOLUTION);
  const naturalWetlandIntent = new Float32Array(PLAN_RESOLUTION * PLAN_RESOLUTION);
  const forestThreshold = new RandomStream(seed).range(0.44, 0.56);
  const wetlandRiverField = rasterizeSeedWorldRiverField(
    compileSeedWorldRiverCurves({ sizeMetres: PLAN_SIZE_METRES, rivers: hydrology.rivers }),
    {
      resolution: PLAN_RESOLUTION,
      sizeMetres: PLAN_SIZE_METRES,
      sampleOffset: 0,
      bankExpansionMetres: SEED_WORLD_WETLAND_BANK_EXPANSION_METRES,
      distanceFieldMarginMetres: SEED_WORLD_WETLAND_SDF_TRANSITION_METRES
    }
  );
  for (let y = 0; y < PLAN_RESOLUTION; y++) {
    for (let x = 0; x < PLAN_RESOLUTION; x++) {
      const index = y * PLAN_RESOLUTION + x;
      if (geology.landMask[index] === 0) continue;
      if (hydrology.riverMask[index] !== 0) continue;
      const wetland = sampleSeedWorldWetlandInfluence(
        wetlandRiverField.bankDistanceMetres[index],
        wetlandRiverField.bankFeatherMetres[index]
      );
      naturalWetlandIntent[index] = wetland;
      if (wetland > 0) roadWetlandMask[index] = 1;
      const cluster = valueNoise((x / PLAN_RESOLUTION) * 7, (y / PLAN_RESOLUTION) * 7, seed);
      const moistureSuitability = smoothstep(0.55, 0.82, hydrology.moisture[index]);
      const slopeSuitability = 1 - smoothstep(0.3, 0.58, geology.slope[index]);
      const elevationSuitability = 1 - smoothstep(0.78, 0.9, geology.height[index]);
      const clusterModulation = mix(0.82, 1.12, cluster);
      const forestSuitability = moistureSuitability * slopeSuitability * elevationSuitability * clusterModulation;
      if (forestSuitability > forestThreshold) {
        landCover[index] = SeedWorldLandCover.Forest;
      }
    }
  }
  return {
    landCover,
    roadWetlandDistance: distanceFromMask(roadWetlandMask, PLAN_RESOLUTION),
    naturalWetlandIntent
  };
}

function largestRoadComponent(
  geology: GeologyResult,
  hydrology: HydrologyResult,
  ecology: EcologyResult,
  naturalHeightMetres: Float32Array,
  naturalHeightResolution: number,
  exactRoadDryMask: Uint8Array
): Uint8Array {
  const visited = new Uint8Array(PLAN_RESOLUTION * PLAN_RESOLUTION);
  let largest: number[] = [];
  for (let start = 0; start < visited.length; start++) {
    if (
      visited[start] !== 0 ||
      exactRoadDryMask[start] === 0 ||
      !roadCellIsTraversable(start, geology, hydrology, ecology)
    ) {
      continue;
    }
    const cells: number[] = [];
    const queue = [start];
    visited[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      cells.push(cell);
      const x = cell % PLAN_RESOLUTION;
      const y = Math.floor(cell / PLAN_RESOLUTION);
      for (const [offsetX, offsetY] of NEIGHBORS) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 1 || nextY < 1 || nextX >= PLAN_RESOLUTION - 1 || nextY >= PLAN_RESOLUTION - 1) continue;
        const next = nextY * PLAN_RESOLUTION + nextX;
        if (
          visited[next] !== 0 ||
          exactRoadDryMask[next] === 0 ||
          !roadCellIsTraversable(next, geology, hydrology, ecology) ||
          roadStepGrade(cell, next, naturalHeightMetres, naturalHeightResolution) >
            SEED_WORLD_MAXIMUM_ROAD_ROUTING_GRADE
        ) {
          continue;
        }
        visited[next] = 1;
        queue.push(next);
      }
    }
    if (cells.length > largest.length) largest = cells;
  }
  const result = new Uint8Array(visited.length);
  for (const cell of largest) result[cell] = 1;
  return result;
}

function roadCellIsTraversable(
  index: number,
  geology: GeologyResult,
  hydrology: HydrologyResult,
  ecology: EcologyResult
): boolean {
  const x = index % PLAN_RESOLUTION;
  const y = Math.floor(index / PLAN_RESOLUTION);
  return (
    x >= 1 &&
    y >= 1 &&
    x < PLAN_RESOLUTION - 1 &&
    y < PLAN_RESOLUTION - 1 &&
    geology.landMask[index] !== 0 &&
    ecology.roadWetlandDistance[index] > 1 &&
    hydrology.riverMask[index] === 0
  );
}

function clearRoadCorridor(landCover: Uint8Array, roadMask: Uint8Array): Uint8Array {
  const cleared = landCover.slice();
  for (let index = 0; index < cleared.length; index++) {
    if (roadMask[index] !== 0) cleared[index] = SeedWorldLandCover.Grassland;
  }
  return cleared;
}

function randomBranchingRoadEdges(pois: readonly SeedWorldPoi[], seed: number): Array<readonly [number, number]> {
  if (pois.length < 2) return [];
  let trunk: readonly [number, number] = [0, 1];
  let trunkDistance = pointDistance(pois[0].position, pois[1].position);
  for (let left = 0; left < pois.length - 1; left++) {
    for (let right = left + 1; right < pois.length; right++) {
      const distance = pointDistance(pois[left].position, pois[right].position);
      if (distance <= trunkDistance) continue;
      trunk = [left, right];
      trunkDistance = distance;
    }
  }
  const connected = new Set(trunk);
  const edges: Array<readonly [number, number]> = [trunk];
  while (connected.size < pois.length) {
    const to = Array.from({ length: pois.length }, (_, index) => index)
      .filter((index) => !connected.has(index))
      .sort((left, right) => unitHash(right, seed ^ connected.size) - unitHash(left, seed ^ connected.size))[0]!;
    let from = Array.from(connected)[0]!;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of connected) {
      const distance = pointDistance(pois[candidate].position, pois[to].position);
      const score = distance * mix(0.72, 1.28, unitHash(candidate * 257 + to, seed));
      if (score >= bestScore) continue;
      from = candidate;
      bestScore = score;
    }
    edges.push([from, to]);
    connected.add(to);
  }
  return edges;
}

function routeRoad(
  from: SeedWorldPoint,
  to: SeedWorldPoint,
  geology: GeologyResult,
  hydrology: HydrologyResult,
  ecology: EcologyResult,
  naturalHeightMetres: Float32Array,
  naturalHeightResolution: number,
  seed: number,
  blockedCells: Uint8Array,
  occupiedRoadCells: Uint8Array,
  occupiedRoadEdges: ReadonlySet<string>,
  joinsExistingNetwork: boolean,
  exactRoadDryMask: Uint8Array,
  style: SeedWorldRoadStyle
): number[] {
  const start = normalizedPointIndex(from, PLAN_RESOLUTION);
  const goal = normalizedPointIndex(to, PLAN_RESOLUTION);
  const cellCount = PLAN_RESOLUTION * PLAN_RESOLUTION;
  const cost = new Float32Array(cellCount);
  cost.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(cellCount);
  previous.fill(-1);
  const closed = new Uint8Array(cellCount);
  const heap = new MinHeap();
  cost[start] = 0;
  heap.push({ index: start, priority: 0 });
  let reachedGoal = -1;
  while (heap.size > 0) {
    const current = heap.pop()!;
    if (closed[current.index] !== 0) continue;
    if (current.index === goal || (joinsExistingNetwork && occupiedRoadCells[current.index] !== 0)) {
      reachedGoal = current.index;
      break;
    }
    closed[current.index] = 1;
    const currentX = current.index % PLAN_RESOLUTION;
    const currentY = Math.floor(current.index / PLAN_RESOLUTION);
    for (const [offsetX, offsetY] of NEIGHBORS) {
      const x = currentX + offsetX;
      const y = currentY + offsetY;
      if (x < 1 || y < 1 || x >= PLAN_RESOLUTION - 1 || y >= PLAN_RESOLUTION - 1) continue;
      const index = y * PLAN_RESOLUTION + x;
      if (
        closed[index] !== 0 ||
        blockedCells[index] !== 0 ||
        (occupiedRoadCells[index] !== 0 && !joinsExistingNetwork && index !== goal) ||
        roadStepCrossesOccupiedEdge(current.index, index, occupiedRoadEdges) ||
        exactRoadDryMask[index] === 0 ||
        !roadCellIsTraversable(index, geology, hydrology, ecology) ||
        roadStepGrade(current.index, index, naturalHeightMetres, naturalHeightResolution) >
          SEED_WORLD_MAXIMUM_ROAD_ROUTING_GRADE
      ) {
        continue;
      }
      const distance = offsetX === 0 || offsetY === 0 ? 1 : Math.SQRT2;
      const riverPenalty =
        hydrology.riverMask[index] === 0
          ? 0
          : 22 + 12 * Math.log2(Math.max(1, hydrology.discharge[index] / hydrology.riverThreshold));
      const waterDistanceMetres = hydrology.riverDistance[index] * (PLAN_SIZE_METRES / PLAN_RESOLUTION);
      const waterViewPenalty =
        Math.max(0, waterDistanceMetres - style.waterViewRadiusMetres) / Math.max(1, style.waterViewRadiusMetres);
      const stepCost =
        distance *
        (1 +
          Math.max(0, geology.height[index] - 0.7) * 4 +
          riverPenalty +
          waterViewPenalty * 1.2 +
          unitHash(index, seed) * 0.2);
      const candidate = cost[current.index] + stepCost;
      if (candidate >= cost[index]) continue;
      cost[index] = candidate;
      previous[index] = current.index;
      const heuristic = Math.hypot(x - (goal % PLAN_RESOLUTION), y - Math.floor(goal / PLAN_RESOLUTION));
      heap.push({ index, priority: candidate + heuristic });
    }
  }
  if (reachedGoal < 0 || (reachedGoal !== start && previous[reachedGoal] < 0)) {
    throw new Error(
      `Seed World road routing failed seed=${seed >>> 0} stage=road id=route arc=0 XZ=${from.x.toFixed(4)},${from.y.toFixed(4)} H=${roadCellHeight(start, naturalHeightMetres, naturalHeightResolution).toFixed(3)} rise=0 grade=0 SDF=unreachable bridgeInterval=none category=road requiredMargin=grade<=${SEED_WORLD_MAXIMUM_ROAD_ROUTING_GRADE}`
    );
  }
  const path: number[] = [];
  let current = reachedGoal;
  while (current >= 0) {
    path.push(current);
    if (current === start) break;
    current = previous[current];
  }
  path.reverse();
  return path;
}

function compileExactRoadDryMask(
  geology: GeologyResult,
  hydrology: HydrologyResult,
  ecology: EcologyResult,
  riverGeometry: RoadRiverGeometry,
  style: SeedWorldRoadStyle
): Uint8Array {
  const result = new Uint8Array(PLAN_RESOLUTION * PLAN_RESOLUTION);
  const halfCellDiagonalMetres = (PLAN_SIZE_METRES / PLAN_RESOLUTION) * Math.SQRT1_2;
  const clearanceMetres = style.coreHalfWidthMetres + halfCellDiagonalMetres;
  for (let cell = 0; cell < result.length; cell++) {
    if (!roadCellIsTraversable(cell, geology, hydrology, ecology)) continue;
    if (sampleRoadRiverWaterSignedDistanceMetres(riverGeometry, cellPoint(cell, PLAN_RESOLUTION)) <= clearanceMetres) {
      continue;
    }
    result[cell] = 1;
  }
  return result;
}

function roadEdgeKey(start: number, end: number): string {
  return start < end ? `${start}:${end}` : `${end}:${start}`;
}

function roadStepCrossesOccupiedEdge(start: number, end: number, occupiedEdges: ReadonlySet<string>): boolean {
  const startX = start % PLAN_RESOLUTION;
  const startY = Math.floor(start / PLAN_RESOLUTION);
  const endX = end % PLAN_RESOLUTION;
  const endY = Math.floor(end / PLAN_RESOLUTION);
  if (startX === endX || startY === endY) return false;
  const oppositeStart = startY * PLAN_RESOLUTION + endX;
  const oppositeEnd = endY * PLAN_RESOLUTION + startX;
  return occupiedEdges.has(roadEdgeKey(oppositeStart, oppositeEnd));
}

function findUnbridgedWetlandSegment(
  points: readonly SeedWorldPoint[],
  bridgeIntervals: readonly SeedWorldRoadBridgeInterval[],
  terrainIntent: Pick<SeedWorldPlan, "sizeMetres" | "coastShape" | "spawnReserve" | "mountainRidges">,
  moisture: Float32Array,
  slope: Float32Array,
  resolution: number,
  riverGeometry: RoadRiverGeometry
): number {
  const pointArcs = riverPointArcMetres(points);
  const samples = sampleRoadPolyline(points, ROAD_EXACT_SAMPLE_SPACING_METRES);
  let segmentIndex = 1;
  for (const sample of samples) {
    while (segmentIndex < pointArcs.length - 1 && sample.arcMetres > pointArcs[segmentIndex] + 1e-6) segmentIndex++;
    const bridge = bridgeIntervals.some(
      (interval) => sample.arcMetres >= interval.startArcMetres && sample.arcMetres <= interval.endArcMetres
    );
    if (bridge) continue;
    const wetland = sampleRoadNaturalWetlandInfluence(
      sample.point,
      terrainIntent,
      moisture,
      slope,
      resolution,
      riverGeometry
    );
    if (wetland >= ROAD_MAXIMUM_WETLAND_INFLUENCE) return segmentIndex;
  }
  return -1;
}

interface RoadRiverSegment {
  readonly startX: number;
  readonly startZ: number;
  readonly endX: number;
  readonly endZ: number;
  readonly startWidthMetres: number;
  readonly endWidthMetres: number;
  readonly startBankFeatherMetres: number;
  readonly endBankFeatherMetres: number;
}

interface RoadRiverGeometry {
  readonly segments: readonly RoadRiverSegment[];
  readonly buckets: ReadonlyMap<string, readonly number[]>;
}

function compileRoadRiverGeometry(curves: readonly SeedWorldRiverCurve[]): RoadRiverGeometry {
  const segments: RoadRiverSegment[] = [];
  for (const curve of curves) {
    const samples = sampleSeedWorldRiverCurve(curve, PLAN_SIZE_METRES, 6);
    for (let index = 1; index < samples.length; index++) {
      const start = samples[index - 1];
      const end = samples[index];
      segments.push({
        startX: start.x,
        startZ: start.z,
        endX: end.x,
        endZ: end.z,
        startWidthMetres: start.widthMetres,
        endWidthMetres: end.widthMetres,
        startBankFeatherMetres: start.bankFeatherMetres,
        endBankFeatherMetres: end.bankFeatherMetres
      });
    }
  }
  const mutableBuckets = new Map<string, number[]>();
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const expansion = Math.max(
      seedWorldRiverBankRadius(segment.startWidthMetres, segment.startBankFeatherMetres),
      seedWorldRiverBankRadius(segment.endWidthMetres, segment.endBankFeatherMetres)
    );
    const minimumX = Math.floor((Math.min(segment.startX, segment.endX) - expansion) / 128);
    const maximumX = Math.floor((Math.max(segment.startX, segment.endX) + expansion) / 128);
    const minimumZ = Math.floor((Math.min(segment.startZ, segment.endZ) - expansion) / 128);
    const maximumZ = Math.floor((Math.max(segment.startZ, segment.endZ) + expansion) / 128);
    for (let z = minimumZ; z <= maximumZ; z++) {
      for (let x = minimumX; x <= maximumX; x++) {
        const key = `${x}:${z}`;
        const bucket = mutableBuckets.get(key);
        if (bucket) bucket.push(index);
        else mutableBuckets.set(key, [index]);
      }
    }
  }
  return Object.freeze({
    segments: Object.freeze(segments),
    buckets: new Map(Array.from(mutableBuckets, ([key, indexes]) => [key, Object.freeze(indexes)]))
  });
}

function roadStepHasExactCoastClearance(start: SeedWorldPoint, end: SeedWorldPoint, geology: GeologyResult): boolean {
  const steps = Math.max(
    1,
    Math.ceil((pointDistance(start, end) * PLAN_SIZE_METRES) / ROAD_CONTINUOUS_CONSTRAINT_SAMPLE_SPACING_METRES)
  );
  const directionX = end.x - start.x;
  const directionY = end.y - start.y;
  const directionLength = Math.hypot(directionX, directionY);
  const lateralX =
    directionLength > 0 ? (-directionY / directionLength / PLAN_SIZE_METRES) * SEED_WORLD_ROAD_HALF_WIDTH_METRES : 0;
  const lateralY =
    directionLength > 0 ? (directionX / directionLength / PLAN_SIZE_METRES) * SEED_WORLD_ROAD_HALF_WIDTH_METRES : 0;
  for (let step = 1; step <= steps; step++) {
    const progress = step / steps;
    const point = { x: mix(start.x, end.x, progress), y: mix(start.y, end.y, progress) };
    const samples = [
      point,
      { x: point.x + lateralX, y: point.y + lateralY },
      { x: point.x - lateralX, y: point.y - lateralY }
    ];
    for (const sample of samples) {
      if (sampleSeedWorldCoastSignedFieldMetres(geology.coastShape, sample) <= 0) return false;
    }
  }
  return true;
}

function sampleRoadNaturalWetlandInfluence(
  point: SeedWorldPoint,
  _terrainIntent: Pick<SeedWorldPlan, "sizeMetres" | "coastShape" | "spawnReserve" | "mountainRidges">,
  _moisture: Float32Array,
  _slope: Float32Array,
  _resolution: number,
  riverGeometry: RoadRiverGeometry
): number {
  const bankDistanceMetres = sampleRoadRiverSignedDistanceMetres(
    riverGeometry,
    point,
    (widthMetres) => widthMetres * 0.5 + SEED_WORLD_WETLAND_BANK_EXPANSION_METRES
  );
  const bankFeatherMetres = sampleRoadRiverAttributeMetres(riverGeometry, point, (segment, progress) =>
    mix(segment.startBankFeatherMetres, segment.endBankFeatherMetres, progress)
  );
  if (bankDistanceMetres >= bankFeatherMetres) return 0;
  return sampleSeedWorldWetlandInfluence(bankDistanceMetres, bankFeatherMetres);
}

function roadStepGrade(
  startCell: number,
  endCell: number,
  naturalHeightMetres: Float32Array,
  naturalHeightResolution: number
): number {
  const start = cellPoint(startCell, PLAN_RESOLUTION);
  const end = cellPoint(endCell, PLAN_RESOLUTION);
  const run = pointDistance(start, end) * PLAN_SIZE_METRES;
  if (run <= Number.EPSILON) return 0;
  return (
    Math.abs(
      bilinearSample(naturalHeightMetres, end.x, end.y, naturalHeightResolution) -
        bilinearSample(naturalHeightMetres, start.x, start.y, naturalHeightResolution)
    ) / run
  );
}

function roadCellHeight(cell: number, naturalHeightMetres: Float32Array, naturalHeightResolution: number): number {
  const point = cellPoint(cell, PLAN_RESOLUTION);
  return bilinearSample(naturalHeightMetres, point.x, point.y, naturalHeightResolution);
}

function sampleRoadRiverWaterSignedDistanceMetres(geometry: RoadRiverGeometry, point: SeedWorldPoint): number {
  return sampleRoadRiverSignedDistanceMetres(geometry, point, (widthMetres) => widthMetres * 0.5);
}

function sampleRoadRiverSignedDistanceMetres(
  geometry: RoadRiverGeometry,
  point: SeedWorldPoint,
  radius: (widthMetres: number) => number
): number {
  const worldX = point.x * PLAN_SIZE_METRES - PLAN_SIZE_METRES * 0.5;
  const worldZ = point.y * PLAN_SIZE_METRES - PLAN_SIZE_METRES * 0.5;
  let nearest = Number.POSITIVE_INFINITY;
  const bucket = geometry.buckets.get(`${Math.floor(worldX / 128)}:${Math.floor(worldZ / 128)}`) ?? [];
  for (const index of bucket) {
    const segment = geometry.segments[index];
    const projection = pointToWorldSegment(worldX, worldZ, segment);
    const width = mix(segment.startWidthMetres, segment.endWidthMetres, projection.progress);
    nearest = Math.min(nearest, projection.distance - radius(width));
  }
  return nearest;
}

function sampleRoadRiverAttributeMetres(
  geometry: RoadRiverGeometry,
  point: SeedWorldPoint,
  sample: (segment: RoadRiverSegment, progress: number) => number
): number {
  const worldX = point.x * PLAN_SIZE_METRES - PLAN_SIZE_METRES * 0.5;
  const worldZ = point.y * PLAN_SIZE_METRES - PLAN_SIZE_METRES * 0.5;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let value = 0;
  const bucket = geometry.buckets.get(`${Math.floor(worldX / 128)}:${Math.floor(worldZ / 128)}`) ?? [];
  for (const index of bucket) {
    const segment = geometry.segments[index];
    const projection = pointToWorldSegment(worldX, worldZ, segment);
    if (projection.distance >= nearestDistance) continue;
    nearestDistance = projection.distance;
    value = sample(segment, projection.progress);
  }
  return value;
}

function pointToWorldSegment(
  worldX: number,
  worldZ: number,
  segment: RoadRiverSegment
): { readonly distance: number; readonly progress: number } {
  const directionX = segment.endX - segment.startX;
  const directionZ = segment.endZ - segment.startZ;
  const lengthSquared = directionX * directionX + directionZ * directionZ;
  const progress =
    lengthSquared > 0
      ? clamp(((worldX - segment.startX) * directionX + (worldZ - segment.startZ) * directionZ) / lengthSquared, 0, 1)
      : 0;
  return {
    distance: Math.hypot(
      worldX - mix(segment.startX, segment.endX, progress),
      worldZ - mix(segment.startZ, segment.endZ, progress)
    ),
    progress
  };
}

function compileRoadBridgeIntervals(
  points: readonly SeedWorldPoint[],
  riverGeometry: RoadRiverGeometry,
  terrainIntent: Pick<SeedWorldPlan, "sizeMetres" | "coastShape" | "spawnReserve" | "mountainRidges">,
  moisture: Float32Array,
  slope: Float32Array,
  resolution: number
): readonly SeedWorldRoadBridgeInterval[] {
  const samples = sampleRoadPolyline(points, ROAD_EXACT_SAMPLE_SPACING_METRES);
  const intervals: SeedWorldRoadBridgeInterval[] = [];
  let wetlandStart = -1;
  let lastWetland = -1;
  let waterStart = -1;
  let lastWater = -1;
  for (const sample of samples) {
    const wetland =
      sampleRoadNaturalWetlandInfluence(sample.point, terrainIntent, moisture, slope, resolution, riverGeometry) >=
      ROAD_MAXIMUM_WETLAND_INFLUENCE;
    const water = sampleRoadRiverWaterSignedDistanceMetres(riverGeometry, sample.point) <= 0;
    if (wetland || water) {
      if (wetlandStart < 0) wetlandStart = sample.arcMetres;
      lastWetland = sample.arcMetres;
      if (!water) continue;
      if (waterStart < 0) waterStart = sample.arcMetres;
      lastWater = sample.arcMetres;
      continue;
    }
    if (waterStart >= 0) {
      intervals.push(
        Object.freeze({
          startArcMetres: Math.max(0, wetlandStart - BRIDGE_DRY_ABUTMENT_METRES),
          endArcMetres: Math.min(samples.at(-1)?.arcMetres ?? lastWetland, lastWetland + BRIDGE_DRY_ABUTMENT_METRES),
          waterStartArcMetres: waterStart,
          waterEndArcMetres: lastWater
        })
      );
    }
    wetlandStart = -1;
    lastWetland = -1;
    waterStart = -1;
    lastWater = -1;
  }
  if (waterStart >= 0) {
    intervals.push(
      Object.freeze({
        startArcMetres: Math.max(0, wetlandStart - BRIDGE_DRY_ABUTMENT_METRES),
        endArcMetres: samples.at(-1)?.arcMetres ?? lastWater,
        waterStartArcMetres: waterStart,
        waterEndArcMetres: lastWater
      })
    );
  }
  return Object.freeze(intervals);
}

function sampleRoadPolyline(
  points: readonly SeedWorldPoint[],
  spacingMetres: number
): readonly Readonly<{ point: SeedWorldPoint; arcMetres: number }>[] {
  const result: Array<Readonly<{ point: SeedWorldPoint; arcMetres: number }>> = [];
  let arcMetres = 0;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const length = pointDistance(start, end) * PLAN_SIZE_METRES;
    const steps = Math.max(1, Math.ceil(length / spacingMetres));
    for (let step = index === 1 ? 0 : 1; step <= steps; step++) {
      const progress = step / steps;
      if (step > (index === 1 ? 0 : 1)) arcMetres += length / steps;
      else if (index > 1) arcMetres += length / steps;
      result.push({ point: { x: mix(start.x, end.x, progress), y: mix(start.y, end.y, progress) }, arcMetres });
    }
  }
  return Object.freeze(result);
}

function calculateTerrainDerivatives(
  height: Float32Array,
  slope: Float32Array,
  curvature: Float32Array,
  resolution: number
): void {
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const index = y * resolution + x;
      const left = height[y * resolution + Math.max(0, x - 1)];
      const right = height[y * resolution + Math.min(resolution - 1, x + 1)];
      const top = height[Math.max(0, y - 1) * resolution + x];
      const bottom = height[Math.min(resolution - 1, y + 1) * resolution + x];
      slope[index] = clamp01(Math.hypot(right - left, bottom - top) * resolution * 0.12);
      curvature[index] = clamp((left + right + top + bottom - height[index] * 4) * resolution * 0.5, -1, 1);
    }
  }
}

function distanceFromMask(mask: Uint8Array, resolution: number): Uint16Array {
  const distance = new Uint16Array(mask.length);
  distance.fill(0xffff);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] === 0) continue;
    distance[index] = 0;
    queue[tail++] = index;
  }
  while (head < tail) {
    const current = queue[head++];
    const x = current % resolution;
    const y = Math.floor(current / resolution);
    for (const [offsetX, offsetY] of NEIGHBORS) {
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= resolution || nextY >= resolution) continue;
      const index = nextY * resolution + nextX;
      if (distance[index] <= distance[current] + 1) continue;
      distance[index] = distance[current] + 1;
      queue[tail++] = index;
    }
  }
  return distance;
}

function paintMaskDisk(mask: Uint8Array, center: number, resolution: number, radius: number): void {
  const centerX = center % resolution;
  const centerY = Math.floor(center / resolution);
  for (let offsetY = -radius; offsetY <= radius; offsetY++) {
    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
      const x = centerX + offsetX;
      const y = centerY + offsetY;
      if (x < 0 || y < 0 || x >= resolution || y >= resolution) continue;
      mask[y * resolution + x] = 1;
    }
  }
}

function normalizeField(field: Float32Array): void {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of field) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const range = maximum - minimum || 1;
  for (let index = 0; index < field.length; index++) field[index] = (field[index] - minimum) / range;
}

function bilinearSample(field: Float32Array, normalizedX: number, normalizedY: number, resolution: number): number {
  const x = clamp(normalizedX, 0, 1) * (resolution - 1);
  const y = clamp(normalizedY, 0, 1) * (resolution - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const y1 = Math.min(resolution - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const top = mix(field[y0 * resolution + x0], field[y0 * resolution + x1], tx);
  const bottom = mix(field[y1 * resolution + x0], field[y1 * resolution + x1], tx);
  return mix(top, bottom, ty);
}

function normalizedPointIndex(point: SeedWorldPoint, resolution: number): number {
  const x = Math.round(clamp(point.x, 0, 1) * (resolution - 1));
  const y = Math.round(clamp(point.y, 0, 1) * (resolution - 1));
  return y * resolution + x;
}

function cellPoint(index: number, resolution: number): SeedWorldPoint {
  return { x: (index % resolution) / (resolution - 1), y: Math.floor(index / resolution) / (resolution - 1) };
}

function pointDistance(left: SeedWorldPoint, right: SeedWorldPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

/** Unpacks the debug-visible causal codes from a full Root Seed. */
export function unpackSeedWorldRoot(rootSeed: number): SeedWorldStageCodes {
  assertUnsignedSeed(rootSeed, "Root Seed");
  let remaining = rootSeed >>> 0;
  const codes = {} as Record<SeedWorldStage, number>;
  for (const stage of SeedWorldStages) {
    const width = SeedWorldStageBitWidths[stage];
    const mask = (1 << width) - 1;
    codes[stage] = remaining & mask;
    remaining >>>= width;
  }
  return codes as SeedWorldStageCodes;
}

/** Packs debug-visible causal codes into the only persisted Root Seed value. */
export function packSeedWorldRoot(codes: SeedWorldStageCodes): number {
  let rootSeed = 0;
  let shift = 0;
  for (const stage of SeedWorldStages) {
    const width = SeedWorldStageBitWidths[stage];
    const mask = (1 << width) - 1;
    const value = codes[stage];
    if (!Number.isInteger(value) || value < 0 || value > mask) {
      throw new RangeError(`Seed World Planner ${stage} code must fit ${width} bits`);
    }
    rootSeed |= value << shift;
    shift += width;
  }
  return rootSeed >>> 0;
}

/**
 * Replaces one debug code while retaining the rest of the persisted Root Seed.
 * Downstream streams still change because they consume every causal code before them.
 * @param rootSeed Existing complete world identity.
 * @param stage Causal stage to replace.
 * @param code New value constrained by the stage bit width.
 * @returns New packed Root Seed.
 */
export function withSeedWorldStageCode(rootSeed: number, stage: SeedWorldStage, code: number): number {
  assertUnsignedSeed(rootSeed, "Root Seed");
  const codes = unpackSeedWorldRoot(rootSeed) as Record<SeedWorldStage, number>;
  const width = SeedWorldStageBitWidths[stage];
  const mask = (1 << width) - 1;
  if (!Number.isInteger(code) || code < 0 || code > mask) {
    throw new RangeError(`Seed World Planner ${stage} code must fit ${width} bits`);
  }
  codes[stage] = code;
  return packSeedWorldRoot(codes as SeedWorldStageCodes);
}

function resolveStageSeeds(request: SeedWorldPlanRequest): SeedWorldStageSeeds {
  return deriveStageSeeds(request.rootSeed);
}

function deriveGenerationStreams(stageSeeds: SeedWorldStageSeeds): SeedWorldGenerationStreams {
  return Object.freeze({
    terrain: deriveSeedWorldNamedSeed(stageSeeds.geology, "terrain"),
    decor: deriveSeedWorldNamedSeed(stageSeeds.detail, "decor"),
    vegetation: deriveSeedWorldNamedSeed(stageSeeds.ecology, "vegetation")
  });
}

function createFeatureDecorationRules(decorSeed: number): readonly SeedWorldFeatureDecorationRule[] {
  const mountain = new RandomStream(deriveSeedWorldNamedSeed(decorSeed, "rocks:mountain"));
  const riverbank = new RandomStream(deriveSeedWorldNamedSeed(decorSeed, "rocks:riverbank"));
  const river = new RandomStream(deriveSeedWorldNamedSeed(decorSeed, "rocks:river"));
  const lakeOutcrop = new RandomStream(deriveSeedWorldNamedSeed(decorSeed, "rocks:lake-outcrop"));
  const roadside = new RandomStream(deriveSeedWorldNamedSeed(decorSeed, "rocks:roadside"));
  const stoneMountain = new RandomStream(deriveSeedWorldNamedSeed(decorSeed, "stones:mountain"));
  const stoneRiverbank = new RandomStream(deriveSeedWorldNamedSeed(decorSeed, "stones:riverbank"));
  const stoneRiver = new RandomStream(deriveSeedWorldNamedSeed(decorSeed, "stones:river"));
  const stoneLakeOutcrop = new RandomStream(deriveSeedWorldNamedSeed(decorSeed, "stones:lake-outcrop"));
  const stoneRoadside = new RandomStream(deriveSeedWorldNamedSeed(decorSeed, "stones:roadside"));
  const mushroom = new RandomStream(deriveSeedWorldNamedSeed(decorSeed, "mushrooms:rock-edge"));
  return Object.freeze([
    Object.freeze({
      id: "rocks-mountain",
      category: "rock" as const,
      sourceKind: "mountain" as const,
      profileKey: "cliff-rock" as const,
      clustersPerFeature: countRange(1, mountain.integer(2, 4)),
      piecesPerCluster: countRange(2, mountain.integer(5, 9)),
      spacingMetres: mountain.range(24, 42),
      lateralJitterMetres: mountain.range(8, 18),
      mountainProfileBand: Object.freeze([0.02, 1] as const),
      maximumSlopeDegrees: 10
    }),
    Object.freeze({
      id: "rocks-riverbank",
      category: "rock" as const,
      sourceKind: "riverbank" as const,
      profileKey: "cliff-rock" as const,
      clustersPerFeature: countRange(15, riverbank.integer(21, 33)),
      piecesPerCluster: countRange(1, riverbank.integer(1, 3)),
      spacingMetres: riverbank.range(38, 64),
      lateralJitterMetres: riverbank.range(3, 8),
      sizeMultiplierRange: Object.freeze([0.4, 0.8] as const),
      visibleHeightRatio: 0.18,
      riverBankOffsetMetres: Object.freeze([riverbank.range(1, 2.5), riverbank.range(6, 11)] as const)
    }),
    Object.freeze({
      id: "rocks-river",
      category: "rock" as const,
      sourceKind: "river" as const,
      profileKey: "cliff-rock" as const,
      clustersPerFeature: countRange(6, river.integer(9, 18)),
      piecesPerCluster: countRange(1, river.integer(1, 2)),
      spacingMetres: river.range(44, 72),
      lateralJitterMetres: river.range(1.5, 4),
      riverChannelOffsetRatio: Object.freeze([river.range(0.08, 0.2), river.range(0.45, 0.72)] as const)
    }),
    Object.freeze({
      id: "rocks-lake-outcrop",
      category: "rock" as const,
      sourceKind: "lake-outcrop" as const,
      profileKey: "cliff-rock" as const,
      clustersPerFeature: countRange(1, 4),
      piecesPerCluster: countRange(1, 1),
      spacingMetres: lakeOutcrop.range(18, 24),
      lateralJitterMetres: lakeOutcrop.range(2, 5),
      sizeMultiplierRange: Object.freeze([1.08, 1.14] as const),
      lakeInteriorDistanceMetres: Object.freeze([20, lakeOutcrop.range(42, 64)] as const),
      minimumWaterAreaSquareMetres: lakeOutcrop.range(2_400, 4_800),
      lakeOutcropAreaPerClusterSquareMetres: 50_000,
      maximumWaterDepthMetres: lakeOutcrop.range(10, 14),
      visibleHeightRatio: 0.26
    }),
    Object.freeze({
      id: "rocks-roadside",
      category: "rock" as const,
      sourceKind: "roadside" as const,
      profileKey: "cliff-rock" as const,
      clustersPerFeature: countRange(3, roadside.integer(5, 9)),
      piecesPerCluster: countRange(1, roadside.integer(2, 4)),
      spacingMetres: roadside.range(68, 104),
      lateralJitterMetres: roadside.range(4, 11),
      roadsideOffsetMetres: Object.freeze([roadside.range(0.1, 0.8), roadside.range(2, 5)] as const)
    }),
    createStoneDecorationRule(stoneMountain, "mountain", 0.9, [5, 10], [1.5, 10], 24),
    createStoneDecorationRule(stoneRiverbank, "riverbank", 1, [8, 18], [0.35, 8], 90),
    createStoneDecorationRule(stoneRiver, "river", 1, [5, 10], [0.35, 4], 14),
    createLakeOutcropStoneDecorationRule(stoneLakeOutcrop),
    createStoneDecorationRule(stoneRoadside, "roadside", 1, [5, 12], [0.35, 5], 20),
    Object.freeze({
      id: "mushrooms-rock-edge",
      category: "mushroom" as const,
      sourceKind: "rock-edge" as const,
      profileKey: "mushroom" as const,
      parentCoverage: mushroom.range(0.22, 0.38),
      piecesPerCluster: countRange(2, mushroom.integer(4, 7)),
      edgeOffsetMetres: Object.freeze([mushroom.range(0.08, 0.14), mushroom.range(0.24, 0.48)] as const),
      minimumMoisture: mushroom.range(0.28, 0.4),
      maximumSlope: 0.42
    })
  ]);
}

function createStoneDecorationRule(
  random: RandomStream,
  sourceKind: SeedWorldStoneDecorationRule["sourceKind"],
  parentCoverage: number,
  piecesPerParent: readonly [minimum: number, maximum: number],
  radialOffsetMetres: readonly [minimum: number, maximum: number],
  maximumSlopeDegrees: number
): SeedWorldStoneDecorationRule {
  return Object.freeze({
    id: `debris-${sourceKind}`,
    category: "debris",
    sourceKind,
    profileKeys: Object.freeze(["feature-stone", "small-stone"] as const),
    parentCoverage: Math.min(1, Math.max(0, parentCoverage + random.range(-0.05, 0.05))),
    piecesPerParent: countRange(piecesPerParent[0], random.integer(piecesPerParent[0], piecesPerParent[1])),
    radialOffsetMetres: Object.freeze([
      radialOffsetMetres[0],
      random.range(Math.max(radialOffsetMetres[0], radialOffsetMetres[1] * 0.82), radialOffsetMetres[1])
    ] as const),
    maximumSlopeDegrees
  });
}

function createLakeOutcropStoneDecorationRule(random: RandomStream): SeedWorldStoneDecorationRule {
  return Object.freeze({
    id: "debris-lake-outcrop",
    category: "debris",
    sourceKind: "lake-outcrop",
    profileKeys: Object.freeze(["feature-stone"] as const),
    parentCoverage: 1,
    piecesPerParent: countRange(9, random.integer(11, 14)),
    radialOffsetMetres: Object.freeze([0.15, random.range(4, 6.5)] as const),
    parentSupportRadiusRatio: 1,
    maximumSlopeDegrees: 24,
    sizeMultiplierRange: Object.freeze([6, 8] as const)
  });
}

function createVegetationRules(vegetationSeed: number): readonly SeedWorldVegetationRule[] {
  return Object.freeze([
    createVegetationRule(vegetationSeed, "tree", 0.0024, 48, 180, 0.72, 0.42, 1, 0.32, [0.05, 0.95], 1),
    createVegetationRule(vegetationSeed, "shrub", 0.000075, 8, 92, 0.66, 0.4, 1, 1, [0.58, 0.95], 1),
    createVegetationRule(vegetationSeed, "flower", 0.028, 128, 54, 0.74, 0.28, 1, 1, [0.5, 0.92], 1),
    createVegetationRule(vegetationSeed, "grass", 0.32, 1_536, 38, 0.42, 0.6, 1, 1, [0.05, 0.95], 1)
  ]);
}

function createVegetationOperations(vegetationSeed: number): Readonly<{
  treeScatterOperations: readonly SeedWorldTreeScatterOperation[];
  detailBrushOperations: readonly SeedWorldDetailBrushOperation[];
}> {
  const createTreeScatterOperation = (
    category: "tree" | "shrub",
    densityRange: readonly [number, number],
    heightRange: readonly [number, number]
  ): SeedWorldTreeScatterOperation => {
    const id = `${category}-habitat-brush`;
    const seed = deriveSeedWorldNamedSeed(vegetationSeed, `tree-scatter:${id}`);
    const random = new RandomStream(seed);
    return Object.freeze({
      id,
      category,
      prototypeFamily: category,
      distribution: "habitat-fill",
      densityPerSquareMetre: random.range(densityRange[0], densityRange[1]),
      minimumHeightMetres: heightRange[0],
      maximumHeightMetres: heightRange[1],
      lockWidthToHeight: true,
      randomRotation: true,
      colorVariation: random.range(0.2, 0.55),
      seed
    });
  };
  const maximumTreeDensityMultiplier = Math.max(
    1,
    ...SEED_WORLD_TREE_SPECIES_PROFILES.map((profile) => profile.densityMultiplier)
  );
  const treeScatterOperations = Object.freeze([
    createTreeScatterOperation(
      "tree",
      [0.0032 * maximumTreeDensityMultiplier, 0.004 * maximumTreeDensityMultiplier],
      [5.2, 10.5]
    ),
    createTreeScatterOperation("shrub", [0.00006, 0.00008], [1.1, 2.8])
  ]);

  const createDetailBrushOperation = (
    profile: (typeof SEED_WORLD_DETAIL_SPECIES_PROFILES)[number]
  ): SeedWorldDetailBrushOperation => {
    const { category, key: prototypeFamily, targetDensityPerSquareMetre } = profile;
    const id = `${prototypeFamily}-habitat-brush`;
    const seed = deriveSeedWorldNamedSeed(vegetationSeed, `detail-brush:${id}`);
    return Object.freeze({
      id,
      category,
      brushMaskKey: "hard-circle",
      prototypeFamily,
      distribution: "habitat-fill",
      opacity: 1,
      targetDensityPerSquareMetre,
      seed
    });
  };
  const detailBrushOperations = Object.freeze(
    SEED_WORLD_DETAIL_SPECIES_PROFILES.filter((profile) => profile.habitat === "terrestrial").map(
      createDetailBrushOperation
    )
  );
  return Object.freeze({
    treeScatterOperations,
    detailBrushOperations
  });
}

function createVegetationRule(
  vegetationSeed: number,
  category: SeedWorldVegetationRule["category"],
  baseDensity: number,
  candidatesPerCell: number,
  baseWavelengthMetres: number,
  baseContrast: number,
  minimumQualifiedDensity: number,
  forestWeight: number,
  grasslandWeight: number,
  moistureRange: readonly [number, number],
  maximumSlope: number
): SeedWorldVegetationRule {
  const random = new RandomStream(deriveSeedWorldNamedSeed(vegetationSeed, `vegetation:${category}`));
  return Object.freeze({
    category,
    profileKey: category,
    targetDensityPerSquareMetre: baseDensity * random.range(0.88, 1.12),
    minimumQualifiedDensity,
    candidatesPerCell,
    clusterWavelengthMetres: baseWavelengthMetres * random.range(0.82, 1.18),
    clusterContrast: baseContrast * random.range(0.88, 1.12),
    forestWeight,
    grasslandWeight,
    moistureRange: Object.freeze(moistureRange),
    maximumSlope
  });
}

function countRange(minimum: number, maximum: number): SeedWorldCountRange {
  return Object.freeze({ minimum, maximum });
}

function deriveStageSeeds(rootSeed: number): SeedWorldStageSeeds {
  const codes = unpackSeedWorldRoot(rootSeed);
  const salts = [0x6b3a_2f91, 0x8d12_c7e5, 0xb731_5d23, 0x45f0_19ab, 0x1ec9_a407] as const;
  const streams = {} as Record<SeedWorldStage, number>;
  let prefix = 0x51ed_270b;
  for (let index = 0; index < SeedWorldStages.length; index++) {
    const stage = SeedWorldStages[index];
    prefix = avalanche32(prefix ^ Math.imul(codes[stage] + 1, salts[index]));
    streams[stage] = prefix;
  }
  return streams as SeedWorldStageSeeds;
}

/**
 * Derives one order-independent category stream from an existing full-width Seed.
 * @param seed Parent stream derived from the persisted Root Seed.
 * @param namespace Stable category name such as `rocks` or `flowers`.
 * @returns Unsigned 32-bit named stream unaffected by other category additions.
 * @throws {RangeError} When `seed` is not an unsigned 32-bit integer.
 */
export function deriveSeedWorldNamedSeed(seed: number, namespace: string): number {
  assertUnsignedSeed(seed, "named stream parent");
  let hash = (0x811c_9dc5 ^ seed) >>> 0;
  for (let index = 0; index < namespace.length; index++) {
    hash = Math.imul(hash ^ namespace.charCodeAt(index), 0x0100_0193) >>> 0;
  }
  return avalanche32(hash);
}

function normalizeCopy(field: Float32Array): Float32Array {
  let maximum = 0;
  for (const value of field) maximum = Math.max(maximum, value);
  const normalized = new Float32Array(field.length);
  if (maximum <= 0) return normalized;
  for (let index = 0; index < field.length; index++) normalized[index] = field[index] / maximum;
  return normalized;
}

function assertUnsignedSeed(seed: number, label: string): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError(`Seed World Planner ${label} must be an unsigned 32-bit integer`);
  }
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = quintic(x - x0);
  const ty = quintic(y - y0);
  const top = mix(latticeNoise(x0, y0, seed), latticeNoise(x0 + 1, y0, seed), tx);
  const bottom = mix(latticeNoise(x0, y0 + 1, seed), latticeNoise(x0 + 1, y0 + 1, seed), tx);
  return mix(top, bottom, ty);
}

function latticeNoise(x: number, y: number, seed: number): number {
  return avalanche32((Math.imul(x, 0x1f12_3bb5) ^ Math.imul(y, 0x5f35_6495) ^ seed) >>> 0) / 0xffff_ffff;
}

function unitHash(value: number, seed: number): number {
  return avalanche32((Math.imul(value, 0x9e37_79b1) ^ seed) >>> 0) / 0xffff_ffff;
}

function avalanche32(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function quintic(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function smoothMaximumMetres(left: number, right: number, radiusMetres: number): number {
  if (left <= 0) return right;
  if (right <= 0) return left;
  if (radiusMetres <= 0) return Math.max(left, right);
  const blend = clamp01(0.5 + (left - right) / (2 * radiusMetres));
  return mix(right, left, blend) + radiusMetres * blend * (1 - blend);
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const normalized = clamp01((value - minimum) / (maximum - minimum));
  return normalized * normalized * (3 - 2 * normalized);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

class RandomStream {
  private _state: number;

  constructor(seed: number) {
    this._state = seed || 0x6d2b_79f5;
  }

  next(): number {
    this._state = (this._state + 0x6d2b_79f5) >>> 0;
    let value = this._state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  }

  range(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.next();
  }

  integer(minimum: number, maximumExclusive: number): number {
    return minimum + Math.floor(this.next() * (maximumExclusive - minimum));
  }
}

class MinHeap {
  private readonly _entries: HeapEntry[] = [];

  get size(): number {
    return this._entries.length;
  }

  push(entry: HeapEntry): void {
    const entries = this._entries;
    entries.push(entry);
    let index = entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (entries[parent].priority <= entry.priority) break;
      entries[index] = entries[parent];
      index = parent;
    }
    entries[index] = entry;
  }

  pop(): HeapEntry | undefined {
    const entries = this._entries;
    const root = entries[0];
    const tail = entries.pop();
    if (!tail || entries.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= entries.length) break;
      const right = left + 1;
      const child = right < entries.length && entries[right].priority < entries[left].priority ? right : left;
      if (entries[child].priority >= tail.priority) break;
      entries[index] = entries[child];
      index = child;
    }
    entries[index] = tail;
    return root;
  }
}
