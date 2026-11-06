import type { TerrainHeightAtlasFrame } from "./TerrainClipmapMaterial";
import type { TerrainHeightAtlasRegion } from "./TerrainHeightAtlas";

/** Encoding is region-wide: changing it requires replacing every sample in that region. */
export function resolveTerrainHeightFrameDecode(
  frame: TerrainHeightAtlasFrame,
  region: TerrainHeightAtlasRegion,
  currentOffset: number,
  currentScale: number
): readonly [number, number] {
  const offset = Math.fround(frame.heightDecode?.offset ?? region.heightDecodeOffset);
  const scale = Math.fround(frame.heightDecode?.scale ?? region.heightDecodeScale);
  if (
    !Number.isFinite(offset) ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(Math.fround(offset + scale))
  )
    throw new RangeError("Terrain height frame requires a finite positive GPU decode range");
  if (
    (offset !== currentOffset || scale !== currentScale) &&
    (frame.sampleOrigin[0] !== 0 ||
      frame.sampleOrigin[1] !== 0 ||
      frame.sampleSize[0] !== region.width ||
      frame.sampleSize[1] !== region.height)
  )
    throw new RangeError("Changing terrain height encoding requires a complete region frame");
  return [offset, scale];
}
