import { loadTerrainCompilerBinary } from "../terrain/loader/TerrainCompilerBinaryLoader";

/** Versioned circular grayscale mask reused from the Height Brush laboratory. */
export const SEED_WORLD_SOFT_CIRCLE_BRUSH_KEY = "soft-circle-v1" as const;

/** Terrain3D masks used as broad mountain foundations. */
export const SEED_WORLD_HILL_BRUSH_KEYS = Object.freeze(["terrain3d-hill1-v1", "terrain3d-hill2-v1"] as const);

/** Terrain3D masks used as localized mountain relief. */
export const SEED_WORLD_MOUNTAIN_DETAIL_BRUSH_KEYS = Object.freeze([
  "terrain3d-mountain1-v1",
  "terrain3d-mountain2-v1",
  "terrain3d-mountain3-v1",
  "terrain3d-mountain4-v1"
] as const);

/** Stable key of a normalized R16 height-brush mask. */
export type SeedWorldHeightBrushMaskKey =
  | typeof SEED_WORLD_SOFT_CIRCLE_BRUSH_KEY
  | (typeof SEED_WORLD_HILL_BRUSH_KEYS)[number]
  | (typeof SEED_WORLD_MOUNTAIN_DETAIL_BRUSH_KEYS)[number];

/** One immutable grayscale brush mask used by both 2D preview and Heightmap compilation. */
export interface SeedWorldHeightBrushMask {
  /** Versioned brush identity stored by generated mountain intent. */
  readonly key: SeedWorldHeightBrushMaskKey;
  /** Square sample resolution. */
  readonly resolution: number;
  /** Row-major normalized R16 samples. */
  readonly samples: Uint16Array;
  /** Stable FNV-1a hash of the R16 samples. */
  readonly hash: number;
}

const TERRAIN3D_BRUSH_KEYS = Object.freeze([
  ...SEED_WORLD_HILL_BRUSH_KEYS,
  ...SEED_WORLD_MOUNTAIN_DETAIL_BRUSH_KEYS
] as const);
let terrain3DBrushLibrary: ReadonlyMap<SeedWorldHeightBrushMaskKey, SeedWorldHeightBrushMask> | undefined;
let terrain3DBrushLibraryPromise:
  | Promise<ReadonlyMap<SeedWorldHeightBrushMaskKey, SeedWorldHeightBrushMask>>
  | undefined;

/**
 * Loads the immutable Terrain3D brush library before synchronous planning begins.
 * @param url Asset URL supplied by the owning browser, Worker, or Node context.
 * @returns A task that settles after every R16 mask is validated and published.
 * @throws {Error} When the binary cannot be loaded or does not match the supported schema.
 */
export async function prepareSeedWorldHeightBrushLibrary(url: URL): Promise<void> {
  terrain3DBrushLibraryPromise ??= loadTerrain3DBrushLibrary(url);
  terrain3DBrushLibrary = await terrain3DBrushLibraryPromise;
}

/**
 * Reads one versioned Terrain3D-derived height brush.
 * @param key Brush identity stored by one mountain layer.
 * @returns Immutable normalized R16 mask metadata and samples.
 * @throws {RangeError} When the analytic fallback key is requested or the key is unknown.
 */
export function getSeedWorldHeightBrushMask(key: SeedWorldHeightBrushMaskKey): SeedWorldHeightBrushMask {
  if (!terrain3DBrushLibrary) throw new Error("Seed World height-brush library has not been prepared");
  const mask = terrain3DBrushLibrary.get(key);
  if (!mask) throw new RangeError(`Seed World R16 height brush "${key}" is not available`);
  return mask;
}

/**
 * Samples one normalized grayscale mask with bilinear filtering.
 * @param key Versioned brush key.
 * @param localX Local brush X coordinate where the support spans negative one to one.
 * @param localZ Local brush Z coordinate where the support spans negative one to one.
 * @returns Continuous brush strength in the inclusive range zero to one.
 */
