import { AssetType, type Engine, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine";

/** One ResourceManager-owned texture, shared by manor ground and natural soil. */
export async function loadPlanningFarmDirtTexture(engine: Engine): Promise<Texture2D> {
  const texture = await engine.resourceManager.load<Texture2D>({
    type: AssetType.KTX2,
    url: new URL("../../assets/farm-land/dirt-flat-color-512.ktx2", import.meta.url).href
  });
  texture.filterMode = TextureFilterMode.Trilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.anisoLevel = 4;
  return texture;
}
