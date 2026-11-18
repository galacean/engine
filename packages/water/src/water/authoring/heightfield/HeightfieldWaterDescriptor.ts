import type { WaterTerrainSnapshot } from "../terrain/WaterTerrainSnapshot";
import type { WaterConnectionPort } from "../connections/WaterConnection";
/** V1 input contract: sparse wet texels with absolute world-space water elevations. */
import type { LakeBoundaryV1 } from "../lake/LakeBoundary";
import type { WaterQualityTier } from "../wave/enums/WaterQualityTier";
import type { WaterWaveAssetV1 } from "../wave/WaterWaveTypes";
import { HeightfieldWaterSchemaVersion } from "./HeightfieldWaterEnums";
import type {
  HeightfieldWaterBudgetConfig,
  HeightfieldWaterGridConfig,
  HeightfieldWaterSpatialFieldConfig,
  HeightfieldWaterSurfaceMotionConfig,
  HeightfieldWaterRenderSurfaceV1
} from "./HeightfieldWaterTypes";

export interface HeightfieldWaterDescriptorV1 {
  readonly connections?: readonly WaterConnectionPort[];
  readonly schemaVersion: HeightfieldWaterSchemaVersion.V1;
  readonly id: string;
  /** Closed Lake shoreline; raster fields retain bathymetry/current storage. */
  readonly lakeBoundary?: LakeBoundaryV1;
  readonly grid: HeightfieldWaterGridConfig;
  /** Strictly increasing row-major indices: z * width + x. */
  readonly wetTexelIndices: Uint32Array;
  /** Absolute world-space water Y, one value per wet texel. */
  readonly surfaceHeights: Float32Array;
  /** Optional bed Y, one value per wet texel. Missing data compiles as a two-metre water column. */
  readonly bedHeights?: Float32Array;
  /** Exact external bed when raster support cannot encode its mixed cell topology (Lake only). */
  readonly bedTerrain?: WaterTerrainSnapshot;
  /** Optional world-space XZ flow vectors, two values per wet texel. */
  readonly flowVectorsXZ?: Float32Array;
  /** Optional conservative render surface. It never changes wet/query semantics. */
  readonly renderSurface?: HeightfieldWaterRenderSurfaceV1;
  readonly waveAsset: WaterWaveAssetV1;
  /** Standalone-compiler fallback only; WaterBody activation always overwrites it from WaterQualityPlan. */
  readonly quality: WaterQualityTier;
  readonly surfaceMotion: HeightfieldWaterSurfaceMotionConfig;
  readonly spatialField: HeightfieldWaterSpatialFieldConfig;
  /** Optional validation limits. They may only tighten trusted compiler hard limits. */
  readonly budget?: Partial<HeightfieldWaterBudgetConfig>;
}

/** Canonical physical Source DTO. Quality and render-only geometry are owned by other model axes. */
export type HeightfieldWaterBodySourceDescriptorV1 = Omit<
  HeightfieldWaterDescriptorV1,
  "quality" | "renderSurface" | "spatialField"
>;

export interface HeightfieldWaterRepresentationDataV1 {
  readonly schemaVersion: 1;
  readonly kind: "heightfield-spatial-representation";
  readonly spatialField: HeightfieldWaterSpatialFieldConfig;
  readonly renderSurface?: HeightfieldWaterRenderSurfaceV1;
}

export function createHeightfieldWaterBodySourceDescriptorV1(
  descriptor: Readonly<HeightfieldWaterDescriptorV1>
): Readonly<HeightfieldWaterBodySourceDescriptorV1> {
  const {
    quality: _compilerFallbackQuality,
    renderSurface: _representationRenderSurface,
    spatialField: _representationSpatialField,
    ...physicalSource
  } = descriptor;
  return Object.freeze(physicalSource);
}

export function createHeightfieldWaterRepresentationDataV1(
  descriptor: Readonly<HeightfieldWaterDescriptorV1>
): Readonly<HeightfieldWaterRepresentationDataV1> {
  return Object.freeze({
    schemaVersion: 1,
    kind: "heightfield-spatial-representation",
    spatialField: descriptor.spatialField,
    renderSurface: descriptor.renderSurface
  });
}
