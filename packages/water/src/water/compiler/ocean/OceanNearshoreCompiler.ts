/** Deterministic render compiler for Ocean bathymetry, wet coverage, and shore SDF. */
import {
  OceanNearshoreDiagnosticCode,
  OceanNearshoreDiagnosticSeverity,
  OceanNearshoreOutsidePolicy,
  type OceanNearshoreGridConfig,
  type OceanNearshoreOutsidePolicies,
  type ValidatedOceanNearshoreDescriptor
} from "../../authoring/ocean/OceanNearshoreTypes";
import { hashStableValue } from "../shared/determinism";
import { WaterBufferOwnership } from "../shared/WaterBufferOwnership";
import type {
  OceanNearshoreCompileResult,
  OceanNearshoreCompileStats,
  OceanNearshoreCompiledData,
  OceanNearshoreStaticAtlas
} from "./OceanNearshoreCompiledTypes";
import { OceanNearshoreReadonlyUint8Buffer } from "./OceanNearshoreNumericBuffer";
import { validateOceanNearshoreDescriptor } from "./OceanNearshoreValidator";
import {
  OCEAN_NEARSHORE_COMPILER_VERSION,
  OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH,
  OCEAN_NEARSHORE_GPU_SHORE_DISTANCE_RANGE_MAXIMUM_METRES
} from "./constants";

const CHANNEL_COUNT = 4;
const SIGNED_ZERO = 128;
const SIGNED_RANGE = 127;
const WET_MINIMUM_CODE = 129;

function outsideMatchesTarget(policy: OceanNearshoreOutsidePolicy, targetWet: boolean): boolean {
  return targetWet ? policy === OceanNearshoreOutsidePolicy.DeepOcean : policy === OceanNearshoreOutsidePolicy.Dry;
}

function seedBoundaryDistance(
  distances: Float64Array,
  grid: Readonly<OceanNearshoreGridConfig>,
  outside: Readonly<OceanNearshoreOutsidePolicies>,
  targetWet: boolean
): void {
  const { width, height, cellSizeXZ } = grid;
  if (outsideMatchesTarget(outside.negativeX, targetWet)) {
    for (let z = 0; z < height; z++) distances[z * width] = Math.min(distances[z * width]!, cellSizeXZ[0] * 0.5);
  }
  if (outsideMatchesTarget(outside.positiveX, targetWet)) {
    for (let z = 0; z < height; z++) {
      const index = z * width + width - 1;
      distances[index] = Math.min(distances[index]!, cellSizeXZ[0] * 0.5);
    }
  }
  if (outsideMatchesTarget(outside.negativeZ, targetWet)) {
    for (let x = 0; x < width; x++) distances[x] = Math.min(distances[x]!, cellSizeXZ[1] * 0.5);
  }
  if (outsideMatchesTarget(outside.positiveZ, targetWet)) {
    const row = (height - 1) * width;
    for (let x = 0; x < width; x++) distances[row + x] = Math.min(distances[row + x]!, cellSizeXZ[1] * 0.5);
  }
}

function relax(distances: Float64Array, index: number, neighbor: number, weight: number): void {
  const candidate = distances[neighbor]! + weight;
  if (candidate < distances[index]!) distances[index] = candidate;
}

/** Anisotropic eight-neighbour chamfer transform, bounded O(texels). */
function distanceToClass(
  wetMask: Uint8Array,
  grid: Readonly<OceanNearshoreGridConfig>,
  outside: Readonly<OceanNearshoreOutsidePolicies>,
  targetWet: boolean
): Float64Array {
  const { width, height, cellSizeXZ } = grid;
  const distances = new Float64Array(wetMask.length);
  const target = targetWet ? 1 : 0;
  for (let index = 0; index < distances.length; index++) {
    distances[index] = wetMask[index] === target ? 0 : Number.POSITIVE_INFINITY;
  }
  seedBoundaryDistance(distances, grid, outside, targetWet);
  const stepX = cellSizeXZ[0];
  const stepZ = cellSizeXZ[1];
  const diagonal = Math.hypot(stepX, stepZ);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const index = z * width + x;
      if (x > 0) relax(distances, index, index - 1, stepX);
      if (z > 0) {
        relax(distances, index, index - width, stepZ);
        if (x > 0) relax(distances, index, index - width - 1, diagonal);
        if (x + 1 < width) relax(distances, index, index - width + 1, diagonal);
      }
    }
  }
  for (let z = height - 1; z >= 0; z--) {
    for (let x = width - 1; x >= 0; x--) {
      const index = z * width + x;
      if (x + 1 < width) relax(distances, index, index + 1, stepX);
      if (z + 1 < height) {
        relax(distances, index, index + width, stepZ);
        if (x > 0) relax(distances, index, index + width - 1, diagonal);
        if (x + 1 < width) relax(distances, index, index + width + 1, diagonal);
      }
    }
  }
  return distances;
}

