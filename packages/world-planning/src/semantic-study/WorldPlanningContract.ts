import type { PoiLayoutConfig } from "./PoiDistribution";
import { PLANNING_REFERENCE } from "../planning-data/PlanningReference";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
/** A semantic instance owns its geometry and edits, independently of display layers. */
export interface PlanningModule {
  /** Derived candidate may be absent until its spatial conditions exist. */ optional?: boolean;
  ownerId?: string;
  memberIds?: string[];
  outlines?: PlanPoint[][];
  id: string;
  kind:
    | "land"
    | "island"
    | "mountain"
    | "valley"
    | "water"
    | "village"
    | "routes"
    | "visual"
    | "spawn"
    | "teleport"
    | "open"
    | "landscape";
  outline: PlanPoint[];
  dependencies: string[];
  requested: Record<string, number>;
  resolved: Record<string, number>;
}
/** Shared endpoints carry absolute heights; linked geometry must use the same values. */
export interface PlanningPort {
  destinationAreaId?: string;
  roadAccess?: { required: boolean; poiId?: string; heading?: PlanPoint; preferredWidthM?: number };
  id: string;
  ownerId: string;
  position: PlanPoint;
  height: number;
  width: number;
  kind: "entrance" | "water" | "landing" | "summit";
  surfaceId?: string;
}
/** Physical reservations are distinguished from organization and influence areas. */
export interface PlanningReservation {
  id: string;
  ownerId: string;
  kind: "corridor" | "activity" | "bank" | "valley" | "visual" | "open" | "landscape";
  outline: PlanPoint[];
  relatedIds: string[];
}
/** Explicit cross-module relation, independent of rendering. */
export interface PlanningRelation {
  id: string;
  kind: "contains" | "connects" | "flows" | "supports" | "observes" | "frames";
  owners: string[];
  ports: string[];
  required: boolean;
  network?: "planned" | "supported";
}
/** Height data for the 2D planning surface, not a runtime collision claim. */
export interface PlanningProfile {
  id: string;
  ownerId: string;
  kind: "water" | "bed" | "route" | "ground";
  points: (PlanPoint & { y: number })[];
  width: number;
  supportIds: string[];
}
/** Independent evidence includes location and cannot omit required checks silently. */
export interface PlanningCheck {
  id: string;
  rule: string;
  owners: string[];
  status: "pass" | "fail" | "unknown";
  required: boolean;
  message: string;
  position?: PlanPoint;
  measured?: number;
  limit?: number;
}
/** A resolved change records what actually happened instead of changing requested sliders. */
export interface PlanningAdjustment {
  owners: string[];
  reason: string;
  requested?: number;
  resolved?: number;
}
/** Serializable planning contract shared by generation, validation and views. */
export interface PlanningData {
  version: 2;
  auditMode?: "enabled" | "paused";
  revision: number;
  modules: PlanningModule[];
  ports: PlanningPort[];
  reservations: PlanningReservation[];
  relations: PlanningRelation[];
  profiles: PlanningProfile[];
  checks: PlanningCheck[];
  adjustments: PlanningAdjustment[];
  requiredIds: string[];
  changedIds: string[];
  status: "valid" | "invalid";
  rounds: number;
}
/** Relative authoring controls; counts and physical budgets remain internal. */
export interface SemanticParameters {
  worldTemplate?: { id: string; centerX?: number; centerZ?: number };
  landformSeed?: number;
}
export interface SemanticParameters {
  population?: import("../spatial/PlanningPopulationInitialization").PlanningPopulationOptions;
  farming?: Partial<import("../spatial/farming/PlanningFarmingComponent").PlanningFarmingOptions>;
  suspensionBridge?: import("@galacean/engine-water/bridges/SuspensionBridge").SuspensionBridgeOverrides;
  lakes?: Partial<import("../spatial/hydrology/LakeRegions").LakeParameters>;
  rivers?: Partial<import("../spatial/hydrology/RiverRegions").RiverParameters>;
  terrainSkeleton?: import("../spatial/PlanningCountRange").PlanningCountRange & {
    directionDegrees: number;
    lengthM?: number;
    heightM: number;
    widthM: number;
  };
  buildingPolicy?: Partial<import("../planning-data/BuildingSizing").BuildingPolicy>;
  regionElevation?: Partial<import("../spatial/terrain/PoiRegionElevation").PoiRegionElevationConfig>;
  wayfinding?: Partial<import("../spatial/guidance/WayfindingPolicy").WayfindingPolicy>;
  flowers?: import("../spatial/ecology/FlowerRegions").FlowerInput;
  worldElevation?: import("../spatial/terrain/WorldElevation").WorldElevation;
  terrainPatches?: import("../spatial/terrain/ReliefField").ReliefPatch[];
  poiLayout?: PoiLayoutConfig;
  seed: number;
  crossingDetourRatio: number;
  elevation: number;
  landAspect: number;
  landOrientation: number;
  landCoverage: number;
  offshoreCoverage: number;
  complexity: number;
  islandRichness: number;
  terrainRichness: number;
  waterRichness: number;
  villageRichness: number;
  openness: number;
  routeLoops: number;
}
/** Instance controls are only presented for the selected module. */
export interface SemanticEdit {
  suspensionBridge?: import("@galacean/engine-water/bridges/SuspensionBridge").SuspensionBridgeOverrides;
  lakes?: Partial<import("../spatial/hydrology/LakeRegions").LakeParameters>;
  rivers?: Partial<import("../spatial/hydrology/RiverRegions").RiverParameters>;
  buildingCount?: number;
  floorAreaRatio?: number;
  buildingPolicy?: Partial<import("../planning-data/BuildingSizing").BuildingPolicy>;
  buildingSize?: import("../planning-data/BuildingSizing").BuildingSizeEdit;
  landscapeInfluence?: Partial<import("../spatial/ecology/LandscapeInfluences").LandscapeInfluence>;
  regionElevation?: import("../spatial/terrain/PoiRegionElevation").PoiRegionElevationEdit;
  wayfinding?: Partial<import("../spatial/guidance/WayfindingPolicy").WayfindingPolicy>;
  flowerInfluence?: Partial<import("../spatial/ecology/FlowerInfluences").FlowerInfluence>;
  flowers?: import("../spatial/ecology/FlowerRegions").FlowerInput;
  poi?: { radiusM?: number; sizeWeight?: number };
  road?: { widthM?: number; bend?: number; keypoints?: { id: string; x: number; z: number }[] };
  landscape?: import("./ParameterScopes").ParameterPatch<import("./ContextLandscape").LandscapeConfig>;
  canyon?: Partial<import("./PoiCanyon").CanyonConfig>;
  transform?: { offsetX?: number; offsetZ?: number; rotationDegrees?: number; scale?: number };
  lengthM?: number;
  heightM?: number;
  yawDegrees?: number;
  landformType?: "canyon" | "cliff" | "plateau" | "peaks" | "pass";
  variation?: number;
  variantSeed?: number;
  openness?: number;
  stagger?: number;
  placement?: {
    priority?: number;
    origin: PlanPoint;
    size: number;
    footprints: PlanPoint[][];
    half?: { x: number; z: number };
    end?: PlanPoint;
  };
  crossingDetourRatio?: number;
  complexity?: number;
  size?: number;
  height?: number;
  width?: number;
  widthVariation?: number;
  centerRichness?: number;
  loopiness?: number;
  density?: number;
  bend?: number;
  branches?: number;
  direction?: number;
  locked?: boolean;
}
/** Input recipe persisted independently of the resolved snapshot. */
export interface SemanticRecipe {
  study?: "village" | "settlements";
  version: 2;
  parameters: SemanticParameters;
  edits: Record<string, SemanticEdit>;
}
/** Transaction result preserves the previous valid snapshot on rejected changes. */
export interface SemanticResult {
  waterOverlay?: import("../spatial/hydrology/PlanningWaterOverlay").PlanningWaterOverlayState;
  planningWorkerToken?: { owner: number; generation: number; requestId: number };
  /** A projection over the accepted immutable base; never a new terrain/network solve. */ contentUpdate?:
    | "reveal"
    | "instance";
  waterUpdate?: import("../spatial/hydrology/PlanningWaterEdits").PlanningWaterUpdate;
  waterFallbackReason?: string;
  parameterCorrections?: { entity: string; component: string; values: Record<string, unknown> }[];
  spatialSignature?: string;
  villageDiagnostics?: import("./VillagePlacementDiagnostics").VillagePlacementDiagnostics;
  timings?: Record<string, number>;
  execution?:
    | "water-overlay"
    | "water"
    | "local"
    | "full"
    | "landscape"
    | "guidance"
    | "road-guidance"
    | "presentation"
    | "runtime";
  recipe: SemanticRecipe;
  plan: IslandPlan;
  accepted: boolean;
  checks: PlanningCheck[];
  changedIds: string[];
  notes: string[];
}
/** Stable initial relative controls; URL overrides use these names. */
export const SEMANTIC_DEFAULTS: SemanticParameters = {
  seed: 1,
  crossingDetourRatio: PLANNING_REFERENCE.road.crossingDetourRatio,
  elevation: 0.5,
  landAspect: 0.5,
  landOrientation: 0,
  landCoverage: 0.85,
  offshoreCoverage: 0.2,
  complexity: 1,
  islandRichness: 1,
  terrainRichness: 0.6,
  waterRichness: 0.35,
  villageRichness: 0.45,
  openness: 0,
  routeLoops: 0
};
/** Create a transaction-owned empty contract. */
export function createPlanningData(): PlanningData {
  return {
    version: 2,
    revision: 0,
    modules: [],
    ports: [],
    reservations: [],
    relations: [],
    profiles: [],
    checks: [],
    adjustments: [],
    requiredIds: [],
    changedIds: [],
    status: "invalid",
    rounds: 0
  };
}
