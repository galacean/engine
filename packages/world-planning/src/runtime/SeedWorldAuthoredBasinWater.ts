import { attachLakeGridBoundary, HEIGHTFIELD_WATER_ATLAS_MAX_EDGE } from "@galacean/engine-water/water/compiler/index";
import {
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  type GridMaskWaterBodySourceV1,
  type WaterSpatialFieldQualityBudgetV1,
  createHeightfieldWaterBodySourceDescriptorV1,
  createHeightfieldWaterRepresentationDataV1,
  type HeightfieldWaterDescriptorV1,
  type HeightfieldWaterRepresentationDataV1,
  HeightfieldWaterSchemaVersion,
  WaterQualityTier,
  WaterWaveModel,
  WaterWaveSchemaVersion
} from "@galacean/engine-water/water/index";

import { sampleSeedWorldWaterBasinProfileV1 } from "./hydrology-v1/SeedWorldTerrainFeatureGeometry.ts";
import type { SeedWorldTerrainPatchV1 } from "../world/SeedWorldWorldEdit.ts";
import type { SeedWorldAuthoredWaterQueryBodyV1 } from "@galacean/engine-water/world/SeedWorldAuthoredWaterQuery";

type SeedWorldWaterBasinPatchV1 = Readonly<
  SeedWorldTerrainPatchV1 & {
    readonly shape: Extract<SeedWorldTerrainPatchV1["shape"], { readonly kind: "radial-water-basin" }>;
  }
>;

export const SEED_WORLD_AUTHORED_BASIN_MINIMUM_CELL_SIZE_METRES = 0.5;
export const SEED_WORLD_AUTHORED_BASIN_MAXIMUM_CELL_SIZE_METRES = 1.5;
export const SEED_WORLD_AUTHORED_BASIN_RADIUS_CELL_DIVISOR = 40;
export const SEED_WORLD_AUTHORED_BASIN_MINIMUM_SIGNED_DISTANCE_RANGE_METRES = 1.5;
export const SEED_WORLD_AUTHORED_BASIN_SIGNED_DISTANCE_CELL_MULTIPLIER = 4;
export const SEED_WORLD_AUTHORED_BASIN_CREATE_MINIMUM_RADIUS_METRES = 5;
export const SEED_WORLD_AUTHORED_BASIN_MAXIMUM_RADIUS_METRES = 500;
export const SEED_WORLD_AUTHORED_BASIN_CREATE_MINIMUM_DEPTH_METRES = 0.5;
export const SEED_WORLD_AUTHORED_BASIN_UPDATE_MINIMUM_DEPTH_METRES = 0.2;
export const SEED_WORLD_AUTHORED_BASIN_MAXIMUM_DEPTH_METRES = 80;
export const SEED_WORLD_AUTHORED_BASIN_MINIMUM_SHORELINE_IRREGULARITY = 0;
export const SEED_WORLD_AUTHORED_BASIN_MAXIMUM_SHORELINE_IRREGULARITY = 1;

/**
 * Dense query samples resolve to a Grid cell centre, so the worst horizontal
 * error is half of the largest allowed cell diagonal. Round upward to the
 * millimetre because a Quality Plan is a fail-closed upper bound.
 */
export const SEED_WORLD_AUTHORED_BASIN_MAXIMUM_HORIZONTAL_ERROR_METRES =
  Math.ceil(
    Math.hypot(SEED_WORLD_AUTHORED_BASIN_MAXIMUM_CELL_SIZE_METRES, SEED_WORLD_AUTHORED_BASIN_MAXIMUM_CELL_SIZE_METRES) *
      0.5 *
      1_000
  ) / 1_000;
export const SEED_WORLD_AUTHORED_BASIN_MAXIMUM_SIGNED_DISTANCE_RANGE_METRES = Math.max(
  SEED_WORLD_AUTHORED_BASIN_MINIMUM_SIGNED_DISTANCE_RANGE_METRES,
  SEED_WORLD_AUTHORED_BASIN_MAXIMUM_CELL_SIZE_METRES * SEED_WORLD_AUTHORED_BASIN_SIGNED_DISTANCE_CELL_MULTIPLIER
);

export interface SeedWorldAuthoredBasinWaterRuntimePublicationV1 {
  readonly descriptor: Readonly<HeightfieldWaterDescriptorV1>;
  readonly source: Readonly<GridMaskWaterBodySourceV1>;
  readonly representationData: Readonly<HeightfieldWaterRepresentationDataV1>;
}

