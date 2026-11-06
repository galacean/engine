import { Texture2D, TextureFormat, TextureFilterMode, TextureWrapMode, type Engine } from "@galacean/engine";
import normalTileUrl from "../data/seed-world/public/textures/grass-surface-normal.rgb8?url";
import { SURFACE_NORMAL_RESOLUTION } from "./SeedWorldSurfaceNormalBake";

export const SEED_WORLD_SURFACE_NORMAL_RESOLUTION = SURFACE_NORMAL_RESOLUTION;
let cachedPixels: Uint8Array | undefined;

/** Loads the offline unmasked normal tile. The caller owns the returned GPU texture.
 * @param engine GPU resource owner.
 * @param signal Cancels an abandoned world publication.
 */
export async function createSeedWorldSurfaceNormalTexture(engine: Engine, signal: AbortSignal): Promise<Texture2D> {
  const resolution = SEED_WORLD_SURFACE_NORMAL_RESOLUTION;
  signal.throwIfAborted();
  if (!cachedPixels) {
    // Cache only completed immutable bytes. One cancelled/failed owner must not
    // poison later worlds or abort another owner's in-flight request.
    const response = await fetch(normalTileUrl, { signal });
    if (!response.ok) throw new Error(`Surface normal tile: HTTP ${response.status}`);
    const pixels = new Uint8Array(await response.arrayBuffer());
    signal.throwIfAborted();
    if (pixels.length !== resolution ** 2 * 3) throw new RangeError("Surface normal tile must be 256 square RGB8");
    cachedPixels ??= pixels;
  }
  signal.throwIfAborted();
  const texture = new Texture2D(engine, resolution, resolution, TextureFormat.R8G8B8, false, false);
  try {
    // Linear XYZ supports hardware filtering; repeat wraps the filter footprint at tile seams.
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
    texture.setPixelBuffer(cachedPixels);
    return texture;
  } catch (error) {
    texture.destroy();
    throw error;
  }
}
