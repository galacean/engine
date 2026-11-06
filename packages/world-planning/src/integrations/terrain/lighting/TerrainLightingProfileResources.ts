import { AssetType, type Engine, type JSONAsset } from "@galacean/engine";
import { decodeTerrainLightingProfile, type TerrainLightingProfileData } from "./TerrainLightingProfile.ts";

/** ResourceManager owns the shared JSONAsset and resolves native project resource references. */
export async function loadTerrainLightingProfile(
  engine: Engine,
  url: string
): Promise<{
  asset: JSONAsset;
  data: TerrainLightingProfileData;
}> {
  if (typeof url !== "string" || !url.trim()) throw new Error("Lighting profile requires an asset URL");
  const asset = await engine.resourceManager.load<JSONAsset>({ type: AssetType.JSON, url });
  return { asset, data: decodeTerrainLightingProfile(asset.data) };
}
