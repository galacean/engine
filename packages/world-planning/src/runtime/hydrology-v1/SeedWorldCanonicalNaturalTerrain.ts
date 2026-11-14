import {
  canonicalSha256HexToBytes,
  createCanonicalWaterHashWriter,
  isCanonicalSha256Hex
} from "@galacean/engine-water/water/compiler/index";
import {
  SeedWorldHeightTileSnapshot,
  SeedWorldUint16TilePool,
  createSeedWorldHeightTileSnapshot
} from "../../world/SeedWorldGridTileSnapshot.ts";
import type { SeedWorldWaterGridTransformV1 } from "@galacean/engine-water/world/SeedWorldWaterGrid";
import {
  SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION,
  SEED_WORLD_HYDROLOGY_ANALYSIS_SPACING_METRES,
  SEED_WORLD_TILE_AXIS_COUNT
} from "@galacean/engine-water/world/SeedWorldWaterGrid";
import {
  SEED_WORLD_R16_HEIGHT_SPAN_MILLIMETRES,
  SEED_WORLD_R16_MAXIMUM_HEIGHT_MILLIMETRES,
  SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES,
  encodeVerticalMetres,
  roundTiesToEven
} from "@galacean/engine-water/world/WaterMetricEncodingV1";
import type { SeedWorldAuthoringStateV1 } from "../../world/SeedWorldWorldEdit.ts";
import { createSeedWorldFlowingWaterLakeSurrogateShapeV1 } from "./SeedWorldFlowingWaterLakeSurrogate.ts";
import { sampleSeedWorldTerrainPatchShapeDeltaMillimetresV1 } from "./SeedWorldTerrainFeatureGeometry.ts";

export const SEED_WORLD_CANONICAL_NATURAL_TERRAIN_SCHEMA_VERSION = 1 as const;

export interface SeedWorldHydrologyAnalysisTerrainSnapshotV1 {
  readonly schemaVersion: typeof SEED_WORLD_CANONICAL_NATURAL_TERRAIN_SCHEMA_VERSION;
  readonly resolution: typeof SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION;
  readonly spacingMillimetres: 24_000;
  readonly analysisTerrainSourceHash: string;
  readonly authoringStateHash: string;
  readonly released: boolean;
  sampleHeightMillimetres(x: number, z: number): number;
  release(): void;
}

export interface SeedWorldCanonicalNaturalTerrainInputV1 {
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly authoringState: Readonly<SeedWorldAuthoringStateV1>;
  readonly naturalTerrainVersionHash: string;
  /** Samples the unpatched Root Seed terrain in world metres. */
  readonly sampleNaturalHeightMetres: (worldXMetres: number, worldZMetres: number) => number;
  /**
   * Optional exact H0 sampler for the canonical Analysis Grid.
   * When omitted, Analysis and BaseTerrain sample the same natural source.
   */
  readonly sampleAnalysisHeightMetres?: (worldXMetres: number, worldZMetres: number) => number;
  readonly heightTilePool: SeedWorldUint16TilePool;
}

export interface SeedWorldCanonicalNaturalTerrainResultV1 {
  readonly analysisSnapshot: SeedWorldHydrologyAnalysisTerrainSnapshotV1;
  readonly baseTerrainSnapshot: SeedWorldHeightTileSnapshot;
  readonly baseTerrainSourceHash: string;
}