export interface SeedWorldAuthoredBasinWaterV1 {
  /** Null means the persistent basin is dry and must publish no visible Water Runtime body. */
  readonly runtimePublication: Readonly<SeedWorldAuthoredBasinWaterRuntimePublicationV1> | null;
  readonly logicalBounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
  readonly queryBody: Extract<SeedWorldAuthoredWaterQueryBodyV1, { kind: "basin" }>;
  readonly waterLevel: Readonly<{
    canonicalWaterLevelMetres: number;
    minimumWaterLevelMetres: number;
    maximumWaterLevelMetres: number;
    effectiveWaterLevelMetres: number;
  }>;
  readonly createQueryBody: (waterLevelMetres: number) => Extract<SeedWorldAuthoredWaterQueryBodyV1, { kind: "basin" }>;
}

export interface SeedWorldAuthoredBasinWaterProjectionOptionsV1 {
  /** Persistent is the normal pond/lake path; terrain-derived is only for the temporary river surrogate. */
  readonly waterLevelAuthority?: "persistent" | "terrain-derived";
}

export function resolveSeedWorldAuthoredBasinCellSizeMetres(radiusMetres: number): number {
  if (!Number.isFinite(radiusMetres) || radiusMetres <= 0) {
    throw new RangeError("Authored Water basin radius must be finite and positive.");
  }
  return Math.max(
    SEED_WORLD_AUTHORED_BASIN_MINIMUM_CELL_SIZE_METRES,
    Math.min(
      SEED_WORLD_AUTHORED_BASIN_MAXIMUM_CELL_SIZE_METRES,
      radiusMetres / SEED_WORLD_AUTHORED_BASIN_RADIUS_CELL_DIVISOR
    )
  );
}

export function assertSeedWorldAuthoredBasinPublicParametersV1(
  input: Readonly<{
    radiusMetres: number;
    depthMetres: number;
    shorelineIrregularity: number;
  }>,
  minimumDepthMetres = SEED_WORLD_AUTHORED_BASIN_CREATE_MINIMUM_DEPTH_METRES
): void {
  requireFiniteRange(
    input.radiusMetres,
    SEED_WORLD_AUTHORED_BASIN_CREATE_MINIMUM_RADIUS_METRES,
    SEED_WORLD_AUTHORED_BASIN_MAXIMUM_RADIUS_METRES,
    "Authored Water basin radius"
  );
  requireFiniteRange(
    input.depthMetres,
    minimumDepthMetres,
    SEED_WORLD_AUTHORED_BASIN_MAXIMUM_DEPTH_METRES,
    "Authored Water basin depth"
  );
  requireFiniteRange(
    input.shorelineIrregularity,
    SEED_WORLD_AUTHORED_BASIN_MINIMUM_SHORELINE_IRREGULARITY,
    SEED_WORLD_AUTHORED_BASIN_MAXIMUM_SHORELINE_IRREGULARITY,
    "Authored Water basin shoreline irregularity"
  );
}

/** Derives one fail-closed plan from the complete public authored-basin input range. */
export function createSeedWorldAuthoredBasinSpatialFieldQualityBudgetV1(): Readonly<WaterSpatialFieldQualityBudgetV1> {
  return Object.freeze({
    maximumHorizontalError: SEED_WORLD_AUTHORED_BASIN_MAXIMUM_HORIZONTAL_ERROR_METRES,
    maximumDepthError: 0,
    maximumGpuDepthDecodeError: roundQualityBudgetUp(SEED_WORLD_AUTHORED_BASIN_MAXIMUM_DEPTH_METRES / 510),
    maximumGpuShoreDecodeError: roundQualityBudgetUp(
      SEED_WORLD_AUTHORED_BASIN_MAXIMUM_SIGNED_DISTANCE_RANGE_METRES / 255
    ),
    maximumAtlasPixels: HEIGHTFIELD_WATER_ATLAS_MAX_EDGE[WaterQualityTier.High] ** 2
  });
}

