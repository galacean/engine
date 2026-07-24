/** Deterministic compiler for the bounded field attached to the unbounded Ocean. */
import {
  OceanNearshoreDiagnosticCode,
  OceanNearshoreDiagnosticSeverity,
  OceanNearshoreOutsidePolicy,
  type OceanNearshoreDiagnostic,
  type OceanNearshoreGridConfig,
  type OceanNearshoreOutsidePolicies,
  type ValidatedOceanNearshoreDescriptor
} from "../../authoring/ocean/OceanNearshoreTypes";
import { hashStableValue } from "../shared/determinism";
import type {
  OceanNearshoreCompileResult,
  OceanNearshoreCompileStats,
  OceanNearshoreCompiledData,
  OceanNearshoreQueryGrid,
  OceanNearshoreStaticAtlas
} from "./OceanNearshoreCompiledTypes";
import {
  OceanNearshoreReadonlyFloat32Buffer,
  OceanNearshoreReadonlyUint8Buffer
} from "./OceanNearshoreNumericBuffer";
import { compileOceanObstacleField } from "./OceanObstacleFieldCompiler";
import { validateOceanNearshoreDescriptor } from "./OceanNearshoreValidator";
import {
  OCEAN_NEARSHORE_COMPILER_VERSION,
  OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH
} from "./constants";

const ATLAS_CHANNEL_COUNT = 4;
const SIGNED_CHANNEL_ZERO = 128;
const SIGNED_CHANNEL_RANGE = 127;
const WET_SIGNED_DISTANCE_MINIMUM_CODE = 129;

function outsideMatchesTarget(
  policy: OceanNearshoreOutsidePolicy,
  targetWet: boolean
): boolean {
  return targetWet
    ? policy === OceanNearshoreOutsidePolicy.DeepOcean
    : policy === OceanNearshoreOutsidePolicy.Dry;
}

function seedBoundaryDistance(
  distances: Float64Array,
  grid: Readonly<OceanNearshoreGridConfig>,
  outsidePolicy: Readonly<OceanNearshoreOutsidePolicies>,
  targetWet: boolean
): void {
  const { width, height, cellSizeXZ } = grid;
  if (outsideMatchesTarget(outsidePolicy.negativeX, targetWet)) {
    for (let z = 0; z < height; z++) {
      const index = z * width;
      distances[index] = Math.min(distances[index], cellSizeXZ[0] * 0.5);
    }
  }
  if (outsideMatchesTarget(outsidePolicy.positiveX, targetWet)) {
    for (let z = 0; z < height; z++) {
      const index = z * width + width - 1;
      distances[index] = Math.min(distances[index], cellSizeXZ[0] * 0.5);
    }
  }
  if (outsideMatchesTarget(outsidePolicy.negativeZ, targetWet)) {
    for (let x = 0; x < width; x++) {
      distances[x] = Math.min(distances[x], cellSizeXZ[1] * 0.5);
    }
  }
  if (outsideMatchesTarget(outsidePolicy.positiveZ, targetWet)) {
    const row = (height - 1) * width;
    for (let x = 0; x < width; x++) {
      const index = row + x;
      distances[index] = Math.min(distances[index], cellSizeXZ[1] * 0.5);
    }
  }
}

function relaxDistance(
  distances: Float64Array,
  index: number,
  neighborIndex: number,
  weight: number
): void {
  const candidate = distances[neighborIndex] + weight;
  if (candidate < distances[index]) distances[index] = candidate;
}

/**
 * Deterministic anisotropic eight-neighbour chamfer transform.
 * It is bounded O(texels), conservative, and sufficient for the authored SDF/normal field.
 */
function computeDistanceToClass(
  wetMask: Uint8Array,
  grid: Readonly<OceanNearshoreGridConfig>,
  outsidePolicy: Readonly<OceanNearshoreOutsidePolicies>,
  targetWet: boolean
): Float64Array {
  const { width, height, cellSizeXZ } = grid;
  const distances = new Float64Array(wetMask.length);
  const target = targetWet ? 1 : 0;
  for (let index = 0; index < wetMask.length; index++) {
    distances[index] = wetMask[index] === target ? 0 : Number.POSITIVE_INFINITY;
  }
  seedBoundaryDistance(distances, grid, outsidePolicy, targetWet);
  const stepX = cellSizeXZ[0];
  const stepZ = cellSizeXZ[1];
  const diagonal = Math.hypot(stepX, stepZ);

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const index = z * width + x;
      if (x > 0) relaxDistance(distances, index, index - 1, stepX);
      if (z > 0) {
        relaxDistance(distances, index, index - width, stepZ);
        if (x > 0) relaxDistance(distances, index, index - width - 1, diagonal);
        if (x + 1 < width) {
          relaxDistance(distances, index, index - width + 1, diagonal);
        }
      }
    }
  }
  for (let z = height - 1; z >= 0; z--) {
    for (let x = width - 1; x >= 0; x--) {
      const index = z * width + x;
      if (x + 1 < width) relaxDistance(distances, index, index + 1, stepX);
      if (z + 1 < height) {
        relaxDistance(distances, index, index + width, stepZ);
        if (x > 0) relaxDistance(distances, index, index + width - 1, diagonal);
        if (x + 1 < width) {
          relaxDistance(distances, index, index + width + 1, diagonal);
        }
      }
    }
  }
  return distances;
}

