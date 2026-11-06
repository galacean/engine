/** Heightmap sample counts supported per logical 1,024-metre world segment. */
export const SEED_WORLD_HEIGHT_SAMPLES_PER_1024 = Object.freeze([257, 129, 65, 33] as const);

/** Coverage texel counts supported per logical 1,024-metre world segment. */
export const SEED_WORLD_COVERAGE_TEXELS_PER_1024 = Object.freeze([512, 256, 128, 64, 32] as const);

/** Fixed per-segment quad count shared by every generated Heightmap resolution. */
export const SEED_WORLD_CLIPMAP_MESH_SIZE = 32;

const DEFAULT_HEIGHT_SAMPLES_PER_1024 = 129;
const DEFAULT_COVERAGE_TEXELS_PER_1024 = 128;
const LOGICAL_SEGMENTS_PER_AXIS = 3;
const LOGICAL_SEGMENT_METRES = 1_024;

/** Largest horizontal field error accepted across every selectable coverage resolution. */
export const SEED_WORLD_MAXIMUM_COVERAGE_HORIZONTAL_ERROR_METRES =
  (Math.SQRT2 * LOGICAL_SEGMENT_METRES) / (2 * Math.min(...SEED_WORLD_COVERAGE_TEXELS_PER_1024));

/** Largest metres-per-texel spacing produced by the selectable coverage resolutions. */
export const SEED_WORLD_MAXIMUM_COVERAGE_TEXEL_SPACING_METRES =
  LOGICAL_SEGMENT_METRES / Math.min(...SEED_WORLD_COVERAGE_TEXELS_PER_1024);

/** User-selected terrain quality controls applied together by one generation request. */
export interface SeedWorldTerrainGenerationSelection {
  /** Inclusive Heightmap samples per 1,024 metres. */
  readonly heightSamplesPer1024: number;
  /** Alphamap and Detail DensityField texels per 1,024 metres. */
  readonly coverageTexelsPer1024: number;
}

/** Validated source, runtime, and Clipmap dimensions for one generated world. */
export interface SeedWorldTerrainGenerationSettings extends SeedWorldTerrainGenerationSelection {
  /** Complete world edge length in metres. */
  readonly worldSizeMetres: number;
  /** Heightmap samples across the complete inclusive world lattice. */
  readonly heightResolution: number;
  /** Runtime Alphamap and per-species DensityField texels across the world. */
  readonly coverageResolution: number;
  /** Worker-only material samples before area filtering into the coverage grid. */
  readonly coverageBakeResolution: number;
  /** Source samples contributing along each axis of one runtime coverage texel. */
  readonly coverageSamplesPerAxis: number;
  /** Metres between adjacent source Heightmap samples. */
  readonly heightSampleSpacingMetres: number;
  /** Metres covered by one runtime Alphamap and DensityField texel. */
  readonly coverageTexelSpacingMetres: number;
  /** Fine-to-coarse Geometry Clipmap ring count. */
  readonly clipmapLodCount: number;
  /** Maximum camera-relative terrain coverage on either world axis. */
  readonly clipmapHalfExtentMetres: number;
}

/** Default mobile-oriented generated terrain selection. */
export const SEED_WORLD_DEFAULT_TERRAIN_SELECTION: SeedWorldTerrainGenerationSelection = Object.freeze({
  heightSamplesPer1024: DEFAULT_HEIGHT_SAMPLES_PER_1024,
  coverageTexelsPer1024: DEFAULT_COVERAGE_TEXELS_PER_1024
});

/**
 * Resolves the only user-facing terrain quality controls into every dependent dimension.
 * @param selection Optional detached selection; omitted fields use the mobile-oriented defaults.
 * @returns Immutable generation settings shared by the Worker and runtime adapter.
 * @throws {RangeError} When a selected resolution is unsupported.
 */
export function resolveSeedWorldTerrainGenerationSettings(
  selection: Partial<SeedWorldTerrainGenerationSelection> = {}
): SeedWorldTerrainGenerationSettings {
  const heightSamplesPer1024 = supportedResolution(
    "Heightmap",
    selection.heightSamplesPer1024 ?? DEFAULT_HEIGHT_SAMPLES_PER_1024,
    SEED_WORLD_HEIGHT_SAMPLES_PER_1024
  );
  const coverageTexelsPer1024 = supportedResolution(
    "Alphamap",
    selection.coverageTexelsPer1024 ?? DEFAULT_COVERAGE_TEXELS_PER_1024,
    SEED_WORLD_COVERAGE_TEXELS_PER_1024
  );
  const heightCellsPer1024 = heightSamplesPer1024 - 1;
  const coverageBakeTexelsPer1024 = coverageTexelsPer1024;
  const coverageSamplesPerAxis = coverageBakeTexelsPer1024 / coverageTexelsPer1024;
  const heightSampleSpacingMetres = LOGICAL_SEGMENT_METRES / heightCellsPer1024;
  const baseHalfExtentMetres = (SEED_WORLD_CLIPMAP_MESH_SIZE * 2 + 2) * heightSampleSpacingMetres;
  const minimumHalfExtentMetres = LOGICAL_SEGMENT_METRES * (LOGICAL_SEGMENTS_PER_AXIS + 1);
  const clipmapLodCount = Math.max(0, Math.ceil(Math.log2(minimumHalfExtentMetres / baseHalfExtentMetres))) + 1;

  return Object.freeze({
    heightSamplesPer1024,
    coverageTexelsPer1024,
    worldSizeMetres: LOGICAL_SEGMENTS_PER_AXIS * LOGICAL_SEGMENT_METRES,
    heightResolution: heightCellsPer1024 * LOGICAL_SEGMENTS_PER_AXIS + 1,
    coverageResolution: coverageTexelsPer1024 * LOGICAL_SEGMENTS_PER_AXIS,
    coverageBakeResolution: coverageBakeTexelsPer1024 * LOGICAL_SEGMENTS_PER_AXIS,
    coverageSamplesPerAxis,
    heightSampleSpacingMetres,
    coverageTexelSpacingMetres: LOGICAL_SEGMENT_METRES / coverageTexelsPer1024,
    clipmapLodCount,
    clipmapHalfExtentMetres: baseHalfExtentMetres * 2 ** (clipmapLodCount - 1)
  });
}

function supportedResolution<T extends number>(name: string, value: number, supported: readonly T[]): T {
  if (!Number.isInteger(value) || !supported.includes(value as T)) {
    throw new RangeError(`${name} resolution must be one of: ${supported.join(", ")}`);
  }
  return value as T;
}
