import { AssetType, Engine, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine";

/**
 * Loads a linear repeating macro-noise texture through the engine resource pipeline.
 * @param engine Engine that owns the texture.
 * @param url Absolute noise texture URL.
 * @returns Linear repeating noise texture with mipmaps.
 * @throws If the resource is not a two-dimensional texture.
 */
export async function loadMacroNoiseTexture(engine: Engine, url: string): Promise<Texture2D> {
  const texture = await engine.resourceManager.load<Texture2D>({
    url,
    type: AssetType.Texture,
    params: {
      isSRGBColorSpace: false,
      mipmap: true,
      wrapModeU: TextureWrapMode.Repeat,
      wrapModeV: TextureWrapMode.Repeat,
      filterMode: TextureFilterMode.Trilinear,
      anisoLevel: 16
    }
  });
  if (!(texture instanceof Texture2D)) throw new Error(`[TerrainNoise] ${url} did not resolve to Texture2D`);
  return texture;
}