export function sampleSeedWorldHeightBrushMask(
  key: SeedWorldHeightBrushMaskKey,
  localX: number,
  localZ: number
): number {
  if (!Number.isFinite(localX) || !Number.isFinite(localZ) || Math.abs(localX) >= 1 || Math.abs(localZ) >= 1) {
    return 0;
  }
  if (key === SEED_WORLD_SOFT_CIRCLE_BRUSH_KEY) return sampleSeedWorldSoftCircleBrush(Math.hypot(localX, localZ));
  const mask = getSeedWorldHeightBrushMask(key);
  const sampleX = (localX * 0.5 + 0.5) * (mask.resolution - 1);
  const sampleZ = (localZ * 0.5 + 0.5) * (mask.resolution - 1);
  const minimumX = Math.floor(sampleX);
  const minimumZ = Math.floor(sampleZ);
  const maximumX = Math.min(mask.resolution - 1, minimumX + 1);
  const maximumZ = Math.min(mask.resolution - 1, minimumZ + 1);
  const fractionX = sampleX - minimumX;
  const fractionZ = sampleZ - minimumZ;
  const top = mix(
    mask.samples[minimumZ * mask.resolution + minimumX]!,
    mask.samples[minimumZ * mask.resolution + maximumX]!,
    fractionX
  );
  const bottom = mix(
    mask.samples[maximumZ * mask.resolution + minimumX]!,
    mask.samples[maximumZ * mask.resolution + maximumX]!,
    fractionX
  );
  return mix(top, bottom, fractionZ) / 65_535;
}

/**
 * Samples the grayscale soft-circle mask and its C2 edge envelope.
 * @param normalizedDistance Elliptical distance where zero is the centre and one is the brush edge.
 * @returns Continuous brush strength in the inclusive range zero to one.
 */
export function sampleSeedWorldSoftCircleBrush(normalizedDistance: number): number {
  if (!Number.isFinite(normalizedDistance) || normalizedDistance >= 1) return 0;
  const distance = Math.max(0, normalizedDistance);
  const imageMask = 1 - distance;
  return imageMask * (1 - smootherstep(distance));
}

async function loadTerrain3DBrushLibrary(
  url: URL
): Promise<ReadonlyMap<SeedWorldHeightBrushMaskKey, SeedWorldHeightBrushMask>> {
  const bytes = await loadTerrainCompilerBinary(url);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 8 || readAscii(bytes, 0, 4) !== "SWHB") {
    throw new RangeError("Seed World height-brush binary has an invalid header");
  }
  const version = view.getUint16(4, true);
  const brushCount = view.getUint16(6, true);
  if (version !== 1 || brushCount !== TERRAIN3D_BRUSH_KEYS.length) {
    throw new RangeError(`Seed World height-brush binary schema ${version}/${brushCount} is unsupported`);
  }
  let offset = 8;
  const library = new Map<SeedWorldHeightBrushMaskKey, SeedWorldHeightBrushMask>();
  for (const key of TERRAIN3D_BRUSH_KEYS) {
    if (offset + 8 > bytes.byteLength) throw new RangeError(`Seed World height brush "${key}" has no metadata`);
    const resolution = view.getUint16(offset, true);
    const reserved = view.getUint16(offset + 2, true);
    const byteLength = view.getUint32(offset + 4, true);
    offset += 8;
    if (reserved !== 0 || resolution < 2 || byteLength !== resolution * resolution * 2) {
      throw new RangeError(`Seed World height brush "${key}" has invalid dimensions`);
    }
    if (offset + byteLength > bytes.byteLength) {
      throw new RangeError(`Seed World height brush "${key}" is truncated`);
    }
    const samples = new Uint16Array(resolution * resolution);
    for (let index = 0; index < samples.length; index++) {
      samples[index] = view.getUint16(offset + index * 2, true);
    }
    offset += byteLength;
    library.set(key, Object.freeze({ key, resolution, samples, hash: hashR16(samples) }));
  }
  if (offset !== bytes.byteLength) throw new RangeError("Seed World height-brush binary has trailing data");
  return library;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index++) value += String.fromCharCode(bytes[offset + index]!);
  return value;
}

function hashR16(samples: Uint16Array): number {
  let hash = 0x811c_9dc5;
  for (const sample of samples) {
    hash ^= sample;
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

function mix(start: number, end: number, weight: number): number {
  return start + (end - start) * weight;
}

function smootherstep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}
