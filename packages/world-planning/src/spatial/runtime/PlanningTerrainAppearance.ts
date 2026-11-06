import { Texture2D, TextureFormat, TextureFilterMode, TextureWrapMode, type Engine } from "@galacean/engine";
import { loadTerrainCompilerBinary } from "@galacean/engine-terrain/terrain/loader/TerrainCompilerBinaryLoader";
import {
  bakeSeedWorldSurfaceColorField,
  SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION
} from "@galacean/engine-terrain/world/SeedWorldSurfaceColorField";
import {
  SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS,
  type SeedWorldGrassColorFieldBinding
} from "@galacean/engine-vegetation/world/SeedWorldGrassColorField";
import profile from "../../planning-data/settlement-profile.json";

let templateSamples: Promise<Uint8Array> | undefined;

/** Prepare Seed's original colour algorithm at the published material resolution. */
export async function preparePlanningSurfaceColorSamples(seed: number): Promise<Uint8Array> {
  templateSamples ??= loadTerrainCompilerBinary(
    new URL("../../../../terrain/src/data/seed-world/public/textures/grass-color-detail.r8", import.meta.url)
  ).catch((error) => {
    templateSamples = undefined;
    throw error;
  });
  const source = bakeSeedWorldSurfaceColorField(seed, await templateSamples);
  return resizePlanningSurfaceColorSamples(source);
}

/** Endpoint-aligned resampling changes resolution without changing Seed's colour algorithm. */
export function resizePlanningSurfaceColorSamples(source: Uint8Array): Uint8Array {
  const size = profile.world.alphamapResolution,
    sourceSize = SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION;
  const pixels = new Uint8Array(size * size * 2);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const sx = (x * (sourceSize - 1)) / (size - 1),
        sz = (z * (sourceSize - 1)) / (size - 1);
      const x0 = Math.floor(sx),
        z0 = Math.floor(sz),
        x1 = Math.min(sourceSize - 1, x0 + 1),
        z1 = Math.min(sourceSize - 1, z0 + 1);
      const tx = sx - x0,
        tz = sz - z0;
      for (let c = 0; c < 2; c++)
        pixels[(z * size + x) * 2 + c] = Math.round(
          (source[(z0 * sourceSize + x0) * 2 + c] * (1 - tx) + source[(z0 * sourceSize + x1) * 2 + c] * tx) * (1 - tz) +
            (source[(z1 * sourceSize + x0) * 2 + c] * (1 - tx) + source[(z1 * sourceSize + x1) * 2 + c] * tx) * tz
        );
    }
  return pixels;
}

/** Load Seed's authored colour source and publish one shared ground/grass texture.
 * @param engine GPU resource owner.
 * @param seed Layout seed; never generates or replaces geometry.
 * @returns Caller-owned texture and Seed's unchanged material tuning.
 */
export async function createPlanningGrassColorField(
  engine: Engine,
  seed: number
): Promise<SeedWorldGrassColorFieldBinding> {
  const pixels = await preparePlanningSurfaceColorSamples(seed);
  const size = profile.world.alphamapResolution;
  const texture = new Texture2D(engine, size, size, TextureFormat.R8G8, true, false);
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  texture.filterMode = TextureFilterMode.Trilinear;
  texture.setPixelBuffer(pixels);
  texture.generateMipmaps();
  return { texture, tuning: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS };
}