function compileWetMask(descriptor: ValidatedOceanNearshoreDescriptor): Uint8Array {
  const wetMask = new Uint8Array(descriptor.bedHeights.length);
  const minimumDepth =
    descriptor.wetSource.minimumDepth ?? OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH;
  for (let index = 0; index < wetMask.length; index++) {
    const sourceWet =
      descriptor.wetSource.kind === "water-level" ||
      descriptor.wetSource.mask[index] === 1;
    wetMask[index] =
      sourceWet && descriptor.waterLevel - descriptor.bedHeights[index] > minimumDepth
        ? 1
        : 0;
  }
  return wetMask;
}

function compileSignedShoreDistance(
  wetMask: Uint8Array,
  grid: Readonly<OceanNearshoreGridConfig>,
  outsidePolicy: Readonly<OceanNearshoreOutsidePolicies>
): Float32Array {
  const distanceToWet = computeDistanceToClass(wetMask, grid, outsidePolicy, true);
  const distanceToDry = computeDistanceToClass(wetMask, grid, outsidePolicy, false);
  const signed = new Float32Array(wetMask.length);
  const halfCell = Math.min(grid.cellSizeXZ[0], grid.cellSizeXZ[1]) * 0.5;
  const fallbackDistance = Math.max(
    halfCell,
    Math.hypot(
      grid.width * grid.cellSizeXZ[0],
      grid.height * grid.cellSizeXZ[1]
    )
  );
  for (let index = 0; index < signed.length; index++) {
    const distance = wetMask[index] === 1 ? distanceToDry[index] : distanceToWet[index];
    const finiteDistance = Number.isFinite(distance)
      ? Math.max(halfCell, distance - halfCell)
      : fallbackDistance;
    signed[index] = wetMask[index] === 1 ? finiteDistance : -finiteDistance;
  }
  return signed;
}

function shoreDistanceAt(
  distances: Float32Array,
  width: number,
  height: number,
  x: number,
  z: number
): number {
  const clampedX = Math.min(width - 1, Math.max(0, x));
  const clampedZ = Math.min(height - 1, Math.max(0, z));
  return distances[clampedZ * width + clampedX];
}

function compileShoreNormals(
  shoreDistances: Float32Array,
  grid: Readonly<OceanNearshoreGridConfig>
): Float32Array {
  const { width, height, cellSizeXZ } = grid;
  const normals = new Float32Array(shoreDistances.length * 2);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const index = z * width + x;
      const gradientX =
        (shoreDistanceAt(shoreDistances, width, height, x + 1, z) -
          shoreDistanceAt(shoreDistances, width, height, x - 1, z)) /
        ((x > 0 && x + 1 < width ? 2 : 1) * cellSizeXZ[0]);
      const gradientZ =
        (shoreDistanceAt(shoreDistances, width, height, x, z + 1) -
          shoreDistanceAt(shoreDistances, width, height, x, z - 1)) /
        ((z > 0 && z + 1 < height ? 2 : 1) * cellSizeXZ[1]);
      const length = Math.hypot(gradientX, gradientZ);
      if (length > 1e-8) {
        // Signed distance is positive in water, so -gradient points toward dry land.
        normals[index * 2] = -gradientX / length;
        normals[index * 2 + 1] = -gradientZ / length;
      }
    }
  }
  return normals;
}

function encodeSigned(value: number, scale: number, preserveSign: boolean): number {
  const normalized = Math.min(1, Math.max(-1, value / scale));
  let encoded = Math.round(normalized * SIGNED_CHANNEL_RANGE + SIGNED_CHANNEL_ZERO);
  if (preserveSign && value > 0) encoded = Math.max(WET_SIGNED_DISTANCE_MINIMUM_CODE, encoded);
  if (preserveSign && value < 0) encoded = Math.min(SIGNED_CHANNEL_ZERO - 1, encoded);
  return Math.min(255, Math.max(1, encoded));
}