function compileWetMask(source: Readonly<ValidatedOceanNearshoreDescriptor>): Uint8Array {
  if (source.wetSource.kind === "mask") {
    // Validation proved every selected texel has legal physical depth. Preserve
    // the authored occupancy verbatim instead of silently changing authority.
    return new Uint8Array(source.wetSource.mask);
  }
  const mask = new Uint8Array(source.bedHeights.length);
  const minimumDepth = source.wetSource.minimumDepth ?? OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH;
  for (let index = 0; index < mask.length; index++) {
    mask[index] = source.waterLevel - source.bedHeights[index]! > minimumDepth ? 1 : 0;
  }
  return mask;
}

function deriveSignedShoreDistances(
  wetMask: Uint8Array,
  grid: Readonly<OceanNearshoreGridConfig>,
  outside: Readonly<OceanNearshoreOutsidePolicies>
): Float32Array {
  const toWet = distanceToClass(wetMask, grid, outside, true);
  const toDry = distanceToClass(wetMask, grid, outside, false);
  const result = new Float32Array(wetMask.length);
  const halfCell = Math.min(grid.cellSizeXZ[0], grid.cellSizeXZ[1]) * 0.5;
  const fallback = Math.max(halfCell, Math.hypot(grid.width * grid.cellSizeXZ[0], grid.height * grid.cellSizeXZ[1]));
  for (let index = 0; index < result.length; index++) {
    const distance = wetMask[index] === 1 ? toDry[index]! : toWet[index]!;
    const finite = Number.isFinite(distance) ? Math.max(halfCell, distance - halfCell) : fallback;
    result[index] = wetMask[index] === 1 ? finite : -finite;
  }
  return result;
}

function encodeSigned(value: number, scale: number): number {
  const normalized = Math.min(1, Math.max(-1, value / scale));
  let encoded = Math.round(normalized * SIGNED_RANGE + SIGNED_ZERO);
  if (value > 0) encoded = Math.max(WET_MINIMUM_CODE, encoded);
  if (value < 0) encoded = Math.min(SIGNED_ZERO - 1, encoded);
  return Math.min(255, Math.max(1, encoded));
}

function createWorldToUv(grid: Readonly<OceanNearshoreGridConfig>): readonly [number, number, number, number] {
  const scaleX = 1 / (grid.cellSizeXZ[0] * grid.width);
  const scaleZ = 1 / (grid.cellSizeXZ[1] * grid.height);
  return Object.freeze([
    scaleX,
    scaleZ,
    0.5 / grid.width - grid.originXZ[0] * scaleX,
    0.5 / grid.height - grid.originXZ[1] * scaleZ
  ] as const);
}

