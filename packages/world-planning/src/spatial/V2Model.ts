/** Horizontal world-space position, in metres. */
export interface V2Point {
  x: number;
  z: number;
}
/** Three-dimensional world-space position, in metres. */
export interface V2Point3 extends V2Point {
  y: number;
}
/** Axis-aligned horizontal influence bounds, in metres. */
export interface V2Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}
/** Editable compact-support elevation primitive; labels do not select geometry algorithms. */
export interface V2Elevation {
  id: string;
  label: string;
  center: V2Point;
  radiusX: number;
  radiusZ: number;
  yaw: number;
  height: number;
  plateau: number;
  roughness: number;
  /** Optional world-space simple polygon replacing the ellipse footprint. */
  outline?: V2Point[];
}
/** River junction; edges share this position and surface elevation. */
export interface V2RiverNode extends V2Point {
  id: string;
  level: number;
  /** Mountain group whose downslope foot supplies this headwater. */
  sourceGroupId?: string;
}
/** Ordered interior controls and width samples for one directed reach. */
export interface V2RiverReach {
  id: string;
  label: string;
  from: string;
  to: string;
  controls: V2Point[];
  width: number;
  widthEnd: number;
  widthSamples?: { t: number; width: number }[];
  depth: number;
  bankWidth: number;
  /** Fit the longitudinal water surface to the landscape and named lake mouth. */
  fitTerrain?: boolean;
  lakeId?: string;
  /** Connected drainage system identity; tributaries share junction node IDs. */
  systemId?: string;
}
/** Closed lake boundary with a horizontal surface. */
export interface V2Lake {
  id: string;
  label: string;
  center: V2Point;
  radiusX: number;
  radiusZ: number;
  yaw: number;
  level: number;
  depth: number;
  irregularity: number;
  outline?: V2Point[];
  systemId?: string;
}
/** Compact corridor-shaped incision independent of semantic names. */
export interface V2Canyon {
  id: string;
  label: string;
  points: V2Point[];
  width: number;
  depth: number;
  shoulder: number;
}
/** Whitebox requested footprint and extent with independent occupancy properties. */
export interface V2Box {
  id: string;
  label: string;
  center: V2Point;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  yaw: number;
  /** Optional authored bottom elevation in world metres; omission binds the box to Terrain. */
  elevation?: number;
  /** Semantic whitebox category, independent of camera distance. */
  appearance?: "rock" | "building" | "landmark" | "platform" | "wall" | "bridge";
  collision: boolean;
  occlusion: boolean;
  locked?: boolean;
  band?: "near" | "middle" | "far";
}
/** An asset-independent occupancy slot within a place or crossing. */
export interface V2PlaceSlot {
  id: string;
  label: string;
  purpose: string;
  boxId?: string;
  center: V2Point;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  yaw: number;
}
/** Network anchor; it is not by itself a place of interest. */
export interface V2RouteNode {
  /** Authored contact height shared by connected paths and places. */
  elevation?: number;
  id: string;
  label: string;
  position: V2Point;
  radius?: number;
  supportBoxId?: string;
  sourceFeatureIds?: string[];
  slots?: V2PlaceSlot[];
}
/** A spatial place with an entrance, usable interior and independently authored occupancies. */
export interface V2POI {
  /** Standing height on an authored natural terrace or ridge. */
  elevation?: number;
  id: string;
  label: string;
  position: V2Point;
  radius: number;
  markerHeight: number;
  markerWidth?: number;
  /** Optional whitebox top carrying this destination; other POIs stay on terrain. */
  supportBoxId?: string;
  /** Authored feature identities explaining this location, independent of its label. */
  sourceFeatureIds?: string[];
  arrivalRouteIds?: string[];
  rewardTargetIds?: string[];
  /** Open semantic description, not an algorithm selector. */
  purpose?: string;
  outline?: V2Point[];
  entrances?: { id: string; routeNodeId: string; position: V2Point }[];
  activityAreas?: { id: string; label: string; purpose: string; outline: V2Point[] }[];
  slots?: V2PlaceSlot[];
}
/** Existing physical-flow families; geometry remains directly editable for additional combinations. */
export type V2RouteKind =
  | "main-road"
  | "branch-road"
  | "canyon"
  | "tributary"
  | "shore-route"
  | "pass"
  | "ridge-route"
  | "crossing";
