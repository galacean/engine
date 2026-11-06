import type {
  TerrainClipmapHeightSource,
  TerrainHeightAtlasPacking,
  TerrainHeightAtlasRegion
} from "./TerrainHeightAtlas";
import type { TerrainClipmapRegionSource } from "./TerrainClipmapSource";

const NORMAL_CHANNELS = 2;

/**
 * Derives one upper-hemisphere RG8 normal per Heightmap sample without renderer state.
 * @param source Complete lossless Heightmap source with metric world dimensions.
 * @returns Heightmap-aligned RG8 world-XZ normal components suitable for Worker transfer.
 * @throws {RangeError} When source dimensions, payload, or metric sample spacing are invalid.
 */
export function bakeTerrainNormalSamples(source: TerrainClipmapHeightSource): Uint8Array {
  const [width, height] = source.heightSampleSize;
  if (source.heightSamples.length !== width * height || width < 2 || height < 2) {
    throw new RangeError(`Terrain normal source "${source.id}" has invalid Heightmap dimensions`);
  }
  const spacingX = source.worldSize[0] / (width - 1);
  const spacingZ = source.worldSize[2] / (height - 1);
  if (!Number.isFinite(spacingX) || !Number.isFinite(spacingZ) || spacingX <= 0 || spacingZ <= 0) {
    throw new RangeError(`Terrain normal source "${source.id}" has invalid metric sample spacing`);
  }
  const result = new Uint8Array(width * height * NORMAL_CHANNELS);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const centerHeight = decodeSourceHeight(source, x, z);
      const leftHeight = x > 0 ? decodeSourceHeight(source, x - 1, z) : centerHeight;
      const rightHeight = x + 1 < width ? decodeSourceHeight(source, x + 1, z) : centerHeight;
      const backHeight = z > 0 ? decodeSourceHeight(source, x, z - 1) : centerHeight;
      const frontHeight = z + 1 < height ? decodeSourceHeight(source, x, z + 1) : centerHeight;
      const xSpan = (Number(x > 0) + Number(x + 1 < width)) * spacingX;
      const zSpan = (Number(z > 0) + Number(z + 1 < height)) * spacingZ;
      writeEncodedNormal(
        result,
        (z * width + x) * NORMAL_CHANNELS,
        (leftHeight - rightHeight) / xSpan,
        (backHeight - frontHeight) / zSpan
      );
    }
  }
  return result;
}

/**
 * Packs Worker-provided normals into the Height Atlas layout or derives a compatible fallback.
 * @param sources Active Region sources matching the supplied Height Atlas.
 * @param heightPacking Deterministic Height Atlas placement used by the shader.
 * @returns Same-size RG8 Normal Atlas pixels.
 * @throws {RangeError} When normal payloads are partial or have invalid dimensions.
 */
export function packTerrainNormalAtlas(
  sources: readonly TerrainClipmapRegionSource[],
  heightPacking: TerrainHeightAtlasPacking
): Uint8Array {
  const providedCount = sources.reduce((count, source) => count + Number(source.normalSamples !== undefined), 0);
  if (providedCount === 0) return bakeTerrainNormalAtlas(heightPacking);
  if (providedCount !== sources.length) {
    throw new RangeError("Terrain active Regions must either all provide baked normals or all omit them");
  }
  const sourcesById = new Map(sources.map((source) => [source.id, source] as const));
  const result = new Uint8Array(heightPacking.width * heightPacking.height * NORMAL_CHANNELS);
  result.fill(128);
  for (const region of heightPacking.regions) {
    const source = sourcesById.get(region.id);
    if (!source?.normalSamples || source.normalSamples.length !== region.width * region.height * NORMAL_CHANNELS) {
      throw new RangeError(`Terrain Region "${region.id}" baked normal payload does not match its Heightmap`);
    }
    for (let localZ = 0; localZ < region.height; localZ++) {
      const sourceOffset = localZ * region.width * NORMAL_CHANNELS;
      const atlasOffset = ((region.y + localZ) * heightPacking.width + region.x) * NORMAL_CHANNELS;
      result.set(
        source.normalSamples.subarray(sourceOffset, sourceOffset + region.width * NORMAL_CHANNELS),
        atlasOffset
      );
    }
  }
  return result;
}

/**
 * Derives one upper-hemisphere RG8 normal texel from every packed Heightmap sample.
 * @param heightPacking Active lossless Height Atlas whose Region rectangles define the output layout.
 * @param target Optional reusable output buffer with exactly two bytes per Height Atlas texel.
 * @returns The supplied buffer, or a newly allocated same-resolution RG8 Normal Atlas.
 * @throws {RangeError} When the output size or a Region's metric sample spacing is invalid.
 */
export function bakeTerrainNormalAtlas(
  heightPacking: TerrainHeightAtlasPacking,
  target = new Uint8Array(heightPacking.width * heightPacking.height * NORMAL_CHANNELS)
): Uint8Array {
  if (target.length !== heightPacking.width * heightPacking.height * NORMAL_CHANNELS) {
    throw new RangeError("Terrain Normal Atlas output does not match the Height Atlas dimensions");
  }
  target.fill(128);
  for (const region of heightPacking.regions) bakePackedRegion(heightPacking, region, target);
  return target;
}