function compileAtlas(
  source: Readonly<ValidatedOceanNearshoreDescriptor>,
  wetMask: Uint8Array,
  shoreDistances: Float32Array
): Readonly<{ atlas: OceanNearshoreStaticAtlas; stats: OceanNearshoreCompileStats }> {
  let wetTexelCount = 0;
  let minimumBedHeight = Number.POSITIVE_INFINITY;
  let maximumBedHeight = Number.NEGATIVE_INFINITY;
  let maximumDepth = 0;
  let shoreDistanceRange = 0;
  const depths = new Float32Array(wetMask.length);
  for (let index = 0; index < wetMask.length; index++) {
    const bedHeight = source.bedHeights[index]!;
    minimumBedHeight = Math.min(minimumBedHeight, bedHeight);
    maximumBedHeight = Math.max(maximumBedHeight, bedHeight);
    if (wetMask[index] === 1) {
      wetTexelCount++;
      depths[index] = Math.max(0, source.waterLevel - bedHeight);
      maximumDepth = Math.max(maximumDepth, depths[index]!);
    }
    shoreDistanceRange = Math.max(shoreDistanceRange, Math.abs(shoreDistances[index]!));
  }
  maximumDepth = Math.max(maximumDepth, 0.0001);
  shoreDistanceRange = Math.max(
    Math.min(source.grid.cellSizeXZ[0], source.grid.cellSizeXZ[1]) * 0.5,
    Math.min(OCEAN_NEARSHORE_GPU_SHORE_DISTANCE_RANGE_MAXIMUM_METRES, shoreDistanceRange)
  );
  const pixels = new Uint8Array(wetMask.length * CHANNEL_COUNT);
  for (let index = 0; index < wetMask.length; index++) {
    const offset = index * CHANNEL_COUNT;
    pixels[offset] = wetMask[index] === 1 ? 255 : 0;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = Math.round(Math.min(1, depths[index]! / maximumDepth) * 255);
    pixels[offset + 3] = encodeSigned(shoreDistances[index]!, shoreDistanceRange);
  }
  const atlas: OceanNearshoreStaticAtlas = Object.freeze({
    width: source.grid.width,
    height: source.grid.height,
    pixels: new OceanNearshoreReadonlyUint8Buffer(pixels, WaterBufferOwnership.Transfer),
    worldToUv: createWorldToUv(source.grid),
    maximumDepth,
    shoreDistanceRange,
    wetShoreDistanceCode: WET_MINIMUM_CODE
  });
  const stats: OceanNearshoreCompileStats = Object.freeze({
    texelCount: wetMask.length,
    wetTexelCount,
    dryTexelCount: wetMask.length - wetTexelCount,
    atlasByteLength: pixels.byteLength,
    minimumBedHeight,
    maximumBedHeight,
    maximumDepth,
    shoreDistanceRange
  });
  return Object.freeze({ atlas, stats });
}

export class OceanNearshoreCompiler {
  private constructor() {}

  static compile(source: unknown): OceanNearshoreCompileResult {
    const validation = validateOceanNearshoreDescriptor(source);
    const diagnostics = [...validation.diagnostics];
    if (!validation.valid || !validation.value) {
      return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
    }
    const descriptor = validation.value;
    const wetMask = compileWetMask(descriptor);
    const shoreDistances = descriptor.signedShoreDistances
      ? new Float32Array(descriptor.signedShoreDistances)
      : deriveSignedShoreDistances(wetMask, descriptor.grid, descriptor.outsidePolicy);
    const hasDryBoundary =
      wetMask.some((value) => value === 0) ||
      Object.values(descriptor.outsidePolicy).some((policy) => policy === OceanNearshoreOutsidePolicy.Dry);
    if (!hasDryBoundary) {
      diagnostics.push({
        code: OceanNearshoreDiagnosticCode.NoShoreBoundary,
        severity: OceanNearshoreDiagnosticSeverity.Warning,
        path: "$.wetSource",
        message: "No dry texel or dry outside edge exists; shoreline effects remain inactive."
      });
    }
    const { atlas, stats } = compileAtlas(descriptor, wetMask, shoreDistances);
    const sourceHash = hashStableValue({
      compilerVersion: OCEAN_NEARSHORE_COMPILER_VERSION,
      schemaVersion: descriptor.schemaVersion,
      id: descriptor.id,
      waterLevel: descriptor.waterLevel,
      grid: descriptor.grid,
      bedHeights: Array.from(descriptor.bedHeights),
      signedShoreDistances: Array.from(shoreDistances),
      wetMask: Array.from(wetMask),
      outsidePolicy: descriptor.outsidePolicy
    });
    const compiledHash = hashStableValue({
      compilerVersion: OCEAN_NEARSHORE_COMPILER_VERSION,
      sourceHash,
      atlas: {
        width: atlas.width,
        height: atlas.height,
        maximumDepth: atlas.maximumDepth,
        shoreDistanceRange: atlas.shoreDistanceRange,
        pixels: Array.from(atlas.pixels)
      }
    });
    const data: OceanNearshoreCompiledData = Object.freeze({
      schemaVersion: descriptor.schemaVersion,
      sourceId: descriptor.id,
      sourceHash,
      compiledHash,
      grid: descriptor.grid,
      waterLevel: descriptor.waterLevel,
      outsidePolicy: descriptor.outsidePolicy,
      staticAtlas: atlas,
      diagnostics: Object.freeze(diagnostics),
      stats
    });
    return Object.freeze({ valid: true, data, diagnostics: data.diagnostics });
  }
}
