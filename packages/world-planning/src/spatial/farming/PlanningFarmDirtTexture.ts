import {
  AssetType,
  type Engine,
  KTX2TargetFormat,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode
} from "@galacean/engine";

/** Shared manor/natural-soil source. Arrays of distinct diffuse maps require an RGBA8 copy. */
export async function loadPlanningFarmDirtTexture(engine: Engine, forTextureArray = false): Promise<Texture2D> {
  const url = new URL("../../assets/farm-land/dirt-flat-color-512.ktx2", import.meta.url);
  if (forTextureArray) url.searchParams.set("terrainFormat", "rgba8");
  const texture = await engine.resourceManager.load<Texture2D>({
    type: AssetType.KTX2,
    url: url.href,
    ...(forTextureArray ? { params: { priorityFormats: [KTX2TargetFormat.R8G8B8A8] } } : {})
  });
  texture.filterMode = TextureFilterMode.Trilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.anisoLevel = 4;
  return texture;
}
