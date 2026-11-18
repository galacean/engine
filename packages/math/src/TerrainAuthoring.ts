import { createFbm2D, type Fbm2DOptions } from "./Fbm2D";

/** Read the height in metres at a world-space XZ position. */
export type TerrainHeightSampler = (x: number, z: number) => number;

/** One metre-space FBM band. */
export interface TerrainFbmBand extends Fbm2DOptions {
  /** Wavelength of the first octave. */
  readonly wavelengthMetres: number;
  /** Scale applied to the signed FBM value. */
  readonly amplitudeMetres: number;
}

/** Serializable input for a procedural terrain height sampler. */
export interface TerrainFbmSource {
  /** Height before adding the bands. Defaults to zero. */
  readonly baseHeightMetres?: number;
  /** Height contributions evaluated in order. An empty array produces flat ground. */
  readonly bands: readonly TerrainFbmBand[];
  /** Optional X and Z displacement bands evaluated at the original position. */
  readonly domainWarp?: { readonly x: TerrainFbmBand; readonly z: TerrainFbmBand };
}

/**
 * Compile seeded noise bands into a world-space height sampler.
 * @param source - The authoring recipe. The sampler captures its values at compilation.
 * @returns A sampler that can be used directly or baked onto a heightfield grid.
 */
export function compileTerrainFbm({ baseHeightMetres = 0, bands, domainWarp }: TerrainFbmSource): TerrainHeightSampler {
  if (!Number.isFinite(baseHeightMetres)) throw new RangeError("Terrain base height must be finite.");
  const sampleBands = bands.map(compileBand);
  const sampleHeight: TerrainHeightSampler = (x, z) => {
    let offset = 0;
    for (const sample of sampleBands) offset += sample(x, z);
    return baseHeightMetres + offset;
  };
  if (domainWarp === undefined) return sampleHeight;

  const warpX = compileBand(domainWarp.x);
  const warpZ = compileBand(domainWarp.z);
  return (x, z) => sampleHeight(x + warpX(x, z), z + warpZ(x, z));
}

function compileBand(band: TerrainFbmBand): TerrainHeightSampler {
  const { wavelengthMetres, amplitudeMetres } = band;
  if (!Number.isFinite(wavelengthMetres) || wavelengthMetres <= 0 || !Number.isFinite(amplitudeMetres)) {
    throw new RangeError("Terrain FBM bands require a positive finite wavelength and a finite amplitude.");
  }
  const sample = createFbm2D(band);
  return (x, z) => sample(x / wavelengthMetres, z / wavelengthMetres) * amplitudeMetres;
}

/** Inclusive, uniform XZ lattice in world metres. */
export interface TerrainHeightfieldGrid {
  /** World X and Z of the first vertex. */
  readonly origin: readonly [x: number, z: number];
  /** X spacing in metres. */
  readonly spacing: number;
  /** Z spacing in metres. Defaults to X spacing. */
  readonly spacingZ?: number;
  readonly columns: number;
  readonly rows: number;
}

/** Baked heights with a detached grid definition. The caller owns the height buffer. */
export interface TerrainHeightfield extends TerrainHeightfieldGrid {
  readonly spacingZ: number;
  /** Row-major Float32 heights in metres. X varies fastest, and rows advance along +Z. */
  readonly heights: Float32Array;
}

/**
 * Sample every vertex of an inclusive grid into a new Float32 height buffer.
 * @param grid - The grid origin, independent spacings and vertex counts.
 * @param sampleHeight - Samples each world position and its zero-based column and row.
 * @returns The grid and heights. Each bake owns a separate buffer.
 */
export function bakeTerrainHeightfield(
  { origin: [originX, originZ], spacing, spacingZ = spacing, columns, rows }: TerrainHeightfieldGrid,
  sampleHeight: (x: number, z: number, column: number, row: number) => number
): TerrainHeightfield {
  const sampleCount = columns * rows;
  if (
    !Number.isSafeInteger(columns) ||
    !Number.isSafeInteger(rows) ||
    columns < 2 ||
    rows < 2 ||
    !Number.isSafeInteger(sampleCount)
  ) {
    throw new RangeError("Terrain heightfields require at least two vertices on each axis and a safe sample count.");
  }
  const xCoordinates = createGridAxis(originX, spacing, columns);
  const zCoordinates = createGridAxis(originZ, spacingZ, rows);

  const heights = new Float32Array(sampleCount);
  for (let row = 0; row < rows; row++) {
    const z = zCoordinates[row];
    for (let column = 0; column < columns; column++) {
      const x = xCoordinates[column];
      const height = sampleHeight(x, z, column, row);
      if (!Number.isFinite(height) || !Number.isFinite(Math.fround(height))) {
        throw new RangeError(`Terrain height at (${x}, ${z}) must fit in Float32.`);
      }
      heights[row * columns + column] = height;
    }
  }
  return Object.freeze({
    origin: Object.freeze([originX, originZ] as const),
    spacing,
    spacingZ,
    columns,
    rows,
    heights
  });
}

function createGridAxis(origin: number, spacing: number, count: number): Float64Array {
  if (!Number.isFinite(origin) || !Number.isFinite(spacing) || spacing <= 0) {
    throw new RangeError("Terrain grid axes require a finite origin and positive finite spacing.");
  }
  const coordinates = new Float64Array(count);
  coordinates[0] = origin;
  for (let i = 1; i < count; i++) {
    const coordinate = origin + i * spacing;
    if (!Number.isFinite(coordinate) || coordinate <= coordinates[i - 1]) {
      throw new RangeError("Terrain grid vertex coordinates must be finite and distinct.");
    }
    coordinates[i] = coordinate;
  }
  return coordinates;
}
