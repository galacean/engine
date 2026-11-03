/** Common Water-owned bathymetry, shoreline SDF, and current-field contract. */
import type { Texture } from "@galacean/engine-core";
import type { WaterBoundsXZ } from "../body/WaterBodyRuntime";
import type { WaterNearShoreQuery } from "./WaterNearShoreQuery";

export const WATER_SPATIAL_FIELD_VERSION = 1 as const;

export enum WaterSpatialFieldChannel {
  None = 0,
  Bathymetry = 1 << 0,
  ShoreSignedDistance = 1 << 1,
  ShoreNormal = 1 << 2,
  Current = 1 << 3
}

export enum WaterSpatialFieldRegion {
  Invalid = 0,
  InsideWet = 1,
  InsideDry = 2,
  OutsideWet = 3,
  OutsideDry = 4,
  OutsideUnresolved = 5
}

export type WaterSpatialFieldOutsidePolicy = "unresolved" | "wet" | "dry";

export interface WaterSpatialFieldOutsidePolicies {
  readonly negativeX: WaterSpatialFieldOutsidePolicy;
  readonly positiveX: WaterSpatialFieldOutsidePolicy;
  readonly negativeZ: WaterSpatialFieldOutsidePolicy;
  readonly positiveZ: WaterSpatialFieldOutsidePolicy;
}

export interface WaterSpatialFieldMetadata {
  readonly version: typeof WATER_SPATIAL_FIELD_VERSION;
  /** Version of the backend-owned authoring/source data, not this Provider contract. */
  readonly sourceSchemaVersion: number;
  readonly sourceHash: string;
  /** Identity of the immutable compiled facts sampled by this Provider. */
  readonly compiledHash: string;
  readonly storage: string;
  readonly channels: number;
  readonly bounds: WaterBoundsXZ;
  readonly outsidePolicy: WaterSpatialFieldOutsidePolicies;
  /** Conservative horizontal sampling/quantization error in metres. */
  readonly maximumHorizontalError: number;
  /** Conservative depth quantization/interpolation error in metres. */
  readonly maximumDepthError: number;
}

export interface WaterSpatialFieldSample {
  /** Channels whose numeric values are meaningful for this exact sample. */
  validChannels: number;
  region: WaterSpatialFieldRegion;
  resolved: boolean;
  insideField: boolean;
  wet: boolean;
  surfaceHeight: number;
  bedHeight: number;
  waterDepth: number;
  /** Positive in water, zero at shore, negative on dry land. */
  shoreSignedDistance: number;
  /** Horizontal unit vector pointing from water toward dry land. */
  shoreNormalX: number;
  shoreNormalZ: number;
  currentX: number;
  currentZ: number;
}

export interface WaterSpatialFieldGpuBinding {
  readonly version: typeof WATER_SPATIAL_FIELD_VERSION;
  readonly sourceHash: string;
  readonly compiledHash: string;
  readonly texture: Texture;
  /**
   * Legacy axis-aligned mapping: u = worldX * x + z; v = worldZ * y + w.
   * Absent when the published finite-body transform contains cross-axis yaw.
   */
  readonly worldToUv?: readonly [number, number, number, number];
  /**
   * Full planar affine mapping, always preferred by V2 consumers:
   * u = worldX * m00 + worldZ * m01 + tx;
   * v = worldX * m10 + worldZ * m11 + ty.
   */
  readonly worldToUvAffine?: readonly [m00: number, m01: number, tx: number, m10: number, m11: number, ty: number];
  readonly channels: number;
  readonly decode: Readonly<Record<string, number>>;
  /** Conservative shader decode/quantization error in metres. */
  readonly maximumDepthDecodeError: number;
  /** Conservative signed-shore-distance decode error in metres. */
  readonly maximumShoreDecodeError: number;
}

export interface WaterSpatialFieldProvider {
  readonly metadata: WaterSpatialFieldMetadata;
  readonly gpuBinding?: WaterSpatialFieldGpuBinding;
  /** Optional CPU proximity over the same immutable Water facts, beyond the raster's bounds. */
  readonly nearShore?: WaterNearShoreQuery;

