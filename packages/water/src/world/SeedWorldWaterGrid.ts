import { createCanonicalWaterHashWriter, type CanonicalWaterBinaryWriterV1 } from "../water/compiler/index";
import { encodeLengthMetres, encodeVerticalMetres } from "./WaterMetricEncodingV1";

export const SEED_WORLD_WATER_GRID_TRANSFORM_SCHEMA_VERSION = 1 as const;
export const SEED_WORLD_SIZE_METRES = 3_072;
export const SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION = 129;
export const SEED_WORLD_HYDROLOGY_ANALYSIS_SPACING_METRES = 24;
export const SEED_WORLD_TILE_SIZE_METRES = 32;
export const SEED_WORLD_TILE_AXIS_COUNT = 96;
export const SEED_WORLD_TILE_COUNT = SEED_WORLD_TILE_AXIS_COUNT * SEED_WORLD_TILE_AXIS_COUNT;

export const SEED_WORLD_HFINAL_RESOLUTIONS = Object.freeze([97, 193, 385, 769] as const);
export const SEED_WORLD_OWNERSHIP_RESOLUTIONS = Object.freeze([96, 192, 384, 768, 1536] as const);

export type SeedWorldHfinalResolution = (typeof SEED_WORLD_HFINAL_RESOLUTIONS)[number];
export type SeedWorldOwnershipResolution = (typeof SEED_WORLD_OWNERSHIP_RESOLUTIONS)[number];

export interface SeedWorldWaterGridTransformV1 {
  readonly schemaVersion: typeof SEED_WORLD_WATER_GRID_TRANSFORM_SCHEMA_VERSION;
  readonly worldMinXMillimetres: number;
  readonly worldMinZMillimetres: number;
  readonly worldSizeXMillimetres: number;
  readonly worldSizeZMillimetres: number;
  readonly analysisResolution: typeof SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION;
  readonly analysisSpacingMillimetres: number;
  readonly hfinalResolution: SeedWorldHfinalResolution;
  readonly hfinalSpacingMillimetres: number;
  readonly ownershipResolution: SeedWorldOwnershipResolution;
  readonly ownershipCellMillimetres: number;
  readonly heightSampleLocation: "vertex";
  readonly ownershipSampleLocation: "cell-area";
  readonly columnDirection: "positive-x";
  readonly rowDirection: "positive-z";
  readonly boundaryRule: "half-open-world-max";
  readonly worldGridTransformHash: string;
}

export interface SeedWorldWaterGridTransformInput {
  readonly hfinalResolution: SeedWorldHfinalResolution;
  readonly ownershipResolution: SeedWorldOwnershipResolution;
  readonly worldMinXMetres?: number;
  readonly worldMinZMetres?: number;
}

export function createSeedWorldWaterGridTransformV1(
  input: Readonly<SeedWorldWaterGridTransformInput>
): Readonly<SeedWorldWaterGridTransformV1> {
  requireSupportedResolution(input.hfinalResolution, SEED_WORLD_HFINAL_RESOLUTIONS, "Hfinal");
  requireSupportedResolution(input.ownershipResolution, SEED_WORLD_OWNERSHIP_RESOLUTIONS, "Ownership");
  const worldMinXMetres = input.worldMinXMetres ?? -SEED_WORLD_SIZE_METRES * 0.5;
  const worldMinZMetres = input.worldMinZMetres ?? -SEED_WORLD_SIZE_METRES * 0.5;
  const worldSizeMillimetres = encodeLengthMetres(SEED_WORLD_SIZE_METRES, "worldSizeMetres");
  const hfinalSpacingMetres = SEED_WORLD_SIZE_METRES / (input.hfinalResolution - 1);
  const ownershipCellMetres = SEED_WORLD_SIZE_METRES / input.ownershipResolution;
  if (SEED_WORLD_TILE_SIZE_METRES % hfinalSpacingMetres !== 0) {
    throw new RangeError("Hfinal spacing must divide the 32m physical Tile contract.");
  }
  if (SEED_WORLD_TILE_SIZE_METRES % ownershipCellMetres !== 0) {
    throw new RangeError("Ownership spacing must divide the 32m physical Tile contract.");
  }
  const draft: Omit<SeedWorldWaterGridTransformV1, "worldGridTransformHash"> = {
    schemaVersion: SEED_WORLD_WATER_GRID_TRANSFORM_SCHEMA_VERSION,
    worldMinXMillimetres: encodeVerticalMetres(worldMinXMetres, "worldMinXMetres"),
    worldMinZMillimetres: encodeVerticalMetres(worldMinZMetres, "worldMinZMetres"),
    worldSizeXMillimetres: worldSizeMillimetres,
    worldSizeZMillimetres: worldSizeMillimetres,
    analysisResolution: SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION,
    analysisSpacingMillimetres: encodeLengthMetres(
      SEED_WORLD_HYDROLOGY_ANALYSIS_SPACING_METRES,
      "analysisSpacingMetres"
    ),
    hfinalResolution: input.hfinalResolution,
    hfinalSpacingMillimetres: encodeLengthMetres(hfinalSpacingMetres, "hfinalSpacingMetres"),
    ownershipResolution: input.ownershipResolution,
    ownershipCellMillimetres: encodeLengthMetres(ownershipCellMetres, "ownershipCellMetres"),
    heightSampleLocation: "vertex" as const,
    ownershipSampleLocation: "cell-area" as const,
    columnDirection: "positive-x" as const,
    rowDirection: "positive-z" as const,
    boundaryRule: "half-open-world-max" as const
  };
  const worldGridTransformHash = hashSeedWorldWaterGridTransform(draft);
  return Object.freeze({ ...draft, worldGridTransformHash });
}