export function createSeedWorldCanonicalNaturalTerrainV1(
  input: Readonly<SeedWorldCanonicalNaturalTerrainInputV1>
): Readonly<SeedWorldCanonicalNaturalTerrainResultV1> {
  if (!isCanonicalSha256Hex(input.naturalTerrainVersionHash)) {
    throw new TypeError("Canonical Natural Terrain version must be a SHA-256 digest.");
  }
  const analysisValues = new Int32Array(
    SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION * SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION
  );
  for (let z = 0; z < SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION; z++) {
    for (let x = 0; x < SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION; x++) {
      const worldXMillimetres = input.transform.worldMinXMillimetres + x * 24_000;
      const worldZMillimetres = input.transform.worldMinZMillimetres + z * 24_000;
      analysisValues[z * SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION + x] = samplePatchedHeightMillimetres(
        input,
        worldXMillimetres,
        worldZMillimetres,
        input.sampleAnalysisHeightMetres ?? input.sampleNaturalHeightMetres
      );
    }
  }
  const analysisTerrainSourceHash = hashAnalysisTerrain(input, analysisValues);
  const analysisSnapshot = new HydrologyAnalysisTerrainSnapshot(
    analysisValues,
    analysisTerrainSourceHash,
    input.authoringState.authoringStateHash
  );
  const cellsPerTile = 32_000 / input.transform.hfinalSpacingMillimetres;
  const baseTerrainSnapshot = createSeedWorldHeightTileSnapshot({
    role: "base-terrain",
    transform: input.transform,
    pool: input.heightTilePool,
    valuesForTile: (tileId, width) => {
      const tileX = tileId % SEED_WORLD_TILE_AXIS_COUNT;
      const tileZ = Math.floor(tileId / SEED_WORLD_TILE_AXIS_COUNT);
      const values = new Uint16Array(width * width);
      for (let localZ = 0; localZ < width; localZ++) {
        for (let localX = 0; localX < width; localX++) {
          const hfinalX = tileX * cellsPerTile + localX;
          const hfinalZ = tileZ * cellsPerTile + localZ;
          const worldXMillimetres =
            input.transform.worldMinXMillimetres + hfinalX * input.transform.hfinalSpacingMillimetres;
          const worldZMillimetres =
            input.transform.worldMinZMillimetres + hfinalZ * input.transform.hfinalSpacingMillimetres;
          values[localZ * width + localX] = encodeR16HeightMillimetres(
            samplePatchedHeightMillimetres(input, worldXMillimetres, worldZMillimetres, input.sampleNaturalHeightMetres)
          );
        }
      }
      return values;
    }
  });
  const baseTerrainSourceHash = hashSeedWorldHeightSnapshotV1(
    "seed-world-water/base-terrain-source/v1",
    input.naturalTerrainVersionHash,
    input.authoringState.authoringStateHash,
    baseTerrainSnapshot
  );
  return Object.freeze({ analysisSnapshot, baseTerrainSnapshot, baseTerrainSourceHash });
}

