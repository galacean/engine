import { builtinWaterTextureDescriptor } from "./WaterBuiltinTextureIdentity";
export { builtinWaterTextureDescriptor } from "./WaterBuiltinTextureIdentity";
import { Texture2D, type Engine } from "@galacean/engine-core";
import type { WaterResourceAssetDescriptorV1 } from "../authoring/body/WaterBodyAuthoringTypes";
import { digestSha256Hex } from "../resources/sha256";
import type { WaterRuntimeResourceFactory } from "../runtime/resources/WaterRuntimeResourceRegistry";
import builtinWaterProjectManifest from "./assets/project.json";

/** Editable Source and native project assets. Camera and Terrain hosts remain application inputs. */
export const BUILTIN_WATER_PROJECT_URL = new URL("./assets/project.json", import.meta.url).href;
const builtinWaterAssetUrls = import.meta.glob("./assets/Water/{Materials,Textures,Shaders}/*", {
  eager: true,
  as: "url"
});
/** Lazy remote entries for core Water materials, textures, and shaders so projects do not eagerly fetch KTX2s at boot. */
export const builtinWaterDefaultFiles = builtinWaterProjectManifest.files
  .filter((file) => /^Water\/(Materials|Textures|Shaders)\//.test(file.virtualPath))
  .map((file) => {
    const resolved = builtinWaterAssetUrls[`./assets/${file.path}`];
    return {
      ...file,
      path: resolved ? new URL(resolved, import.meta.url).href : new URL(file.path, BUILTIN_WATER_PROJECT_URL).href
    };
  });
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
const loadedBuiltinTextures = new WeakMap<Engine, Map<string, Texture2D>>();

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
  const staticAsset = builtinWaterAssetUrls[`./assets/${path}`];
  const url =
    resolvers.get(engine)?.(path) ??
    (staticAsset ? new URL(staticAsset, import.meta.url).href : new URL(path, BUILTIN_WATER_PROJECT_URL).href);
  const engineCacheExisting = loadedBuiltinTextures.get(engine);
  // A delivery URL can alias another asset. Cache only the validated logical texture.
  const existingTexture = engineCacheExisting?.get(path);
  if (existingTexture) {
    if (!existingTexture.destroyed && !existingTexture.pendingDestroy) {
      signal?.throwIfAborted();
      existingTexture._addReferCount(1);
      return existingTexture;
    }
    engineCacheExisting!.delete(path);
  }
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Native Water texture '${path}' failed its source hash check.`);
  const bytes = await response.arrayBuffer();
  if ((await digestSha256Hex(bytes)) !== asset.sha256)
    throw new Error(`Native Water texture '${path}' failed its source hash check.`);
  signal?.throwIfAborted();
  const engineCacheAfterFetch = loadedBuiltinTextures.get(engine);
  const cachedAfterFetch = engineCacheAfterFetch?.get(path);
  if (cachedAfterFetch) {
    if (!cachedAfterFetch.destroyed && !cachedAfterFetch.pendingDestroy) {
      cachedAfterFetch._addReferCount(1);
      return cachedAfterFetch;
    }
    engineCacheAfterFetch!.delete(path);
  }
  // Avoid a second network request when loading from an HTTP URL; reuse the already-fetched bytes via a Blob URL.
  const blobUrl = url.startsWith("blob:")
    ? undefined
    : URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  let texture: Texture2D;
  try {
    texture = await engine.resourceManager.load<Texture2D>({
      url: blobUrl ?? url,
      type: asset.type,
      params: asset.params
    });
  } catch (error) {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    throw error;
  }
  texture._addReferCount(1);
  let engineCache = loadedBuiltinTextures.get(engine);
  if (!engineCache) {
    engineCache = new Map();
    loadedBuiltinTextures.set(engine, engineCache);
  }
  let blobRevoked = false;
  const originalDestroy = texture.destroy.bind(texture) as (force?: boolean, isGC?: boolean) => boolean;
  texture.destroy = ((force?: boolean, isGC?: boolean) => {
    try {
      return originalDestroy(force, isGC);
    } finally {
      if (texture.destroyed || texture.pendingDestroy) {
        if (engineCache!.get(path) === texture) engineCache!.delete(path);
      }
      if (texture.destroyed && blobUrl && !blobRevoked) {
        blobRevoked = true;
        URL.revokeObjectURL(blobUrl);
      }
    }
  }) as Texture2D["destroy"];
  try {
    signal?.throwIfAborted();
    if (
      texture.destroyed ||
      texture.pendingDestroy ||
      texture.width !== asset.width ||
      texture.height !== asset.height ||
      texture.isSRGBColorSpace !== asset.params.isSRGBColorSpace
    )
      throw new Error(`Native Water texture '${path}' has incompatible dimensions or color space.`);
    engineCache.set(path, texture);
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