function hashSeedWorldWaterGridTransform(
  transform: Omit<SeedWorldWaterGridTransformV1, "worldGridTransformHash">
): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writeSeedWorldWaterGridTransform(writer, transform);
  return hash.digestHex();
}

export function hfinalVertexWorldXZ(
  transform: SeedWorldWaterGridTransformV1,
  x: number,
  z: number
): readonly [number, number] {
  requireGridIndex(x, transform.hfinalResolution, "Hfinal x");
  requireGridIndex(z, transform.hfinalResolution, "Hfinal z");
  return Object.freeze([
    (transform.worldMinXMillimetres + x * transform.hfinalSpacingMillimetres) / 1_000,
    (transform.worldMinZMillimetres + z * transform.hfinalSpacingMillimetres) / 1_000
  ] as const);
}

export function ownershipCellAtWorldXZ(
  transform: SeedWorldWaterGridTransformV1,
  worldXMetres: number,
  worldZMetres: number
): readonly [number, number] | undefined {
  if (!Number.isFinite(worldXMetres) || !Number.isFinite(worldZMetres)) {
    throw new RangeError("Ownership lookup coordinates must be finite.");
  }
  const xMillimetres = encodeVerticalMetres(worldXMetres, "worldXMetres") - transform.worldMinXMillimetres;
  const zMillimetres = encodeVerticalMetres(worldZMetres, "worldZMetres") - transform.worldMinZMillimetres;
  if (
    xMillimetres < 0 ||
    zMillimetres < 0 ||
    xMillimetres >= transform.worldSizeXMillimetres ||
    zMillimetres >= transform.worldSizeZMillimetres
  ) {
    return undefined;
  }
  return Object.freeze([
    Math.floor(xMillimetres / transform.ownershipCellMillimetres),
    Math.floor(zMillimetres / transform.ownershipCellMillimetres)
  ] as const);
}

export function maximumFootprintHorizontalErrorMetres(transform: SeedWorldWaterGridTransformV1): number {
  return (0.5 * Math.SQRT2 * Math.max(transform.hfinalSpacingMillimetres, transform.ownershipCellMillimetres)) / 1_000;
}

function writeSeedWorldWaterGridTransform(
  writer: CanonicalWaterBinaryWriterV1,
  transform: Omit<SeedWorldWaterGridTransformV1, "worldGridTransformHash">
): void {
  writer
    .writeRecord("seed-world-water/world-grid-transform/v1", transform.schemaVersion)
    .writeInt32(transform.worldMinXMillimetres)
    .writeInt32(transform.worldMinZMillimetres)
    .writeUint32(transform.worldSizeXMillimetres)
    .writeUint32(transform.worldSizeZMillimetres)
    .writeUint16(transform.analysisResolution)
    .writeUint32(transform.analysisSpacingMillimetres)
    .writeUint16(transform.hfinalResolution)
    .writeUint32(transform.hfinalSpacingMillimetres)
    .writeUint16(transform.ownershipResolution)
    .writeUint32(transform.ownershipCellMillimetres)
    .writeUint8(1)
    .writeUint8(1)
    .writeUint8(1)
    .writeUint8(1)
    .writeUint8(1);
}

function requireSupportedResolution<T extends number>(
  value: number,
  supported: readonly T[],
  label: string
): asserts value is T {
  if (!supported.includes(value as T)) {
    throw new RangeError(`${label} resolution ${value} is not part of the frozen Grid Profile.`);
  }
}

function requireGridIndex(value: number, resolution: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= resolution) {
    throw new RangeError(`${label} must be an integer within [0, ${resolution - 1}].`);
  }
}
