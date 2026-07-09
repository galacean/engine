/**
 * River-system data contracts.
 *
 * These interfaces describe the stable language shared by the water pipeline:
 * external configuration, sampled path points, generated mesh results, gameplay
 * query output, and optional terrain height sampling. The rest of the river code
 * should depend on these contracts instead of ad hoc objects so AI-authored
 * configs, editor controls, render generation, and gameplay queries can stay
 * compatible as the prototype moves toward an engine-level module.
 */
import { ModelMesh, Vector3 } from "@galacean/engine";
import {
  RiverDebugMode,
  RiverDirectionMode,
  RiverMaterialPreset,
  RiverNodeKind,
  RiverPathMode,
  RiverPreviewStage,
  RiverQualityLevel
} from "./constants";

/** World-space position tuple in Galacean coordinates: [x, y, z]. */
export type Vector3Tuple = [number, number, number];

export interface RiverPathControlPoint {
  /** Stable point identifier used by PCG, editor tooling, debug views, and future diff/patch workflows. */
  id: string;
  /** World-space anchor position in Galacean coordinates. */
  position: Vector3Tuple;
  /**
   * Optional incoming Bezier handle, stored as an offset relative to position.
   * It controls how the curve enters this point when RiverPathMode.Bezier is used.
   */
  in?: Vector3Tuple;
  /**
   * Optional outgoing Bezier handle, stored as an offset relative to position.
   * It controls how the curve leaves this point when RiverPathMode.Bezier is used.
   */
  out?: Vector3Tuple;
  /** Optional local water-surface width override, interpolated into generated samples. */
  width?: number;
  /** Optional local query/render depth override, interpolated into generated samples. */
  depth?: number;
  /** Optional local flow-speed override, interpolated into generated samples and query output. */
  flowSpeed?: number;
  /** Optional local bank transition width override, interpolated into generated bank foam. */
  bankFeather?: number;
}

export interface RiverCurveConfig {
  /**
   * Centerline control points authored by PCG or tools. They are not rendered
   * directly; RiverPathSampler resamples them into dense runtime points used for
   * ribbon vertices, flow direction, UV distance, local width/depth, and query data.
   */
  points: RiverPathControlPoint[];
  /**
   * Interpolation mode used between control points.
   * Polyline preserves sharp authored turns, while CatmullRom produces a smoother
   * natural river course from sparse PCG points. Bezier uses per-point in/out
   * handles for explicit curve control similar to Godot Curve3D authoring.
   */
  mode: RiverPathMode;
  /**
   * Target world-space distance between generated samples.
   * Smaller values create smoother curves and denser UV flow, but also increase
   * vertex count, query cost, and rebuild work.
   */
  segmentLength: number;
}

export type RiverPathConfig = RiverCurveConfig;

export interface RiverShapeConfig {
  /**
   * Full water-surface width in world units.
   * Mesh generation uses half of this value on both sides of the sampled centerline.
   */
  width: number;
  /**
   * Gameplay/query depth in world units.
   * The current prototype uses this for WaterQuery results; future terrain carving
   * can use the same value to lower a river bed beneath the surface.
   */
  depth: number;
  /**
   * Extra transition width outside the main water surface.
   * RiverMeshBuilder uses this to build the wider bank-foam strip around the river.
   */
  bankFeather: number;
}

export interface RiverFlowConfig {
  /**
   * Flow speed scalar shared by visual animation and gameplay query output.
   * RiverMaterialFactory uses it to advance UV-based ripples along the path.
   */
  speed: number;
  /**
   * Rule for choosing the downstream direction.
   * PathOrder follows the authored point order; Downstream is reserved for height-
   * aware flow direction once terrain sampling is connected.
   */
  directionMode: RiverDirectionMode;
}

export interface RiverMaterialConfig {
  /**
   * High-level material style chosen by PCG or GUI presets.
   * The preset sets sensible defaults while explicit color/foam/clarity fields
   * remain available for fine tuning.
   */
  preset: RiverMaterialPreset;
  /**
   * Main water color as a six-digit hex string.
   * It drives the transparent surface color in the river shader.
   */
  baseColor: string;
  /**
   * Foam/highlight color as a six-digit hex string.
   * It is used near banks and animated ripple highlights.
   */
  foamColor: string;
  /**
   * Foam strength in the normalized range [0, 1].
   * Higher values make bank foam and bright ripple lines more visible.
   */
  foamIntensity: number;
  /**
   * Water clarity in the normalized range [0, 1].
   * Higher values keep the river center brighter and more transparent-looking.
   */
  clarity: number;
}

export interface RiverQualityConfig {
  /**
   * Semantic quality tier used by UI presets and future device policies.
   * It maps to sampling density and effect budgets rather than changing river shape directly.
   */
  level: RiverQualityLevel;
  /**
   * Hard cap for generated path samples and mesh segments.
   * This protects PCG-authored rivers from creating unbounded geometry on Web/mobile targets.
   */
  maxSegmentCount: number;
}

