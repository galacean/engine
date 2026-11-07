import type { PoiDistribution } from "./PoiDistribution";
import type { ShapeRecipe } from "./ComposedShape";
import type { V2Box } from "../spatial/V2Model.ts";
/** Metres in the rectangular planning domain; X right, Z down on the map. */
export interface PlanPoint {
  x: number;
  z: number;
}
/** Rock presentation settings do not change generic layout volume semantics. */
export interface PlanRockBox extends V2Box {}
/** A single rock envelope, independently selectable inside a mountain group. */
export interface PlanRock {
  /** Ordinary authored solid, projected independently of generated placement groups. */
  authored?: boolean;
  /** Unedited generated boxes retained for sparse per-OBB reset and incremental replay. */
  rockObbSource?: { boxes: PlanRockBox[]; outline: PlanPoint[]; obb: PlanPoint[] };
  /** Resolved constituent volumes, in world metres; shared by both views. */
  boxes?: PlanRockBox[];
  id: string;
  groupId: string;
  center: PlanPoint;
  width: number;
  depth: number;
  yaw: number;
  baseHeight?: number;
  height: number;
  role: "peak" | "wall" | "shoulder" | "terrace" | "skirt";
  outline: PlanPoint[];
  obb: PlanPoint[];
}
/** A mountain group owns individual rock IDs and a distinct planning boundary. */
export interface PlanMountain {
  semanticKind?: "canyon" | "cliff" | "plateau" | "peaks" | "pass";
  /** Semantic group domain, separate from solid boxes and broad elevation influence. */
  semanticOutlines?: PlanPoint[][];
  roles?: {
    kind: "headwater" | "valley-wall" | "visual-landmark" | "coastal-ridge" | "watershed";
    relatedIds: string[];
    description: string;
  }[];
  /** Dense rock footprint with bounded local margins; excludes distant terrain influence. */
  densityOutlines?: PlanPoint[][];
  /** Continuous ridge, shoulder width and terrain influence boundary; separate from solid occupancy. */
  landform?: {
    ridge: (PlanPoint & { height: number })[];
    width: number;
    outline: PlanPoint[];
    outlines?: PlanPoint[][];
  };
  outlines?: PlanPoint[][];
  id: string;
  label: string;
  outline: PlanPoint[];
  rockIds: string[];
  offshore?: boolean;
}
/** Editable water geometry with explicit upstream and downstream semantics. */
export interface PlanWater {
  course?: import("@galacean/engine-water/water/index").ResolvedWatercourse;
  authorPoints?: import("@galacean/engine-water/water/index").WatercoursePoint[];
  lake?: import("../spatial/hydrology/LakeRegions").PlanningLakeShape;
  flowSpeed?: number;
  bankWidthM?: number;
  bankWidths?: number[];
  /** Owning editable water system. */ systemId?: string;
  id: string;
  label: string;
  kind: "river" | "lake" | "source";
  outline: PlanPoint[];
  centerline?: PlanPoint[];
  widths?: number[];
  from?: string;
  to?: string;
}
/** Physical connection between named places; points include exact bridge crossings. */
/** Authored road cross-section; width is full width in metres. */
export interface RoadKeypoint {
  position: PlanPoint;
  width: number;
  tangent?: PlanPoint;
}
/** Continuous road surface with a separately derived internal navigation graph. */
export interface PlanRoute {
  keypoints?: RoadKeypoint[];
  closed?: boolean;
  navigationLinks?: NonNullable<PlanRegion["navigationLinks"]>;
  caps?: { start: "round" | "butt"; end: "round" | "butt" };
  widths?: number[];
  outline?: PlanPoint[];
  shapeRecipeId?: string;
  maxWidth?: number;
  id: string;
  label: string;
  from: string;
  to: string;
  kind: "main" | "ridge" | "shore";
  points: PlanPoint[];
  width: number;
}
/** A place has area and purpose, independently of a path junction. */
export interface PlanPlace {
  id: string;
  label: string;
  purpose: string;
  center: PlanPoint;
  outline: PlanPoint[];
}
/** A bridge deck is separate from the route that traverses it. */
export interface PlanBridge {
  /** Physical sections in bank-to-bank order. */ roadSectionIds?: string[];
  approach?: import("@galacean/engine-water/bridges/BridgeApproach").CompiledBridgeApproach;
  suspension?: import("@galacean/engine-water/bridges/SuspensionBridge").CompiledSuspensionBridge;
  deckY?: number;
  deckPath?: (PlanPoint & { y: number })[];
  routeId?: string;
  id: string;
  label: string;
  a: PlanPoint;
  b: PlanPoint;
  width: number;
  riverId: string;
}
/** Visual intent is independent of physical connectivity; spread is the fan angle in degrees. */
export interface PlanSight {
  status?: "pass" | "fail" | "unknown";
  eyeHeight?: number;
  targetHeight?: number;
  targetId?: string;
  id: string;
  from: PlanPoint;
  to: PlanPoint;
  spread: number;
  label: string;
}
/** A small set of compositional parameters; no terrain-resolution or asset dependency. */
export interface IslandPlanParameters {
  worldTemplate?: { id: string; centerX?: number; centerZ?: number };
  landformSeed?: number;
  regionElevation?: Partial<import("../spatial/terrain/PoiRegionElevation").PoiRegionElevationConfig>;
  worldElevation?: import("../spatial/terrain/WorldElevation").WorldElevation;
  terrainPatches?: import("../spatial/terrain/ReliefField").ReliefPatch[];
  globalElevation?: number;
  elevationAngle?: number;
  width: number;
  depth: number;
  valleyWidth: number;
  riverWidth: number;
  mountainHeight: number;
  seed: number;
}
export interface IslandPlan {
  worldTemplateSite?: import("../spatial/WorldTemplatePlanning").WorldTemplateSite;
}
/** Authored negative space and paired banks; the same structure drives assembly and relief. */
export interface PlanLandformStructure {
  waterDomain?: { id: string; outline: PlanPoint[]; blocks: import("./ComposedShape").ShapeBlock[] };
  sections?: { label: string; center: PlanPoint; width: number }[];
  id: string;
  kind: "canyon";
  label: string;
  axis: PlanPoint[];
  outlet: PlanPoint;
  outline: PlanPoint[];
  floor: PlanPoint[];
  floorWidth: number;
  bankWidth: number;
  relief: number;
  sourceHeight: number;
  outletHeight: number;
  bankIds: string[];
}
/** Shared semantic plan rendered as vectors; explicitly not a compiled heightmap or navigation mesh. */
export interface IslandPlan {
  /** Derived layer ordering, never a saved geometry snapshot. */
  authoredWaterLayer?: 1;
  farming?: import("../spatial/farming/PlanningFarmingLayout").PlanningFarmLayout;
  /** Author intent forwarded to deterministic population compilation; no renderer state. */
  authoredResources?: import("../spatial/PlanningResources").PlanningResource[];
  roadApproaches?: PlanBridge[];
  roadGraph?: import("../spatial/layout/RoadTopology").RoadGraph;
  spatialLayout?: import("../spatial/layout/SpatialWorld").SpatialLayoutState;
  /** Independent derived guidance layer, never part of baseline ecological density. */
  visualGuidance?: import("../spatial/guidance/VisualGuidance").VisualGuidanceResult[];
  roadNetwork?: import("./GlobalRoadNetwork").RoadNetworkSnapshot;
  /** Shared POI allocation; empty memberIds means planned, not populated. */
  poiDistribution?: PoiDistribution;
  /** Derived per-POI spatial fields shared by terrain, preview and future ecological consumers. */
  regionFields?: Record<string, import("../spatial/regions/RegionScalarField").RegionScalarField>;
  /** Explicit active authoring profile; the world outside this bound remains available. */
  settlementLayout?: { profileId: string; activeBounds: PlanPoint[] };
  flowerRegions?: import("../spatial/ecology/FlowerRegions").FlowerRegion[];
  naturalVegetation?: import("../planning-data/NaturalVegetationProfile").NaturalVegetationDistribution;
  landscapes?: PlanLandscape[];
  fences?: import("../spatial/V2Model.ts").V2Box[];
  plazas?: PlanPlace[];
  /** Seeded paving proposals retained so optional plazas can return when buildings shrink. */
  plazaCandidates?: PlanPlace[];
  /** Small village experiment, using the same terrain and whitebox consumers. */
  villageStudy?: boolean;
  courtyards?: PlanCourtyard[];
  landformStudy?: boolean;
  /** Module contracts and independent evidence for the semantic planner. */
  planning?: import("./WorldPlanningContract").PlanningData;
  mode?: "base-map";
  canyonStudy?: boolean;
  /** Requested size remains editable while resolved size reflects available world space. */
  sizeAdjustments?: {
    id: string;
    label: string;
    requested: number;
    applied: number;
    shiftX: number;
    shiftZ: number;
    offsetX: number;
    offsetZ: number;
    members: string[];
  }[];
  shapeRecipes?: ShapeRecipe[];
  parameters: IslandPlanParameters;
  land: PlanPoint[];
  islands: PlanPoint[][];
  structures?: PlanLandformStructure[];
  rocks: PlanRock[];
  mountains: PlanMountain[];
  waters: PlanWater[];
  routes: PlanRoute[];
  places: PlanPlace[];
  bridges: PlanBridge[];
  sights: PlanSight[];
  spawn: PlanPoint;
  prompt: string;
  regions: PlanRegion[];
  buildings: PlanBuilding[];
  ridges: PlanRidge[];
  supports: PlanSupport[];
  slopes: PlanSlope[];
  raster: { heightSamples: number; alphaSamples: number; spacing: number };
}

