import { type Engine, type Texture2D } from "@galacean/engine-core";
import { loadBuiltinWaterTexture } from "../../native/WaterBuiltinAssets";
import { WATER_BUILTIN_MATERIAL_TEXTURE_PATHS } from "../../native/WaterBuiltinMaterialTextures";
import { describeOceanTextures, type OceanTextures } from "./OceanTextures";
export {
  describeOceanTextures,
  computeOceanTextureResourceBytes,
  isOceanTextureCompressedFormat,
  type OceanTextures
} from "./OceanTextures";

/** Page-owned, immutable texture bundle for the sole Ocean Look. */
export class OceanTextureLibrary {
  readonly textures: Readonly<OceanTextures>;
  private _destroyed = false;

  private constructor(private readonly _resources: readonly Texture2D[]) {
    this.textures = describeOceanTextures(_resources);
  }

  static async create(engine: Engine): Promise<OceanTextureLibrary> {
    const paths = WATER_BUILTIN_MATERIAL_TEXTURE_PATHS.ocean;
    const requests = Object.values(paths).map((path) => loadBuiltinWaterTexture(engine, path));
    const settled = await Promise.allSettled(requests);
    const resources = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const rejected = settled.find((result) => result.status === "rejected");
    if (rejected) {
      for (const resource of resources) releaseTexture(resource);
      throw rejected.reason;
    }
    return new OceanTextureLibrary(resources);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const resource of this._resources) releaseTexture(resource);
  }
}

// ResourceManager may return the same cached texture to several Scene owners.
function retainTexture(texture: Texture2D, delta: number): void {
  (texture as unknown as { _addReferCount(delta: number): void })._addReferCount(delta);
}
function releaseTexture(texture: Texture2D): void {
  if (texture.destroyed) return;
  retainTexture(texture, -1);
}
