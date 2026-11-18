import { builtinWaterTextureDescriptor } from "./WaterBuiltinTextureIdentity";
export { builtinWaterTextureDescriptor } from "./WaterBuiltinTextureIdentity";
import { Texture2D, type Engine } from "@galacean/engine-core";
import type { WaterResourceAssetDescriptorV1 } from "../authoring/body/WaterBodyAuthoringTypes";
import { digestSha256Hex } from "../resources/sha256";
import type { WaterRuntimeResourceFactory } from "../runtime/resources/WaterRuntimeResourceRegistry";

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
const resolvers = new WeakMap<Engine, (path: string) => string>();
const converted = new WeakMap<Engine, Promise<TextureAsset[]>>();

/** Host-owned delivery URLs for the same immutable native resource closure. */
export function configureWaterBuiltinAssets(engine: Engine, resolve: (path: string) => string): void {
  if (converted.has(engine)) throw new Error("Water built-in assets cannot change after their first load.");
  resolvers.set(engine, resolve);
}

async function textures(engine: Engine): Promise<TextureAsset[]> {
  let loading = converted.get(engine);
  if (loading) return loading;
  loading = fetch(resolvers.get(engine)?.("conversion.json") ?? conversionURL)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Water asset conversion manifest: HTTP ${response.status}.`);
      return response.json();
    })
    .catch((error) => {
      converted.delete(engine);
      throw error;
    });
  converted.set(engine, loading);
  return loading;
}

/** Runtime-only demos borrow the same converted native assets as editable projects. */
export async function loadBuiltinWaterTexture(engine: Engine, path: string, signal?: AbortSignal): Promise<Texture2D> {
  const asset = (await textures(engine)).find((asset) => asset.target === path);
  if (!asset || !["Texture", "KTX2"].includes(asset.type)) throw new Error(`Missing native Water texture '${path}'.`);
  if (asset.sha256 !== builtinWaterTextureDescriptor(path).contentHash)
    throw new Error(`Native Water texture '${path}' does not match the packaged conversion identity.`);
  const url = resolvers.get(engine)?.(path) ?? new URL(path, BUILTIN_WATER_PROJECT_URL).href;
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