/** Physical route request; paths are compiled from actual terrain and occupancy. */
export interface V2Route {
  id: string;
  label: string;
  from: string;
  to: string;
  width: number;
  maxSlope: number;
  bendPenalty: number;
  kind?: V2RouteKind;
  /** Interior horizontal authoring controls between the referenced endpoints. */
  controls?: V2Point[];
  /** Whitebox supports intersected by an elevated route, in traversal order. */
  supportBoxIds?: string[];
  /** Height offsets above support ground for [from, ...controls, to], in metres. The compiler adds the nearest support's actual baseY. */
  pointHeights?: number[];
  /** Optional absolute world-space Y values at route controls; exact support IDs take precedence. */
  pointElevations?: number[];
  /** Fill an authored ascending path down to Terrain with walkable column steps. */
  solidSupport?: boolean;
  /** A continuous rock ridge/shoulder grown around this path's longitudinal height. */
  ridgeBody?: { width: number; flankDrop: number };
  /** Exact support for [from, ...controls, to]; null denotes terrain. Actual box tops override cached height offsets. */
  pointSupportIds?: (string | null)[];
  sourceFeatureIds?: string[];
  /** Measured crossing-placement limits; a proposal retains requested geometry without claiming physical passage. */
  placementDiagnostics?: {
    status: "clear" | "proposal";
    minimumEndpointClearance: number;
    bridgeLakeClearance: number;
    bridgeBodyClearance: number;
    message?: string;
  };
}
/** Sampled sight relation independent of physical connections. */
export interface V2ViewRelation {
  id: string;
  label?: string;
  from: string;
  target: string;
  mode: "visible" | "screened";
  minimum: number;
  maximum: number;
  hard: boolean;
}
/** Human-adjustable random proposal intervals; they are not capability limits. */
export interface V2RandomProfile {
  id: string;
  label: string;
  elevation: [number, number];
  riverWidth: [number, number];
  meander: [number, number];
  boxHeight: [number, number];
  roughness: [number, number];
}
/** Shared transform of referenced primitives, applied once during compilation. */
export interface V2Group {
  id: string;
  label: string;
  memberIds: string[];
  pivot: V2Point;
  translation: V2Point;
  yaw: number;
  scale: number;
  /** Editable column assembly; columns remain ordinary spatial primitives. */
  columnShape?: V2ColumnShape;
  /** Open profile role; the six legacy examples do not limit authored combinations. */
  silhouetteRole?: string;
  band?: "near" | "middle" | "far";
  /** Untransformed outer envelope at pivot; yaw follows the XZ mathematical convention. */
  envelope?: { sizeX: number; sizeZ: number; height: number; yaw: number };
  /** Broad terrain support derived from the body, never an independent mountain generator. */
  foundation?: { height: number; transition: number };
}
/** Six reusable silhouette responsibilities, including the preserved saddle opening. */
export type V2ColumnRole = "crown/spire" | "wall" | "buttress/shoulder" | "terrace/cap" | "saddle/notch" | "skirt";
/** Local silhouette and footprint sampled by broad upright sections. All dimensions are metres. */
export interface V2ColumnShape {
  role: V2ColumnRole;
  width: number;
  depth: number;
  height: number;
  /** Requested minimum section width along the profile; preview density also limits the section count. */
  cellSize: number;
  elevation: number;
  yaw: number;
  /** Normalized along-axis heights; omission uses the selected responsibility's profile. */
  profile?: number[];
  /** Optional normalized lower silhouette for overhangs; elevations are relative to height. */
  bottomProfile?: number[];
  /** Central opening width and retained floor height for a saddle. */
  opening?: number;
  floor?: number;
}
/** A reproducible reference composition and its small set of semantic controls. */
export interface V2ReferenceScene {
  id: "water-valley" | "river-village" | "stone-gateway" | "ridge-crossing";
  parameters: Record<string, number>;
  /** Fixed comparison camera; pitch is radians and vertical field of view is degrees. */
  camera: { pitch: number; fieldOfView: number };
}
/** Global semantic controls governing continuous terrain, hydrology, circulation and mountain bands. */
export interface V2GlobalSettings {
  spawnX: number;
  spawnZ: number;
  spawnYaw: number;
  viewAngle: number;
  nearDistance: number;
  middleDistance: number;
  farDistance: number;
  relief: number;
  rolling: number;
  detail: number;
  wavelength: number;
  warp: number;
  coastWidth: number;
  lakeWidth: number;
  lakeLength: number;
  lakeX: number;
  lakeZ: number;
  waterLevel: number;
  tributaryCount: number;
  riverWidth: number;
  riverMeander: number;
  routeCount: number;
  routeWidth: number;
  poiCount: number;
  nearCount: number;
  middleCount: number;
  farCount: number;
  nearHeight: number;
  middleHeight: number;
  farHeight: number;
  passageWidth: number;
  pullHeight: number;
  /** Number of independent connected drainage systems, each with a receiving lake. */
  riverSystemCount: number;
  /** External ocean surface, independent of inland lake levels. */
  seaLevel: number;
  /** Multiplicative mountain footprint, retaining height and continuous profile proportions. */
  footprintScale: number;
  mainRouteCount: number;
  canyonCount: number;
  shoreRouteCount: number;
  passCount: number;
  ridgeRouteCount: number;
  crossingCount: number;
}
/** Cell-centred terrain layer weights in row-major positive-Z RGBA order. */
export interface V2Alphamap {
  resolution: number;
  /** R = soil, G = grass, B = ground road, A = sand. */
  channels: readonly ["soil", "grass", "road", "sand"];
  /** Four bytes per cell-centred texel; the channel sum is exactly 255. */
  weights: Uint8Array;
}
/** Serializable authoring intent; all lengths use metres and angles use radians. */
export interface WorldRecipe {
  version: 2;
  algorithm: "layout-2.0";
  seed: number;
  size: number;
  resolution: number;
  alphamapResolution?: number;
  global?: V2GlobalSettings;
  referenceScene?: V2ReferenceScene;
  baseHeight: number;
  roughness: number;
  noiseScale: number;
  /** Optional authored floor elevation for the small dry spawn pad. */
  spawn: V2Point & { yaw: number; elevation?: number };
  player: {
    radius: number;
    eyeHeight: number;
    maxSlope: number;
    speed: number;
    /** Maximum water depth that permits grounded movement; omission retains the preview water floor. */
    maxWadingDepth?: number;
  };
  /** Maximum permitted cut or fill relative to terrain before road construction. */
  earthworks?: { maxCutFill: number; shoulder: number };
  riverScale: number;
  profile: V2RandomProfile;
  elevations: V2Elevation[];
  riverNodes: V2RiverNode[];
  rivers: V2RiverReach[];
  lakes: V2Lake[];
  groups?: V2Group[];
  canyons: V2Canyon[];
  boxes: V2Box[];
  pois: V2POI[];
  routeNodes?: V2RouteNode[];
  routes: V2Route[];
  views: V2ViewRelation[];
}
/** Triangles shared by rendering and geometric checks. */
export interface V2Mesh {
  uvs?: number[][];
  pickIds?: number[];
  positions: number[];
  indices: number[];
}
/** Published regular grid; row-major index is z * resolution + x. */
export interface V2Heightfield {
  resolution: number;
  size: number;
  heights: Float32Array;
  min: number;
  max: number;
}
/** Compiled water surface with a triangulated authoritative footprint. */
export interface V2WaterSurface {
  id: string;
  kind: "river" | "lake";
  mesh: V2Mesh;
  outline: V2Point[];
  centerline: V2Point3[];
  widths: number[];
  depth: number;
  bankWidth: number;
}
/** Compiled walkable road ribbon and its measured longitudinal slope. */
export interface V2Road {
  id: string;
  from: string;
  to: string;
  width: number;
  centerline: V2Point3[];
  mesh: V2Mesh;
  length: number;
  maxSlope: number;
  kind?: V2RouteKind;
  sourceFeatureIds?: string[];
  supportBoxIds?: string[];
  placementDiagnostics?: V2Route["placementDiagnostics"];
}
/** Grounded world-space whitebox. */
export interface V2PlacedBox extends V2Box {
  y: number;
  baseY: number;
}
/** Grounded destination with a visible marker. */
export interface V2PlacedPOI extends V2POI {
  y: number;
  markerPosition?: V2Point;
  markerBaseY?: number;
}
/** Network anchor projected to its actual terrain or whitebox support. */
export interface V2PlacedRouteNode extends V2RouteNode {
  y: number;
}
/** Per-ray witness linking sampled visibility to world geometry. */
export interface V2SightSample {
  from: V2Point3;
  to: V2Point3;
  clear: boolean;
  hit?: V2Point3;
  blocker?: string;
}
/** Evaluated visual relation; ratios describe samples, not aesthetic quality. */
export interface V2Sight {
  id: string;
  from: string;
  target: string;
  mode: "visible" | "screened";
  visibleFraction: number;
  angularSize: number;
  samples: V2SightSample[];
}
/** One independently measured condition and its evidence. */
export interface V2Check {
  id: string;
  category: string;
  hard: boolean;
  passed: boolean;
  measured: number;
  limit: number;
  unit: string;
  message: string;
  location?: V2Point;
}
/** One shared transaction budget; children consume rather than reset it. */
export interface V2Budget {
  operations: number;
  searchExpansions: number;
  maxMilliseconds: number;
}
/** Geometric differences between the candidate and the prior committed world. */
export interface V2EditImpact {
  changedIds: string[];
  affectedIds: string[];
  bounds: V2Bounds | null;
  changedHeightSamples: number;
  totalHeightSamples: number;
}
/** Outcome and operation measurements for a single explicit authoring job. */
export interface ValidationReport {
  status: "valid" | "proved-conflict" | "not-found-within-budget" | "unsupported" | "invalid-input" | "cancelled";
  published: boolean;
  intentSatisfied: boolean;
  checks: V2Check[];
  messages: string[];
  operations: number;
  searchExpansions: number;
  durationMs: number;
  candidateCount: number;
  impact: V2EditImpact;
  adjusted: string[];
}
/** One authoritative, immutable-by-contract world consumed by every view. */
export interface WorldSnapshot {
  routeNodes?: V2PlacedRouteNode[];
  /** Compiled geometry bounds for every selectable feature, including transformed groups. */
  focusBounds?: Record<string, V2Bounds & { minY: number; maxY: number }>;
  /** Published primitive-to-group relationship used by selection and camera focus. */
  featureParents?: Record<string, string>;
  version: 2;
  algorithm: "layout-2.0";
  id: string;
  recipeHash: string;
  seed: number;
  size: number;
  heightfield: V2Heightfield;
  alphamap?: V2Alphamap;
  global?: V2GlobalSettings;
  waters: V2WaterSurface[];
  roads: V2Road[];
  boxes: V2PlacedBox[];
  pois: V2PlacedPOI[];
  sights: V2Sight[];
  spawn: V2Point3 & { yaw: number };
  player: WorldRecipe["player"];
  /** Input identities support exact change accounting across edit transactions. */
  sourceSignatures?: Record<string, string>;
  terrainBeforeRoads?: Float32Array;
  /** Sampling limits distinguish measured validity from geometric completeness. */
  sampling?: { terrainCell: number; routeStep: number; footprintSamples: number; sightSamples: number };
  experience?: import("../geometry/V2Experience.ts").V2ExperienceReport;
  report: ValidationReport;
}
/** A rejected candidate never replaces the last valid published snapshot. */
export interface V2CompileResult {
  snapshot: WorldSnapshot | null;
  candidate: WorldSnapshot | null;
  report: ValidationReport;
}
/** Explicitly registered geometry capabilities; semantic labels remain open strings. */
export const V2_CAPABILITIES = [
  "compact-elevation",
  "polygon-elevation",
  "referenced-group-transform",
  "polyline-incision",
  "variable-width-river-graph",
  "elliptic-lake",
  "concave-polygon-lake",
  "arc-length-width-profile",
  "terrain-road",
  "oriented-box",
  "sampled-sight"
] as const;
