import { Texture2D, type Engine } from "@galacean/engine-core";
import type { WaterResourceAssetDescriptorV1 } from "../authoring/body/WaterBodyAuthoringTypes";
import type { WaterRuntimeResourceFactory } from "../runtime/resources/WaterRuntimeResourceRegistry";
import { digestSha256Hex } from "../resources/sha256";

/** Editable Source and native project assets. Camera and Terrain hosts remain application inputs. */
export const BUILTIN_WATER_PROJECT_URL = new URL("./assets/project.json", import.meta.url).href;
const conversionURL = new URL("./assets/conversion.json", import.meta.url).href;
interface TextureAsset {
  target: string;
  type: string;
  sha256: string;
  width: number;
  height: number;
  params: Record<string, any>;
}
let converted: Promise<TextureAsset[]> | undefined;
async function textures(): Promise<TextureAsset[]> {
  return (converted ??= fetch(conversionURL)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Water asset conversion manifest: HTTP ${response.status}.`);
      return response.json();
    })
    .catch((error) => {
      converted = undefined;
      throw error;
    }));
}

/** Runtime-only demos borrow the same converted native assets as editable projects. */
export async function loadBuiltinWaterTexture(engine: Engine, path: string, signal?: AbortSignal): Promise<Texture2D> {
  const asset = (await textures()).find((asset) => asset.target === path);
  if (!asset || !["Texture", "KTX2"].includes(asset.type)) throw new Error(`Missing native Water texture '${path}'.`);
  const url = new URL(path, BUILTIN_WATER_PROJECT_URL).href;
  const response = await fetch(url, { signal });
  if (!response.ok || (await digestSha256Hex(await response.arrayBuffer())) !== asset.sha256)
    throw new Error(`Native Water texture '${path}' failed its source hash check.`);
  signal?.throwIfAborted();
  const texture = await engine.resourceManager.load<Texture2D>({ url, type: asset.type, params: asset.params });
  texture._addReferCount(1);
  try {
    signal?.throwIfAborted();
    if (
      texture.destroyed ||
      texture.width !== asset.width ||
      texture.height !== asset.height ||
      texture.isSRGBColorSpace !== asset.params.isSRGBColorSpace
    )
      throw new Error(`Native Water texture '${path}' has incompatible dimensions or color space.`);
    return texture;
  } catch (error) {
    texture._addReferCount(-1);
    texture.destroy();
    throw error;
  }
}

export function builtinWaterTextureFactory(
  engine: Engine,
  descriptor: WaterResourceAssetDescriptorV1,
  path: string
): WaterRuntimeResourceFactory {
  return {
    descriptor,
    load: async ({ signal }) => ({ texture: await loadBuiltinWaterTexture(engine, path, signal) }),
    destroy: (resource) => {
      const texture = (resource as { texture: Texture2D }).texture;
      texture._addReferCount(-1);
      texture.destroy();
    }
  };
}
