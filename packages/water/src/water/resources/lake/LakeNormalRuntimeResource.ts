import type { Engine, Texture2D } from "@galacean/engine-core";
import { LakeNormalAssetLoader } from "./LakeNormalAssetLoader";
import { LAKE_NORMAL_RESOURCE } from "./LakeNormalAssetIdentity";

const LAKE_NORMAL_URL = new URL("./assets/grasslands-water-normal-512.ktx2", import.meta.url).href;

interface LakeNormalRegistryResource {
  readonly texture: Texture2D;
  readonly loader: LakeNormalAssetLoader;
  releaseBorrow(): void;
}

/** Shared runtime-resource factory for the strict Grasslands normal texture. */
export function createLakeNormalResourceFactory(engine: Engine): {
  readonly descriptor: typeof LAKE_NORMAL_RESOURCE;
  load(): Promise<LakeNormalRegistryResource>;
  destroy(resource: unknown): void;
} {
  return {
    descriptor: LAKE_NORMAL_RESOURCE,
    async load(): Promise<LakeNormalRegistryResource> {
      const loader = new LakeNormalAssetLoader(engine, {
        strict: true,
        source: "tracked",
        sourceUrl: LAKE_NORMAL_URL
      });
      try {
        const normal = await loader.load();
        if (!normal) throw new Error("Grasslands strict water normal did not produce a texture.");
        const releaseBorrow = loader.acquireRuntimeBorrow();
        return Object.freeze({ texture: normal.texture, loader, releaseBorrow });
      } catch (error) {
        loader.requestDisposeAfterRuntimeDetach();
        throw error;
      }
    },
    destroy(resource: unknown): void {
      const normal = resource as LakeNormalRegistryResource;
      normal.releaseBorrow();
      normal.loader.disposeAfterRuntimeDetach();
    }
  };
}