/** Projects one persistent pond/lake basin into Water without rebuilding the generated world. */
export function createSeedWorldAuthoredBasinWaterV1(
  patch: SeedWorldWaterBasinPatchV1,
  sizeMetres: number,
  sampleTerrainHeight: (x: number, z: number) => number | undefined,
  options: Readonly<SeedWorldAuthoredBasinWaterProjectionOptionsV1> = {}
): Readonly<SeedWorldAuthoredBasinWaterV1> {
  const shape = patch.shape;
  const halfWorld = sizeMetres * 0.5;
  const centerX = shape.centerXOffsetMillimetres / 1_000 - halfWorld;
  const centerZ = shape.centerZOffsetMillimetres / 1_000 - halfWorld;
  const radius = shape.radiusMillimetres / 1_000;
  const depth = shape.depthMillimetres / 1_000;
  const padding = radius * (1 + shape.shorelineIrregularityPermille / 4_000);
  const minX = Math.max(-halfWorld, centerX - padding);
  const minZ = Math.max(-halfWorld, centerZ - padding);
  const maxX = Math.min(halfWorld, centerX + padding);
  const maxZ = Math.min(halfWorld, centerZ + padding);
  const cellSize = resolveSeedWorldAuthoredBasinCellSizeMetres(radius);
  const width = Math.max(2, Math.ceil((maxX - minX) / cellSize));
  const height = Math.max(2, Math.ceil((maxZ - minZ) / cellSize));
  const originX = minX + cellSize * 0.5;
  const originZ = minZ + cellSize * 0.5;
  const centerBed = sampleTerrainHeight(centerX, centerZ);
  if (centerBed === undefined) throw new RangeError(`Water feature '${patch.patchId}' leaves the world boundary.`);
  // The ordinary authored path owns an explicit persistent datum. The temporary
  // flowing-water surrogate is the only caller allowed to derive it from terrain.
  const canonicalWaterLevelMetres =
    options.waterLevelAuthority === "terrain-derived"
      ? centerBed + depth * 0.82
      : shape.canonicalWaterLevelMillimetres / 1_000;
  const minimumWaterLevelMetres = canonicalWaterLevelMetres - depth;
  const maximumWaterLevelMetres = canonicalWaterLevelMetres;
  const effectiveWaterLevelMetres =
    canonicalWaterLevelMetres +
    (options.waterLevelAuthority === "terrain-derived" ? 0 : shape.surfaceLevelOffsetMillimetres / 1_000);
  requireFiniteRange(
    effectiveWaterLevelMetres,
    minimumWaterLevelMetres,
    maximumWaterLevelMetres,
    "Authored Water basin effective water level"
  );
  let canonicalWetTexelCount = 0;
  const wetTexelIndices: number[] = [];
  const surfaceHeights: number[] = [];
  const bedHeightByTexel = new Float32Array(width * height).fill(Number.NaN);
  const bedHeights: number[] = [];
  const flowVectorsXZ: number[] = [];
  for (let row = 0; row < height; row++) {
    const z = originZ + row * cellSize;
    for (let column = 0; column < width; column++) {
      const x = originX + column * cellSize;
      const profile = sampleSeedWorldWaterBasinProfileV1(
        shape,
        Math.round((x + halfWorld) * 1_000),
        Math.round((z + halfWorld) * 1_000)
      );
      if (profile <= 0.015) continue;
      const bed = sampleTerrainHeight(x, z);
      if (bed === undefined) continue;
      const texelIndex = row * width + column;
      bedHeightByTexel[texelIndex] = bed;
      if (bed < canonicalWaterLevelMetres - 0.02) canonicalWetTexelCount++;
      if (bed >= effectiveWaterLevelMetres - 0.02) continue;
      wetTexelIndices.push(texelIndex);
      surfaceHeights.push(effectiveWaterLevelMetres);
      bedHeights.push(bed);
      flowVectorsXZ.push(0, 0);
    }
  }
  if (canonicalWetTexelCount === 0) {
    throw new Error(`Water feature '${patch.patchId}' has no submerged terrain after basin excavation.`);
  }
  const runtimePublication =
    wetTexelIndices.length > 0
      ? createRuntimePublication(
          patch.patchId,
          shape.featureKind,
          shape.seed,
          radius,
          cellSize,
          originX,
          originZ,
          width,
          height,
          wetTexelIndices,
          surfaceHeights,
          bedHeights,
          flowVectorsXZ
        )
      : null;
  const createQueryBody = (waterLevelMetres: number): Extract<SeedWorldAuthoredWaterQueryBodyV1, { kind: "basin" }> => {
    requireFiniteRange(
      waterLevelMetres,
      minimumWaterLevelMetres,
      maximumWaterLevelMetres,
      "Authored Water basin query water level"
    );
    const surfaceHeightByTexel = new Float32Array(width * height).fill(Number.NaN);
    for (let index = 0; index < bedHeightByTexel.length; index++) {
      const bed = bedHeightByTexel[index]!;
      if (Number.isFinite(bed) && bed < waterLevelMetres - 0.02) {
        surfaceHeightByTexel[index] = waterLevelMetres;
      }
    }
    return Object.freeze({
      kind: "basin",
      originX,
      originZ,
      cellSizeX: cellSize,
      cellSizeZ: cellSize,
      width,
      height,
      surfaceHeightByTexel
    });
  };
  return Object.freeze({
    runtimePublication,
    logicalBounds: Object.freeze({ minX, minZ, maxX, maxZ }),
    queryBody: createQueryBody(effectiveWaterLevelMetres),
    waterLevel: Object.freeze({
      canonicalWaterLevelMetres,
      minimumWaterLevelMetres,
      maximumWaterLevelMetres,
      effectiveWaterLevelMetres
    }),
    createQueryBody
  });
}

