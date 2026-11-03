/** Authoring-side value objects for an arbitrary raster-defined water surface. */
import type { HeightfieldWaterDiagnosticCode, HeightfieldWaterDiagnosticSeverity } from "./HeightfieldWaterEnums";

export type HeightfieldWaterVector2 = readonly [number, number];
export type HeightfieldWaterColor = readonly [number, number, number, number];

export interface HeightfieldWaterGridConfig {
  /** World XZ position of the centre of texel (0, 0). */
  readonly originXZ: HeightfieldWaterVector2;
  /** Positive world-space size of one source texel. */
  readonly cellSizeXZ: HeightfieldWaterVector2;
  readonly width: number;
  readonly height: number;
}

/**
 * Body-local render coverage derived from one flat lake level and canonical Terrain heights.
 *
 * `basinSupport` is the hydrological broad phase: Terrain below the water level is visible only
 * where this mask is non-zero. `terrainHeights` and `basinSupport` are sampled at `grid` texel
 * centres. They are render inputs only and never replace the descriptor's semantic/query grid.
 */
export interface HeightfieldWaterBasinTerrainCoverageV1 {
  readonly kind: "basin-constrained-terrain-height";
  readonly grid: HeightfieldWaterGridConfig;
  readonly basinSupport: Uint8Array;
  readonly terrainHeights: Float32Array;
  readonly waterLevel: number;
  readonly minimumVisibleDepth: number;
}

/**
 * Optional conservative render-only surface for a bounded Heightfield WaterBody.
 *
 * The semantic/query grid remains authoritative. This triangle list only replaces the raster
 * cell geometry. Values are absolute world-space XYZ and every consecutive nine numbers form one
 * upward-facing triangle. Coverage may either follow the geometry itself or be resolved from a
 * basin-constrained Terrain-height field.
 */
export interface HeightfieldWaterRenderSurfaceV1 {
  readonly topology: "triangle-list";
  readonly triangleVertices: Float32Array;
  readonly coverage: "geometry" | HeightfieldWaterBasinTerrainCoverageV1;
}

/** Physical motion facts; every visual value belongs to WaterLook. */
export interface HeightfieldWaterSurfaceMotionConfig {
  readonly waveStrength: number;
  readonly shoreDampingWidth: number;
}

/** Spatial-field encoding extent in metres; independent from visual foam width. */
export interface HeightfieldWaterSpatialFieldConfig {
  readonly signedDistanceRange: number;
}

/** Backend-local uniforms derived only from EffectiveSnapshot, never from WaterBodySource. */
export interface HeightfieldWaterVisualUniformConfig {
  readonly shallowColor: HeightfieldWaterColor;
  readonly deepColor: HeightfieldWaterColor;
  readonly opacity: number;
  readonly shoreFoamWidth: number;
  /** Optional runtime foam color. */
  readonly foamColor?: HeightfieldWaterColor;
  /** Optional runtime foam intensity. */
  readonly foamIntensity?: number;
  readonly microNormalStrength: number;
  readonly waveStrength: number;
}

export interface HeightfieldWaterBudgetConfig {
  readonly maxWetTexelCount: number;
  readonly maxQueryTexelCount: number;
  readonly maxComponentCount: number;
  readonly maxVertexCount: number;
  readonly maxTriangleCount: number;
  readonly maxChunkCount: number;
  readonly maxMapPixelCount: number;
}

export interface HeightfieldWaterDiagnostic {
  readonly code: HeightfieldWaterDiagnosticCode;
  readonly severity: HeightfieldWaterDiagnosticSeverity;
  readonly path: string;
  readonly message: string;
}

export interface HeightfieldWaterValidationResult<T> {
  readonly valid: boolean;
  readonly value?: T;
  readonly diagnostics: readonly HeightfieldWaterDiagnostic[];
}