function bakePackedRegion(
  heightPacking: TerrainHeightAtlasPacking,
  region: TerrainHeightAtlasRegion,
  target: Uint8Array
): void {
  const spacingX = region.worldSize[0] / (region.width - 1);
  const spacingZ = region.worldSize[2] / (region.height - 1);
  if (!Number.isFinite(spacingX) || !Number.isFinite(spacingZ) || spacingX <= 0 || spacingZ <= 0) {
    throw new RangeError(`Terrain Normal Atlas Region "${region.id}" has invalid metric sample spacing`);
  }
  for (let localZ = 0; localZ < region.height; localZ++) {
    const worldZ = region.worldPosition[2] + localZ * spacingZ;
    for (let localX = 0; localX < region.width; localX++) {
      const worldX = region.worldPosition[0] + localX * spacingX;
      const centerHeight = decodeRegionHeight(heightPacking, region, localX, localZ);
      const leftHeight =
        localX > 0
          ? decodeRegionHeight(heightPacking, region, localX - 1, localZ)
          : samplePackedHeight(heightPacking, worldX - spacingX, worldZ);
      const rightHeight =
        localX + 1 < region.width
          ? decodeRegionHeight(heightPacking, region, localX + 1, localZ)
          : samplePackedHeight(heightPacking, worldX + spacingX, worldZ);
      const backHeight =
        localZ > 0
          ? decodeRegionHeight(heightPacking, region, localX, localZ - 1)
          : samplePackedHeight(heightPacking, worldX, worldZ - spacingZ);
      const frontHeight =
        localZ + 1 < region.height
          ? decodeRegionHeight(heightPacking, region, localX, localZ + 1)
          : samplePackedHeight(heightPacking, worldX, worldZ + spacingZ);
      const xSpan = Math.max(Number(leftHeight !== undefined) + Number(rightHeight !== undefined), 1) * spacingX;
      const zSpan = Math.max(Number(backHeight !== undefined) + Number(frontHeight !== undefined), 1) * spacingZ;
      const atlasOffset = ((region.y + localZ) * heightPacking.width + region.x + localX) * NORMAL_CHANNELS;
      writeEncodedNormal(
        target,
        atlasOffset,
        ((leftHeight ?? centerHeight) - (rightHeight ?? centerHeight)) / xSpan,
        ((backHeight ?? centerHeight) - (frontHeight ?? centerHeight)) / zSpan
      );
    }
  }
}

function samplePackedHeight(
  heightPacking: TerrainHeightAtlasPacking,
  worldX: number,
  worldZ: number
): number | undefined {
  const region = findHeightRegion(heightPacking.regions, worldX, worldZ);
  if (!region) return undefined;
  const gridX = clamp01((worldX - region.worldPosition[0]) / region.worldSize[0]) * (region.width - 1);
  const gridZ = clamp01((worldZ - region.worldPosition[2]) / region.worldSize[2]) * (region.height - 1);
  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const x1 = Math.min(x0 + 1, region.width - 1);
  const z1 = Math.min(z0 + 1, region.height - 1);
  const near = mix(
    decodeRegionHeight(heightPacking, region, x0, z0),
    decodeRegionHeight(heightPacking, region, x1, z0),
    gridX - x0
  );
  const far = mix(
    decodeRegionHeight(heightPacking, region, x0, z1),
    decodeRegionHeight(heightPacking, region, x1, z1),
    gridX - x0
  );
  return mix(near, far, gridZ - z0);
}

function findHeightRegion(
  regions: readonly TerrainHeightAtlasRegion[],
  worldX: number,
  worldZ: number
): TerrainHeightAtlasRegion | undefined {
  let boundaryCandidate: TerrainHeightAtlasRegion | undefined;
  for (const region of regions) {
    const minimumX = region.worldPosition[0];
    const minimumZ = region.worldPosition[2];
    const maximumX = minimumX + region.worldSize[0];
    const maximumZ = minimumZ + region.worldSize[2];
    if (worldX < minimumX || worldX > maximumX || worldZ < minimumZ || worldZ > maximumZ) continue;
    if (worldX < maximumX && worldZ < maximumZ) return region;
    if (
      !boundaryCandidate ||
      minimumX > boundaryCandidate.worldPosition[0] ||
      (minimumX === boundaryCandidate.worldPosition[0] && minimumZ > boundaryCandidate.worldPosition[2])
    ) {
      boundaryCandidate = region;
    }
  }
  return boundaryCandidate;
}

function decodeSourceHeight(source: TerrainClipmapHeightSource, x: number, z: number): number {
  if (source.surfaceHeights) return source.surfaceHeights[z * source.heightSampleSize[0] + x]!;
  const sample = source.heightSamples[z * source.heightSampleSize[0] + x]!;
  return source.heightDecodeOffset + (sample / 65_535) * source.heightDecodeScale;
}

function decodeRegionHeight(
  heightPacking: TerrainHeightAtlasPacking,
  region: TerrainHeightAtlasRegion,
  localX: number,
  localZ: number
): number {
  const atlasOffset = ((region.y + localZ) * heightPacking.width + region.x + localX) * 2;
  const encoded = heightPacking.pixels[atlasOffset]! + heightPacking.pixels[atlasOffset + 1]! * 256;
  return region.heightDecodeOffset + (encoded / 65_535) * region.heightDecodeScale;
}

function writeEncodedNormal(target: Uint8Array, offset: number, normalX: number, normalZ: number): void {
  const inverseLength = 1 / Math.hypot(normalX, 1, normalZ);
  target[offset] = encodeNormalComponent(normalX * inverseLength);
  target[offset + 1] = encodeNormalComponent(normalZ * inverseLength);
}

function encodeNormalComponent(value: number): number {
  return Math.round((Math.max(-1, Math.min(1, value)) * 0.5 + 0.5) * 255);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