function createWorldToUv(
  grid: Readonly<OceanNearshoreGridConfig>
): readonly [number, number, number, number] {
  const scaleX = 1 / (grid.cellSizeXZ[0] * grid.width);
  const scaleZ = 1 / (grid.cellSizeXZ[1] * grid.height);
  return Object.freeze([
    scaleX,
    scaleZ,
    0.5 / grid.width - grid.originXZ[0] * scaleX,
    0.5 / grid.height - grid.originXZ[1] * scaleZ
  ] as const);
}

function compilePhysicalFields(
  descriptor: ValidatedOceanNearshoreDescriptor,
  wetMask: Uint8Array,
  shoreDistances: Float32Array
): {
  readonly waterDepths: Float32Array;
  readonly shoreNormalsXZ: Float32Array;
  readonly baseCurrentsXZ: Float32Array;
  readonly atlas: OceanNearshoreStaticAtlas;
  readonly stats: Omit<
    OceanNearshoreCompileStats,
    "obstacleCount" | "queryByteLength"
  >;
} {
  const texelCount = wetMask.length;
  const waterDepths = new Float32Array(texelCount);
  const baseCurrentsXZ = new Float32Array(descriptor.baseCurrentsXZ);
  let wetTexelCount = 0;
  let minimumBedHeight = Number.POSITIVE_INFINITY;
  let maximumBedHeight = Number.NEGATIVE_INFINITY;
  let maximumDepth = 0;
  let maximumCurrentSpeed = 0;
  let maximumCurrentComponent = 0;
  let shoreDistanceRange = 0;
  for (let index = 0; index < texelCount; index++) {
    const bedHeight = descriptor.bedHeights[index];
    minimumBedHeight = Math.min(minimumBedHeight, bedHeight);
    maximumBedHeight = Math.max(maximumBedHeight, bedHeight);
    if (wetMask[index] === 1) {
      wetTexelCount++;
      waterDepths[index] = Math.max(0, descriptor.waterLevel - bedHeight);
      maximumDepth = Math.max(maximumDepth, waterDepths[index]);
    } else {
      baseCurrentsXZ[index * 2] = 0;
      baseCurrentsXZ[index * 2 + 1] = 0;
    }
    const currentX = baseCurrentsXZ[index * 2];
    const currentZ = baseCurrentsXZ[index * 2 + 1];
    maximumCurrentSpeed = Math.max(
      maximumCurrentSpeed,
      Math.hypot(currentX, currentZ)
    );
    maximumCurrentComponent = Math.max(
      maximumCurrentComponent,
      Math.abs(currentX),
      Math.abs(currentZ)
    );
    shoreDistanceRange = Math.max(
      shoreDistanceRange,
      Math.abs(shoreDistances[index])
    );
  }
  const currentDecodeScale = Math.max(1, maximumCurrentComponent);
  shoreDistanceRange = Math.max(
    Math.min(descriptor.grid.cellSizeXZ[0], descriptor.grid.cellSizeXZ[1]) * 0.5,
    shoreDistanceRange
  );
  const pixels = new Uint8Array(texelCount * ATLAS_CHANNEL_COUNT);
  for (let index = 0; index < texelCount; index++) {
    const offset = index * ATLAS_CHANNEL_COUNT;
    pixels[offset] = encodeSigned(
      baseCurrentsXZ[index * 2],
      currentDecodeScale,
      false
    );
    pixels[offset + 1] = encodeSigned(
      baseCurrentsXZ[index * 2 + 1],
      currentDecodeScale,
      false
    );
    pixels[offset + 2] = Math.round(
      Math.min(1, Math.max(0, waterDepths[index] / maximumDepth)) * 255
    );
    pixels[offset + 3] = encodeSigned(
      shoreDistances[index],
      shoreDistanceRange,
      true
    );
  }
  const shoreNormalsXZ = compileShoreNormals(shoreDistances, descriptor.grid);
  const atlas: OceanNearshoreStaticAtlas = Object.freeze({
    width: descriptor.grid.width,
    height: descriptor.grid.height,
    pixels: new OceanNearshoreReadonlyUint8Buffer(pixels),
    worldToUv: createWorldToUv(descriptor.grid),
    currentDecodeScale,
    maximumDepth,
    shoreDistanceRange,
    wetShoreDistanceCode: WET_SIGNED_DISTANCE_MINIMUM_CODE
  });
  return {
    waterDepths,
    shoreNormalsXZ,
    baseCurrentsXZ,
    atlas,
    stats: Object.freeze({
      texelCount,
      wetTexelCount,
      dryTexelCount: texelCount - wetTexelCount,
      atlasByteLength: pixels.byteLength,
      minimumBedHeight,
      maximumBedHeight,
      maximumDepth,
      maximumCurrentSpeed,
      shoreDistanceRange
    })
  };
}