export interface RiverDebugConfig {
  /**
   * Progressive preview stage used while developing the river pipeline.
   * Each stage isolates one layer of the system so path, banks, mesh, material,
   * and final runtime behavior can be inspected without visual noise from later steps.
   */
  previewStage: RiverPreviewStage;
  /**
   * Controls whether internal river state is drawn in the preview.
   * Debug rendering is separate from the production surface and should not affect
   * WaterQuery or generated river meshes.
   */
  mode: RiverDebugMode;
  /**
   * Normalized position along total river length used for the demo query marker.
   * 0 samples near the start of the river and 1 samples near the end.
   */
  queryT: number;
}

export interface RiverConfig {
  /** Stable identifier for this river instance in generated world data. */
  id: string;
  /** Path authoring inputs that determine where the river exists. */
  path: RiverPathConfig;
  /** Cross-section controls that determine visible width, query depth, and bank transition. */
  shape: RiverShapeConfig;
  /** Flow controls shared by shader animation and gameplay-facing query results. */
  flow: RiverFlowConfig;
  /** Visual controls for water color, foam, and clarity. */
  material: RiverMaterialConfig;
  /** Performance and sampling budget controls for generated geometry. */
  quality: RiverQualityConfig;
  /** Preview/debug-only controls for inspecting generated river state. */
  debug: RiverDebugConfig;
}

export interface RiverNodeConfig {
  /** Stable node identifier referenced by RiverSegmentConfig.from/to. */
  id: string;
  /** Semantic role of this water-network node. */
  kind: RiverNodeKind;
  /** Shared world-space connection position for sources, mouths, confluences, and bifurcations. */
  position: Vector3Tuple;
  /** Radius around the node reserved for future junction patch generation and segment trimming. */
  mergeRadius?: number;
  /** Optional terrain/water elevation used by validators to warn about inverted downstream flow. */
  elevation?: number;
}

export interface RiverSegmentConfig {
  /** Stable segment identifier for a main-river reach or tributary reach. */
  id: string;
  /** Upstream node id. Water flows from this node toward to. */
  from: string;
  /** Downstream node id. */
  to: string;
  /** Curve controls for this river segment. */
  curve: RiverCurveConfig;
  /** Optional segment-local shape overrides applied over network defaults. */
  shape?: Partial<RiverShapeConfig>;
  /** Optional segment-local flow overrides applied over network defaults. */
  flow?: Partial<RiverFlowConfig>;
  /** Optional segment-local material overrides applied over network defaults. */
  material?: Partial<RiverMaterialConfig>;
  /** Optional river order used by PCG to distinguish main channels from tributaries. */
  order?: number;
}

export interface RiverNetworkConfig {
  /** Stable identifier for a connected water network. */
  id: string;
  /** Directed graph nodes: sources, confluences, mouths, and bifurcations. */
  nodes: RiverNodeConfig[];
  /** Directed river reaches connecting nodes. */
  segments: RiverSegmentConfig[];
  /** Default render/query settings inherited by every segment unless overridden. */
  defaults: {
    shape: RiverShapeConfig;
    flow: RiverFlowConfig;
    material: RiverMaterialConfig;
    quality: RiverQualityConfig;
  };
  /** Preview/debug-only controls for inspecting the full network. */
  debug?: RiverDebugConfig;
}

export interface RiverSamplePoint {
  /** Resampled world-space centerline point used to build mesh vertices. */
  position: Vector3;
  /** Normalized horizontal path tangent used for flow direction and bank normals. */
  tangent: Vector3;
  /** Cumulative world-space distance from the start of the river. */
  distance: number;
  /** Resolved water-surface width at this sample. */
  width: number;
  /** Resolved query depth at this sample. */
  depth: number;
  /** Resolved flow speed at this sample. */
  flowSpeed: number;
  /** Resolved bank transition width at this sample. */
  bankFeather: number;
}

export interface RiverSampleResult {
  /** Dense path samples generated from RiverCurveConfig. */
  points: RiverSamplePoint[];
  /** Total sampled centerline length in world units. */
  totalLength: number;
}

export interface RiverMeshBuildResult {
  /** Main transparent ribbon rendered as the river water surface. */
  surfaceMesh: ModelMesh;
  /** Wider strip rendered below/around the surface to express bank foam and blending. */
  bankFoamMesh: ModelMesh;
}

export interface RiverQueryResult {
  /** Whether the queried world position is inside the configured river width. */
  inWater: boolean;
  /** Interpolated water-surface height at the closest river segment. */
  surfaceHeight: number;
  /** Depth available at the queried point, fading toward the bank. */
  depth: number;
  /** Horizontal flow direction at the closest river segment. */
  flowDirection: Vector3;
  /** Flow speed scalar from RiverFlowConfig. */
  flowSpeed: number;
  /** Signed distance from the queried point to the bank; negative means outside water. */
  distanceToBank: number;
}

export interface TerrainHeightSampler {
  /** Returns terrain height in world-space y for a given x/z position. */
  getHeight(x: number, z: number): number;
}
