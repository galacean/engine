import { compileHeightfieldWaterShoreDistances } from "./HeightfieldWaterShoreDistanceCompiler";
/** Converts a terrain-provided binary water region into Water-owned bathymetry. */
import {
  WaterBathymetrySourceKind,
  WaterSpatialFieldSourceSchemaVersion,
  type WaterBathymetrySourceV1
} from "../../authoring/body/WaterBodyAuthoringTypes";
import { computeTerrainBedSamplesContentHash } from "../../authoring/body/WaterSpatialFieldSourceHash";
import {
  WaterRegionSchemaVersion,
  type CompiledWaterRegionBathymetryV1,
  type WaterRegionMaskV1
} from "../../authoring/heightfield/WaterRegionTypes";
import { hashStableValue } from "../shared/determinism";

export { computeTerrainBedSamplesContentHash } from "../../authoring/body/WaterSpatialFieldSourceHash";

const MAX_REGION_EDGE = 4096;

export type WaterRegionHashInput = Pick<
  WaterRegionMaskV1,
  "schemaVersion" | "id" | "bounds" | "waterLevel" | "resolution" | "wetMask"
>;

/** Hashes the complete binary region without retaining or serializing dry texels. */
export function hashWaterRegionMask(input: WaterRegionHashInput): string {
  const wetTexelIndices: number[] = [];
  for (let index = 0; index < input.wetMask.length; index++) {
    if (input.wetMask[index] === 1) wetTexelIndices.push(index);
  }
  return hashStableValue({
    schemaVersion: input.schemaVersion,
    id: input.id,
    bounds: input.bounds,
    waterLevel: input.waterLevel,
    resolution: input.resolution,
    wetTexelIndices
  });
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

function requirePositive(value: number, label: string): void {
  requireFinite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be greater than zero.`);
}

function validateRegion(region: WaterRegionMaskV1): void {
  if (region.schemaVersion !== WaterRegionSchemaVersion.V1) {
    throw new Error(`Unsupported water region schema ${String(region.schemaVersion)}.`);
  }
  if (typeof region.id !== "string" || region.id.trim().length === 0) {
    throw new Error("Water region id must be a non-empty string.");
  }
  const [width, height] = region.resolution;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_REGION_EDGE ||
    height > MAX_REGION_EDGE
  ) {
    throw new RangeError(`Water region resolution must contain integer edges in [1, ${MAX_REGION_EDGE}].`);
  }
  if (region.wetMask.length !== width * height) {
    throw new RangeError(`Water region mask has ${region.wetMask.length} texels; expected ${width * height}.`);
  }
  requireFinite(region.waterLevel, "Water region level");
  const values = [...region.bounds.minimumXZ, ...region.bounds.maximumXZ];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Water region bounds must be finite.");
  }
  if (
    region.bounds.maximumXZ[0] <= region.bounds.minimumXZ[0] ||
    region.bounds.maximumXZ[1] <= region.bounds.minimumXZ[1]
  ) {
    throw new RangeError("Water region bounds must have positive XZ extents.");
  }
  for (let index = 0; index < region.wetMask.length; index++) {
    const value = region.wetMask[index];
    if (value !== 0 && value !== 1) {
      throw new RangeError(`Water region mask texel ${index} must be 0 or 1.`);
    }
  }
  if (hashWaterRegionMask(region) !== region.contentHash) {
    throw new Error("Water region content hash does not match its mask and spatial metadata.");
  }
}

function validateBedHeight(
  bedHeight: number,
  region: WaterRegionMaskV1,
  maximumDepth: number,
  sampleIndex: number
): number {
  requireFinite(bedHeight, `Water bed height sample ${sampleIndex}`);
  const depth = region.waterLevel - bedHeight;
  if (depth < 0) {
    throw new RangeError(`Water bed height sample ${sampleIndex} is above the water surface.`);
  }
  if (depth > maximumDepth) {
    throw new RangeError(`Water bed height sample ${sampleIndex} exceeds maximum depth ${maximumDepth}.`);
  }
  return depth;
}

function validateBathymetrySource(
  source: WaterBathymetrySourceV1,
  region: WaterRegionMaskV1,
  wetTexelIndices: readonly number[]
): void {
  if (source.schemaVersion !== WaterSpatialFieldSourceSchemaVersion.V1) {
    throw new Error(`Unsupported Water bathymetry schema ${String(source.schemaVersion)}.`);
  }
  requirePositive(source.maximumDepth, "Water maximum depth");
  switch (source.kind) {
    case WaterBathymetrySourceKind.ShoreDistanceProfile:
      requireFinite(source.edgeDepth, "Water edge depth");
      requirePositive(source.channelDepth, "Water channel depth");
      requirePositive(source.deepBandMeters, "Water deep-band distance");
      requirePositive(source.profileExponent, "Water bathymetry profile exponent");
      if (source.edgeDepth < 0) {
        throw new RangeError("Water edge depth must be non-negative.");
      }
      if (source.edgeDepth > source.channelDepth) {
        throw new RangeError("Water edge depth must not exceed channel depth.");
      }
      if (source.channelDepth > source.maximumDepth) {
        throw new RangeError("Water channel depth must not exceed maximum depth.");
      }
      return;
    case WaterBathymetrySourceKind.ExplicitBedHeights:
      if (source.sampleOrder !== "source-wet-texel-order") {
        throw new Error("Explicit Water bed heights require source-wet-texel-order.");
      }
      if (source.bedHeights.length !== wetTexelIndices.length) {
        throw new RangeError(
          `Explicit Water bed heights contain ${source.bedHeights.length} samples; expected ${wetTexelIndices.length}.`
        );
      }
      for (let index = 0; index < source.bedHeights.length; index++) {
        validateBedHeight(source.bedHeights[index], region, source.maximumDepth, index);
      }
      return;
    case WaterBathymetrySourceKind.TerrainBedSamples: {
      if (source.sampleOrder !== "row-major-region-grid") {
        throw new Error("Detached Terrain bed samples require row-major-region-grid order.");
      }
      if (source.resolution[0] !== region.resolution[0] || source.resolution[1] !== region.resolution[1]) {
        throw new RangeError("Detached Terrain bed-sample resolution must match the Water region.");
      }
      const expectedCount = region.resolution[0] * region.resolution[1];
      if (source.bedHeights.length !== expectedCount) {
        throw new RangeError(
          `Detached Terrain bed samples contain ${source.bedHeights.length} values; expected ${expectedCount}.`
        );
      }
      if (computeTerrainBedSamplesContentHash(source) !== source.contentHash) {
        throw new Error("Detached Terrain bed-sample content hash does not match its serialized grid.");
      }
      for (let index = 0; index < source.bedHeights.length; index++) {
        requireFinite(source.bedHeights[index], `Detached Terrain bed height sample ${index}`);
      }
      for (const texelIndex of wetTexelIndices) {
        validateBedHeight(source.bedHeights[texelIndex], region, source.maximumDepth, texelIndex);
      }
      return;
    }
  }
}

function smoothstep01(value: number): number {
  const saturated = Math.max(0, Math.min(1, value));
  return saturated * saturated * (3 - 2 * saturated);
}

export class WaterRegionBathymetryCompiler {
  private constructor() {}

  static compile(region: WaterRegionMaskV1, source: WaterBathymetrySourceV1): CompiledWaterRegionBathymetryV1 {
    validateRegion(region);
    const [width, height] = region.resolution;
    const worldWidth = region.bounds.maximumXZ[0] - region.bounds.minimumXZ[0];
    const worldHeight = region.bounds.maximumXZ[1] - region.bounds.minimumXZ[1];
    const cellSizeX = worldWidth / width;
    const cellSizeZ = worldHeight / height;
    const signedShoreDistances = compileHeightfieldWaterShoreDistances(region.wetMask, {
      originXZ: [0, 0],
      width,
      height,
      cellSizeXZ: [cellSizeX, cellSizeZ]
    });
    const wetTexelIndices: number[] = [];
    for (let index = 0; index < region.wetMask.length; index++) {
      if (region.wetMask[index] === 1) wetTexelIndices.push(index);
    }
    if (wetTexelIndices.length === 0) throw new Error("Water region contains no wet texels.");
    validateBathymetrySource(source, region, wetTexelIndices);

    const surfaceHeights = new Float32Array(wetTexelIndices.length);
    const bedHeights = new Float32Array(wetTexelIndices.length);
    const shoreDistances = new Float32Array(wetTexelIndices.length);
    const flowVectorsXZ = new Float32Array(wetTexelIndices.length * 2);
    let minimumDepth = Number.POSITIVE_INFINITY;
    let maximumDepth = 0;
    for (let ordinal = 0; ordinal < wetTexelIndices.length; ordinal++) {
      const texelIndex = wetTexelIndices[ordinal];
      const shoreDistance = signedShoreDistances[texelIndex];
      let bedHeight: number;
      let depth: number;
      switch (source.kind) {
        case WaterBathymetrySourceKind.ShoreDistanceProfile: {
          const normalizedDistance = Math.max(0, Math.min(1, shoreDistance / source.deepBandMeters));
          const profile = Math.pow(smoothstep01(normalizedDistance), source.profileExponent);
          const requestedDepth = source.edgeDepth + (source.channelDepth - source.edgeDepth) * profile;
          depth = Math.max(0, Math.min(source.maximumDepth, requestedDepth));
          bedHeight = region.waterLevel - depth;
          break;
        }
        case WaterBathymetrySourceKind.ExplicitBedHeights:
          bedHeight = source.bedHeights[ordinal];
          depth = validateBedHeight(bedHeight, region, source.maximumDepth, ordinal);
          break;
        case WaterBathymetrySourceKind.TerrainBedSamples:
          bedHeight = source.bedHeights[texelIndex];
          depth = validateBedHeight(bedHeight, region, source.maximumDepth, texelIndex);
          break;
      }
      surfaceHeights[ordinal] = region.waterLevel;
      bedHeights[ordinal] = bedHeight;
      shoreDistances[ordinal] = shoreDistance;
      minimumDepth = Math.min(minimumDepth, depth);
      maximumDepth = Math.max(maximumDepth, depth);
    }

    return Object.freeze({
      grid: Object.freeze({
        originXZ: Object.freeze([
          region.bounds.minimumXZ[0] + cellSizeX * 0.5,
          region.bounds.minimumXZ[1] + cellSizeZ * 0.5
        ] as const),
        cellSizeXZ: Object.freeze([cellSizeX, cellSizeZ] as const),
        width,
        height
      }),
      wetTexelIndices: Uint32Array.from(wetTexelIndices),
      surfaceHeights,
      bedHeights,
      flowVectorsXZ,
      shoreDistances,
      minimumDepth,
      maximumDepth
    });
  }
}