/** Semantic area independent of its rendered boundary. */
export interface PlanRegion {
  /** Explicit road avoidance area; remains walkable terrain, not a solid. */
  roadExcluded?: boolean;
  /** Stable feasible packing, retained across density edits and serialized with the snapshot. */
  buildingCapacity?: {
    buildings: PlanBuilding[];
    ports: import("./WorldPlanningContract").PlanningPort[];
    relations: import("./WorldPlanningContract").PlanningRelation[];
    links: NonNullable<PlanRegion["navigationLinks"]>;
  };
  surface?: "road";
  navigationArea?: PlanPoint[];
  navigationWidth?: number;
  navigationLinks?: { from: string; to: string; points: PlanPoint[]; width: number }[];
  id: string;
  label: string;
  kind: "village" | "teleport" | "open" | "rock-cluster" | "island";
  outline: PlanPoint[];
}
/** Building envelope reserved for later asset placement. */
export interface PlanBuilding {
  boxes?: import("../spatial/V2Model.ts").V2Box[];
  sizingScale?: number;
  doorWidthM?: number;
  doorHeightM?: number;
  floorCount?: number;
  floorHeightsM?: number[];
  id: string;
  regionId: string;
  center: PlanPoint;
  outline: PlanPoint[];
  width: number;
  depth: number;
  baseHeight?: number;
  height: number;
  yaw: number;
}
/** Neutral parcel: boundary volumes and a gate-to-building access path, without gameplay zoning. */
export interface PlanCourtyard {
  id: string;
  regionId: string;
  buildingId: string;
  outline: PlanPoint[];
  gate: PlanPoint;
  door: PlanPoint;
  gateWidth: number;
  fences: import("../spatial/V2Model.ts").V2Box[];
  path: PlanRoute;
}
/** Ridge skeleton describes a mountain, not a walkable route. */
export interface PlanRidge {
  id: string;
  groupId: string;
  points: PlanPoint[];
}
/** Approximate inclined outer envelope with explicit endpoint levels; no collision claim. */
export interface PlanSupport {
  id: string;
  routeId: string;
  outline: PlanPoint[];
  a: PlanPoint;
  b: PlanPoint;
  startHeight: number;
  endHeight: number;
  width: number;
  thickness: number;
}
/** Material-bearing terrain transition with a real band footprint and height profile. */
export interface PlanSlope {
  id: string;
  label: string;
  outer: PlanPoint[];
  inner: PlanPoint[];
  width: number;
  rise: number;
  material: "soil";
  profile: "smoothstep";
}

/** Asset-independent landscape occupancy, separate from terrain-forming mountain rocks. */
export interface PlanLandscape {
  /** Derived shared rock profile; source height prevents cumulative scaling on local edits. */
  rockGeneration?: { sourceHeight: number };
  assetId?: string;
  contextWeight?: number;
  treeShape?: { trunkWidthRatio: number; crownBaseRatio: number; crownTopRatio: number };
  heightRule?: { heightMultiplier: number; minimumAboveAmbientM: number };
  locked?: boolean;
  poiId?: string;
  role?: "ambient" | "poi";
  habitat?: { altitudeM: number; slopeDegrees: number; reliefM: number; suitability: number };
  context?: "road" | "building" | "landform" | "poi" | "openland";
  id: string;
  ownerId: string;
  sourceId: string;
  kind: "tree" | "rock";
  center: PlanPoint;
  width: number;
  depth: number;
  height: number;
  yaw: number;
  baseHeight: number;
  outline: PlanPoint[];
  collisionRadius: number;
  canopyRadius?: number;
}