  /**
   * Returns true whenever the configured inside/outside policy resolved the
   * point. Callers must inspect `wet` and `region`; dry is still resolved.
   */
  sampleSpatialField(worldX: number, worldZ: number, outSample: WaterSpatialFieldSample): boolean;
  /**
   * Conservative upper bound of the static surface at any wet point in the closed XZ bounds.
   * null certifies that the whole bounds is dry. A finite result may include dry points;
   * consumers must refine or obtain a wet sample, never treat the bound itself as a hit.
   */
  maximumSurfaceHeightInBounds?(bounds: WaterBoundsXZ): number | null;
  /** CPU-only static facts, independent of later body replacement, retirement, time and GPU lifetime. */
  capture?(): WaterSpatialFieldSnapshot;
}

export type WaterSpatialFieldSnapshot = Readonly<
  Pick<WaterSpatialFieldProvider, "metadata" | "sampleSpatialField" | "maximumSurfaceHeightInBounds" | "nearShore">
>;

/** Do not expose a provider's mutation, GPU binding or lifecycle through a captured query. */
export function waterSpatialFieldSnapshot(provider: WaterSpatialFieldSnapshot): WaterSpatialFieldSnapshot {
  return Object.freeze({
    metadata: provider.metadata,
    ...(provider.nearShore && { nearShore: provider.nearShore }),
    sampleSpatialField: (x: number, z: number, out: WaterSpatialFieldSample) => provider.sampleSpatialField(x, z, out),
    ...(provider.maximumSurfaceHeightInBounds && {
      maximumSurfaceHeightInBounds: (bounds: WaterBoundsXZ) => provider.maximumSurfaceHeightInBounds!(bounds)
    })
  });
}

export interface WaterSpatialFieldOutsideEdges {
  readonly negativeX: boolean;
  readonly positiveX: boolean;
  readonly negativeZ: boolean;
  readonly positiveZ: boolean;
}

export const WATER_SPATIAL_FIELD_OUTSIDE_UNRESOLVED: WaterSpatialFieldOutsidePolicies = Object.freeze({
  negativeX: "unresolved",
  positiveX: "unresolved",
  negativeZ: "unresolved",
  positiveZ: "unresolved"
});

export function createWaterSpatialFieldSample(): WaterSpatialFieldSample {
  return {
    validChannels: WaterSpatialFieldChannel.None,
    region: WaterSpatialFieldRegion.Invalid,
    resolved: false,
    insideField: false,
    wet: false,
    surfaceHeight: Number.NaN,
    bedHeight: Number.NaN,
    waterDepth: 0,
    shoreSignedDistance: Number.NaN,
    shoreNormalX: 0,
    shoreNormalZ: 0,
    currentX: 0,
    currentZ: 0
  };
}

export function resetWaterSpatialFieldSample(sample: WaterSpatialFieldSample): void {
  sample.validChannels = WaterSpatialFieldChannel.None;
  sample.region = WaterSpatialFieldRegion.Invalid;
  sample.resolved = false;
  sample.insideField = false;
  sample.wet = false;
  sample.surfaceHeight = Number.NaN;
  sample.bedHeight = Number.NaN;
  sample.waterDepth = 0;
  sample.shoreSignedDistance = Number.NaN;
  sample.shoreNormalX = 0;
  sample.shoreNormalZ = 0;
  sample.currentX = 0;
  sample.currentZ = 0;
}

/**
 * Deterministic corner rule: dry dominates wet, explicit wet dominates
 * unresolved, and an all-unresolved edge set remains unresolved.
 */
export function resolveWaterSpatialFieldOutsidePolicy(
  policies: WaterSpatialFieldOutsidePolicies,
  outside: WaterSpatialFieldOutsideEdges
): WaterSpatialFieldOutsidePolicy {
  const selected: WaterSpatialFieldOutsidePolicy[] = [];
  if (outside.negativeX) selected.push(policies.negativeX);
  if (outside.positiveX) selected.push(policies.positiveX);
  if (outside.negativeZ) selected.push(policies.negativeZ);
  if (outside.positiveZ) selected.push(policies.positiveZ);
  if (selected.includes("dry")) return "dry";
  if (selected.includes("wet")) return "wet";
  return "unresolved";
}