export function hashSeedWorldHeightSnapshotV1(
  domain: "seed-world-water/base-terrain-source/v1" | "seed-world-water/terrain-source/v1",
  naturalTerrainVersionHash: string,
  authoringStateHash: string,
  snapshot: SeedWorldHeightTileSnapshot
): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord(domain, SEED_WORLD_CANONICAL_NATURAL_TERRAIN_SCHEMA_VERSION)
    .writeFixedBytes(canonicalSha256HexToBytes(naturalTerrainVersionHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(authoringStateHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(snapshot.transform.worldGridTransformHash), 32)
    .writeUint16(snapshot.canonicalView.resolution);
  snapshot.canonicalView.forEachRow((_z, sampleAtX) => {
    for (let x = 0; x < snapshot.canonicalView.resolution; x++) writer.writeUint16(sampleAtX(x));
  });
  return hash.digestHex();
}

export function encodeR16HeightMillimetres(heightMillimetres: number): number {
  if (!Number.isInteger(heightMillimetres)) throw new RangeError("R16 height input must be integer millimetres.");
  if (
    heightMillimetres < SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES ||
    heightMillimetres > SEED_WORLD_R16_MAXIMUM_HEIGHT_MILLIMETRES
  ) {
    throw new RangeError("Canonical Terrain height lies outside the frozen R16 domain.");
  }
  return roundTiesToEven(
    ((heightMillimetres - SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES) * 65_535) / SEED_WORLD_R16_HEIGHT_SPAN_MILLIMETRES,
    "r16Height"
  );
}

export function decodeR16HeightMillimetres(sample: number): number {
  if (!Number.isInteger(sample) || sample < 0 || sample > 0xffff) throw new RangeError("R16 sample is invalid.");
  return roundTiesToEven(
    SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES + (sample * SEED_WORLD_R16_HEIGHT_SPAN_MILLIMETRES) / 65_535,
    "decodedR16Height"
  );
}

export function createSeedWorldHydrologyAnalysisTerrainSnapshotFromValuesV1(
  values: Int32Array,
  analysisTerrainSourceHash: string,
  authoringStateHash: string
): SeedWorldHydrologyAnalysisTerrainSnapshotV1 {
  if (values.length !== SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION ** 2) {
    throw new Error("Hydrology Analysis Terrain values do not match the canonical Analysis Grid.");
  }
  if (!isCanonicalSha256Hex(analysisTerrainSourceHash) || !isCanonicalSha256Hex(authoringStateHash)) {
    throw new TypeError("Hydrology Analysis Terrain Snapshot requires canonical hashes.");
  }
  return new HydrologyAnalysisTerrainSnapshot(values, analysisTerrainSourceHash, authoringStateHash);
}

function samplePatchedHeightMillimetres(
  input: Readonly<SeedWorldCanonicalNaturalTerrainInputV1>,
  worldXMillimetres: number,
  worldZMillimetres: number,
  sampleHeightMetres: (worldXMetres: number, worldZMetres: number) => number
): number {
  const naturalMetres = sampleHeightMetres(worldXMillimetres / 1_000, worldZMillimetres / 1_000);
  let heightMillimetres = encodeVerticalMetres(naturalMetres, "naturalTerrainHeightMetres");
  const xOffset = worldXMillimetres - input.transform.worldMinXMillimetres;
  const zOffset = worldZMillimetres - input.transform.worldMinZMillimetres;
  heightMillimetres += sampleSeedWorldAuthoringHeightDeltaMillimetresV1(
    input.authoringState,
    xOffset,
    zOffset,
    input.transform.worldSizeXMillimetres / 1_000
  );
  if (
    heightMillimetres < SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES ||
    heightMillimetres > SEED_WORLD_R16_MAXIMUM_HEIGHT_MILLIMETRES
  ) {
    throw new RangeError("Terrain Patches move canonical height outside the frozen R16 domain.");
  }
  return heightMillimetres;
}

/** Returns the canonical accumulated height delta for one generation-local authoring position. */
export function sampleSeedWorldAuthoringHeightDeltaMillimetresV1(
  authoringState: Readonly<SeedWorldAuthoringStateV1>,
  xOffsetMillimetres: number,
  zOffsetMillimetres: number,
  _sizeMetres: number
): number {
  let deltaMillimetres = 0;
  for (const patch of authoringState.terrainPatches) {
    deltaMillimetres += sampleSeedWorldTerrainPatchShapeDeltaMillimetresV1(
      patch.shape,
      xOffsetMillimetres,
      zOffsetMillimetres
    );
  }
  for (const river of authoringState.rivers) {
    deltaMillimetres += sampleSeedWorldTerrainPatchShapeDeltaMillimetresV1(
      createSeedWorldFlowingWaterLakeSurrogateShapeV1(river),
      xOffsetMillimetres,
      zOffsetMillimetres
    );
  }
  return deltaMillimetres;
}

function hashAnalysisTerrain(input: Readonly<SeedWorldCanonicalNaturalTerrainInputV1>, values: Int32Array): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/analysis-terrain-source/v1", SEED_WORLD_CANONICAL_NATURAL_TERRAIN_SCHEMA_VERSION)
    .writeFixedBytes(canonicalSha256HexToBytes(input.naturalTerrainVersionHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(input.authoringState.authoringStateHash), 32)
    .writeInt32(input.transform.worldMinXMillimetres)
    .writeInt32(input.transform.worldMinZMillimetres)
    .writeUint32(input.transform.worldSizeXMillimetres)
    .writeUint32(input.transform.worldSizeZMillimetres)
    .writeUint16(SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION)
    .writeUint32(SEED_WORLD_HYDROLOGY_ANALYSIS_SPACING_METRES * 1_000)
    .writeUint32(values.length);
  for (const value of values) writer.writeInt32(value);
  return hash.digestHex();
}

class HydrologyAnalysisTerrainSnapshot implements SeedWorldHydrologyAnalysisTerrainSnapshotV1 {
  readonly schemaVersion = SEED_WORLD_CANONICAL_NATURAL_TERRAIN_SCHEMA_VERSION;
  readonly resolution = SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION;
  readonly spacingMillimetres = 24_000 as const;
  private _released = false;

  constructor(
    private readonly _values: Int32Array,
    readonly analysisTerrainSourceHash: string,
    readonly authoringStateHash: string
  ) {}

  get released(): boolean {
    return this._released;
  }

  sampleHeightMillimetres(x: number, z: number): number {
    if (this.released) throw new Error("Hydrology Analysis Terrain Snapshot has been released.");
    requireAnalysisIndex(x, "Analysis x");
    requireAnalysisIndex(z, "Analysis z");
    return this._values[z * this.resolution + x]!;
  }

  release(): void {
    this._released = true;
  }
}

function requireAnalysisIndex(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION) {
    throw new RangeError(`${label} must be within [0, ${SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION - 1}].`);
  }
}