function hasShoreBoundary(
  wetMask: Uint8Array,
  grid: Readonly<OceanNearshoreGridConfig>,
  outsidePolicy: Readonly<OceanNearshoreOutsidePolicies>
): boolean {
  if (wetMask.some((value) => value === 0)) return true;
  return (
    outsidePolicy.negativeX === OceanNearshoreOutsidePolicy.Dry ||
    outsidePolicy.positiveX === OceanNearshoreOutsidePolicy.Dry ||
    outsidePolicy.negativeZ === OceanNearshoreOutsidePolicy.Dry ||
    outsidePolicy.positiveZ === OceanNearshoreOutsidePolicy.Dry
  );
}

export class OceanNearshoreCompiler {
  private constructor() {}

  static compile(source: unknown): OceanNearshoreCompileResult {
    const validation = validateOceanNearshoreDescriptor(source);
    const diagnostics = [...validation.diagnostics];
    if (!validation.valid || !validation.value) {
      return Object.freeze({
        valid: false,
        diagnostics: Object.freeze(diagnostics)
      });
    }
    const descriptor = validation.value;
    const wetMask = compileWetMask(descriptor);
    if (!hasShoreBoundary(wetMask, descriptor.grid, descriptor.outsidePolicy)) {
      diagnostics.push({
        code: OceanNearshoreDiagnosticCode.NoShoreBoundary,
        severity: OceanNearshoreDiagnosticSeverity.Warning,
        path: "$.wetSource",
        message:
          "No dry texel or dry outside edge exists; the field behaves as a deep-ocean modifier without a shoreline."
      });
    }
    const shoreDistances = compileSignedShoreDistance(
      wetMask,
      descriptor.grid,
      descriptor.outsidePolicy
    );
    const fields = compilePhysicalFields(descriptor, wetMask, shoreDistances);
    const obstacles = compileOceanObstacleField(descriptor.obstacles);
    const queryGrid: OceanNearshoreQueryGrid = Object.freeze({
      grid: descriptor.grid,
      waterLevel: descriptor.waterLevel,
      wetMask: new OceanNearshoreReadonlyUint8Buffer(wetMask),
      bedHeights: new OceanNearshoreReadonlyFloat32Buffer(descriptor.bedHeights),
      waterDepths: new OceanNearshoreReadonlyFloat32Buffer(fields.waterDepths),
      shoreDistances: new OceanNearshoreReadonlyFloat32Buffer(shoreDistances),
      shoreNormalsXZ: new OceanNearshoreReadonlyFloat32Buffer(
        fields.shoreNormalsXZ
      ),
      baseCurrentsXZ: new OceanNearshoreReadonlyFloat32Buffer(
        fields.baseCurrentsXZ
      )
    });
    const queryByteLength =
      wetMask.byteLength +
      descriptor.bedHeights.byteLength +
      fields.waterDepths.byteLength +
      shoreDistances.byteLength +
      fields.shoreNormalsXZ.byteLength +
      fields.baseCurrentsXZ.byteLength;
    const stats: OceanNearshoreCompileStats = Object.freeze({
      ...fields.stats,
      obstacleCount: obstacles.length,
      queryByteLength
    });
    const sourceHash = hashStableValue({
      compilerVersion: OCEAN_NEARSHORE_COMPILER_VERSION,
      schemaVersion: descriptor.schemaVersion,
      id: descriptor.id,
      waterLevel: descriptor.waterLevel,
      grid: descriptor.grid,
      bedHeights: Array.from(descriptor.bedHeights),
      baseCurrentsXZ: Array.from(descriptor.baseCurrentsXZ),
      wetSource:
        descriptor.wetSource.kind === "mask"
          ? {
              ...descriptor.wetSource,
              mask: Array.from(descriptor.wetSource.mask)
            }
          : descriptor.wetSource,
      outsidePolicy: descriptor.outsidePolicy,
      obstacles: descriptor.obstacles,
      budget: descriptor.budget
    });
    const frozenDiagnostics = Object.freeze(diagnostics);
    const data: OceanNearshoreCompiledData = Object.freeze({
      schemaVersion: descriptor.schemaVersion,
      sourceId: descriptor.id,
      sourceHash,
      grid: descriptor.grid,
      waterLevel: descriptor.waterLevel,
      outsidePolicy: descriptor.outsidePolicy,
      queryGrid,
      staticAtlas: fields.atlas,
      obstacles,
      diagnostics: frozenDiagnostics,
      stats
    });
    return Object.freeze({ valid: true, data, diagnostics: frozenDiagnostics });
  }
}
