import {
  WaterQualityTier,
  HeightfieldWaterSchemaVersion,
  WaterBathymetrySourceKind,
  WaterShoreSdfSourceKind,
  type ShoreDistanceProfileWaterBathymetrySourceV1,
  type TerrainBedSamplesWaterBathymetrySourceV1,
  type WaterSpatialFieldSourcesV1,
  type WetMaskWaterShoreSdfSourceV1,
  decodeWaterSpatialFieldSources,
  WaterWaveModel,
  WaterWaveSchemaVersion
} from "@galacean/engine-water/water/index";
import { attachLakeGridBoundary, WaterRegionBathymetryCompiler } from "@galacean/engine-water/water/compiler/index";

import type { HeightfieldWaterDescriptorV1, WaterRegionMaskV1 } from "@galacean/engine-water/water/index";

import { LAKE_WATER_SPATIAL_FIELD, LAKE_WATER_SURFACE_MOTION } from "@galacean/engine-water/water/presets/lake/index";

export const TERRAIN_GRASSLANDS_WATER_DESCRIPTOR_ID = "terrain-grasslands-water-heightfield-v1";

export interface GrasslandsTerrainWaterSpatialFieldSourcesV1 extends WaterSpatialFieldSourcesV1 {
  readonly bathymetry: ShoreDistanceProfileWaterBathymetrySourceV1 | TerrainBedSamplesWaterBathymetrySourceV1;
  readonly shoreSdf: WetMaskWaterShoreSdfSourceV1;
}

/** Authored Grasslands water-plane data after the terrain coordinate conversion. */
export interface GrasslandsTerrainWaterLayoutSpec {
  readonly position: readonly [x: number, y: number, z: number];
  readonly sizeXZ: readonly [width: number, height: number];
  readonly region: {
    readonly resolution: readonly [width: number, height: number];
    readonly wetThreshold: number;
    readonly closeIsolatedHoles: boolean;
    readonly componentPolicy: "largest";
    readonly maximumRepairRatio: number;
  };
  readonly spatialFields: GrasslandsTerrainWaterSpatialFieldSourcesV1;
}

/** World bounds occupied by the generated Heightfield water surface. */
export interface GrasslandsTerrainWaterBounds {
  readonly minimum: readonly [x: number, y: number, z: number];
  readonly maximum: readonly [x: number, y: number, z: number];
}

/**
 * Creates the terrain-sized Heightfield descriptor while retaining the
 * approved Grasslands showcase material, quality, and no-wave contract.
 */
export function createGrasslandsTerrainWaterDescriptor(
  spec: GrasslandsTerrainWaterLayoutSpec,
  region: WaterRegionMaskV1
): HeightfieldWaterDescriptorV1 {
  requireFiniteTuple(spec.position, "position");
  requirePositiveTuple(spec.sizeXZ, "sizeXZ");
  requireGrid(spec.region.resolution);
  requireMatchingRegion(spec, region);
  const decodedSpatialFields = decodeWaterSpatialFieldSources(spec.spatialFields);
  if (!decodedSpatialFields.valid || !decodedSpatialFields.value) {
    const first = decodedSpatialFields.diagnostics[0];
    throw new Error(
      first
        ? `Grasslands Water spatial fields are invalid at ${first.path}: ${first.message}`
        : "Grasslands Water spatial fields are invalid."
    );
  }
  const bathymetrySource = decodedSpatialFields.value.bathymetry;
  if (
    bathymetrySource?.kind !== WaterBathymetrySourceKind.ShoreDistanceProfile &&
    bathymetrySource?.kind !== WaterBathymetrySourceKind.TerrainBedSamples
  ) {
    throw new Error("Grasslands Water requires either a shore-distance profile or detached Terrain bed samples.");
  }
  if (decodedSpatialFields.value.shoreSdf?.kind !== WaterShoreSdfSourceKind.WetMask) {
    throw new Error("Grasslands Water currently requires an explicit wet-mask shore SDF source.");
  }
  const bathymetry = WaterRegionBathymetryCompiler.compile(region, bathymetrySource);

  return attachLakeGridBoundary({
    schemaVersion: HeightfieldWaterSchemaVersion.V1,
    id: TERRAIN_GRASSLANDS_WATER_DESCRIPTOR_ID,
    grid: bathymetry.grid,
    wetTexelIndices: bathymetry.wetTexelIndices,
    surfaceHeights: bathymetry.surfaceHeights,
    bedHeights: bathymetry.bedHeights,
    flowVectorsXZ: bathymetry.flowVectorsXZ,
    waveAsset: {
      schemaVersion: WaterWaveSchemaVersion.V1,
      model: WaterWaveModel.None
    },
    quality: WaterQualityTier.High,
    surfaceMotion: LAKE_WATER_SURFACE_MOTION,
    spatialField: LAKE_WATER_SPATIAL_FIELD
  });
}

/** Resolves the exact authored plane bounds used by diagnostics and tests. */
export function resolveGrasslandsTerrainWaterBounds(
  spec: GrasslandsTerrainWaterLayoutSpec
): GrasslandsTerrainWaterBounds {
  requireFiniteTuple(spec.position, "position");
  requirePositiveTuple(spec.sizeXZ, "sizeXZ");
  const halfSizeX = spec.sizeXZ[0] * 0.5;
  const halfSizeZ = spec.sizeXZ[1] * 0.5;
  return Object.freeze({
    minimum: Object.freeze([spec.position[0] - halfSizeX, spec.position[1], spec.position[2] - halfSizeZ] as const),
    maximum: Object.freeze([spec.position[0] + halfSizeX, spec.position[1], spec.position[2] + halfSizeZ] as const)
  });
}

function requireFiniteTuple(values: readonly number[], label: string): void {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`Terrain Grasslands water ${label} must contain finite values.`);
  }
}

function requirePositiveTuple(values: readonly number[], label: string): void {
  requireFiniteTuple(values, label);
  if (values.some((value) => value <= 0)) {
    throw new RangeError(`Terrain Grasslands water ${label} must contain positive values.`);
  }
}

function requireGrid(grid: readonly [width: number, height: number]): void {
  requirePositiveTuple(grid, "grid");
  if (grid.some((value) => !Number.isInteger(value) || value > 65535)) {
    throw new RangeError("Terrain Grasslands water grid dimensions must be integers in [1, 65535].");
  }
  if (grid[0] * grid[1] > 0xffff_ffff) {
    throw new RangeError("Terrain Grasslands water grid must address at most uint32 texels.");
  }
}

function requireMatchingRegion(spec: GrasslandsTerrainWaterLayoutSpec, region: WaterRegionMaskV1): void {
  const bounds = resolveGrasslandsTerrainWaterBounds(spec);
  const expectedMinimum = [bounds.minimum[0], bounds.minimum[2]] as const;
  const expectedMaximum = [bounds.maximum[0], bounds.maximum[2]] as const;
  const actualValues = [
    region.bounds.minimumXZ[0],
    region.bounds.minimumXZ[1],
    region.bounds.maximumXZ[0],
    region.bounds.maximumXZ[1],
    region.waterLevel
  ];
  const expectedValues = [
    expectedMinimum[0],
    expectedMinimum[1],
    expectedMaximum[0],
    expectedMaximum[1],
    spec.position[1]
  ];
  if (
    region.resolution[0] !== spec.region.resolution[0] ||
    region.resolution[1] !== spec.region.resolution[1] ||
    actualValues.some((value, index) => Math.abs(value - expectedValues[index]) > 1e-6)
  ) {
    throw new Error("Grasslands water region does not match the authored Plane bounds, level, and resolution.");
  }
}