function createRuntimePublication(
  patchId: string,
  featureKind: "pond" | "lake",
  seed: number,
  radius: number,
  cellSize: number,
  originX: number,
  originZ: number,
  width: number,
  height: number,
  wetTexelIndices: readonly number[],
  surfaceHeights: readonly number[],
  bedHeights: readonly number[],
  flowVectorsXZ: readonly number[]
): Readonly<SeedWorldAuthoredBasinWaterRuntimePublicationV1> {
  const descriptor: HeightfieldWaterDescriptorV1 = attachLakeGridBoundary({
    schemaVersion: HeightfieldWaterSchemaVersion.V1,
    id: `${patchId}-heightfield`,
    grid: {
      originXZ: [originX, originZ],
      cellSizeXZ: [cellSize, cellSize],
      width,
      height
    },
    wetTexelIndices: new Uint32Array(wetTexelIndices),
    surfaceHeights: new Float32Array(surfaceHeights),
    bedHeights: new Float32Array(bedHeights),
    flowVectorsXZ: new Float32Array(flowVectorsXZ),
    waveAsset: {
      schemaVersion: WaterWaveSchemaVersion.V1,
      model: WaterWaveModel.DirectionalGerstner,
      generator: {
        waveCount: 8,
        // World-authoring seeds are uint32, while Water's generator has a
        // signed-positive 31-bit contract. Derive the renderer seed at this
        // boundary instead of leaking the backend limit into public authoring.
        seed: seed & 0x7fff_ffff,
        randomness: 0.72,
        minWavelength: 0.55,
        maxWavelength: Math.max(3, Math.min(12, radius * 0.3)),
        wavelengthFalloff: 1.2,
        minAmplitude: 0.004,
        maxAmplitude: Math.max(0.035, Math.min(0.16, radius * 0.0025)),
        amplitudeFalloff: 1.42,
        dominantWindAngle: 0.4,
        dominantAngularSpread: 0.7,
        smallWaveSteepness: 0.1,
        largeWaveSteepness: 0.28,
        steepnessFalloff: 1.1
      }
    },
    quality: WaterQualityTier.Medium,
    surfaceMotion: { waveStrength: featureKind === "pond" ? 0.2 : 0.32, shoreDampingWidth: 1.2 },
    spatialField: {
      signedDistanceRange: Math.max(
        SEED_WORLD_AUTHORED_BASIN_MINIMUM_SIGNED_DISTANCE_RANGE_METRES,
        cellSize * SEED_WORLD_AUTHORED_BASIN_SIGNED_DISTANCE_CELL_MULTIPLIER
      )
    }
  });
  const source: GridMaskWaterBodySourceV1 = Object.freeze({
    schemaVersion: WaterBodySourceSchemaVersion.V1,
    kind: WaterBodySourceKind.GridMask,
    descriptor: createHeightfieldWaterBodySourceDescriptorV1(descriptor),
    capabilities: Object.freeze({ localBathymetry: true, shoreSdf: true, current: true })
  });
  return Object.freeze({
    descriptor: Object.freeze(descriptor),
    source,
    representationData: createHeightfieldWaterRepresentationDataV1(descriptor)
  });
}

function roundQualityBudgetUp(value: number): number {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError("Water Quality budget must be finite and non-negative.");
  return Math.ceil(value * 1_000_000) / 1_000_000;
}

function requireFiniteRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

export function isSeedWorldWaterBasinPatchV1(
  patch: Readonly<SeedWorldTerrainPatchV1>
): patch is SeedWorldWaterBasinPatchV1 {
  return patch.purpose === "water-body" && patch.shape.kind === "radial-water-basin";
}
