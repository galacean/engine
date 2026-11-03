import { registerWaterContentRestorer } from "../../runtime/resources/WaterContentRestorer";
import { type Engine, AssetPromise, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine-core";
import { FARMLANDS_WAVE_RESOURCE, FARMLANDS_CAUSTICS_RESOURCE } from "./FarmlandsWaterAssets";
import { digestSha256Hex } from "../sha256";
import { FARMLANDS_DROP_ASSETS } from "./FarmlandsDropAssets";
import type { WaterRuntimeResourceLoadContext } from "../../runtime/resources/WaterRuntimeResourceRegistry";

/** Registry owns each texture. No ResourceManager cache is destroyed by another Scene's lease. */
export function createFarmlandsWaterResourceFactories(engine: Engine) {
  return [
    {
      descriptor: FARMLANDS_WAVE_RESOURCE,
      url: new URL("./assets/farmlands-wave-large.png", import.meta.url).href,
      size: 512,
      height: 512,
      srgb: false
    },
    {
      descriptor: FARMLANDS_CAUSTICS_RESOURCE,
      url: new URL("./assets/farmlands-caustics.png", import.meta.url).href,
      size: 1024,
      height: 1024,
      srgb: true
    },
    ...Object.values(FARMLANDS_DROP_ASSETS).map((asset) => ({
      ...asset,
      height: "height" in asset ? asset.height : asset.size
    }))
  ].map(({ descriptor, url, size, height, srgb }) => {
    const readBitmap = async (signal?: AbortSignal): Promise<ImageBitmap> => {
      signal?.throwIfAborted();
      const response = await fetch(url, { signal });
      if (!response.ok) throw Error(`${descriptor.id}: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const hash = await digestSha256Hex(bytes);
      if (hash !== descriptor.contentHash) throw Error(`${descriptor.id}: content hash mismatch`);
      return createImageBitmap(new Blob([bytes]), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    };
    const upload = (texture: Texture2D, bitmap: ImageBitmap): void => {
      if (bitmap.width !== size || bitmap.height !== height) throw Error(`${descriptor.id}: unexpected dimensions`);
      texture.setImageSource(bitmap);
      texture.generateMipmaps();
    };
    return {
      descriptor,
      async load({ signal }: WaterRuntimeResourceLoadContext = {}) {
        const bitmap = await readBitmap(signal);
        let texture: Texture2D | undefined;
        try {
          signal?.throwIfAborted();
          texture = new Texture2D(engine, size, height, undefined, true, srgb);
          texture.name = descriptor.id;
          upload(texture, bitmap);
          texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
          texture.filterMode = TextureFilterMode.Bilinear;
          const ownedTexture = texture;
          // Re-fetch the content-addressed PNG; retain neither RGBA pixels nor a live ImageBitmap.
          registerWaterContentRestorer(
            engine,
            ownedTexture,
            () =>
              new AssetPromise<Texture2D>((resolve, reject) => {
                readBitmap()
                  .then((bitmap) => {
                    try {
                      if (!ownedTexture.destroyed) upload(ownedTexture, bitmap);
                    } finally {
                      bitmap.close();
                    }
                  })
                  .then(() => resolve(ownedTexture), reject);
              })
          );
          return { texture };
        } catch (error) {
          texture?.destroy(true);
          throw error;
        } finally {
          bitmap.close();
        }
      },
      destroy(resource: unknown) {
        (resource as { texture: Texture2D }).texture.destroy(true);
      }
    };
  });
}
