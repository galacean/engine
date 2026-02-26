import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  Loader,
  LoadItem,
  RequestConfig,
  resourceLoader,
  ResourceManager,
  Texture2D
} from "@galacean/engine-core";
import { parseSingleKTX } from "./compressed-texture";

@resourceLoader(AssetType.KTX, ["ktx"])
export class KTXLoader extends Loader<Texture2D> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    const requestConfig = <RequestConfig>{
      ...item,
      type: "arraybuffer"
    };
    return new AssetPromise((resolve, reject) => {
      resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(item.url, requestConfig)
        .then((bin) => {
          const parsedData = parseSingleKTX(bin);
          const { width, height, mipmaps, engineFormat } = parsedData;
          const mipmap = mipmaps.length > 1;
          const texture = new Texture2D(resourceManager.engine, width, height, engineFormat, mipmap, false);

          for (let miplevel = 0; miplevel < mipmaps.length; miplevel++) {
            const { width, height, data } = mipmaps[miplevel];
            texture.setPixelBuffer(data, miplevel, 0, 0, width, height);
          }
          resourceManager.addContentRestorer(new KTXContentRestorer(texture, item.url, requestConfig));
          resolve(texture);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}

class KTXContentRestorer extends ContentRestorer<Texture2D> {
  constructor(
    resource: Texture2D,
    public url: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<Texture2D> {
    const resource = this.resource;
    const engine = resource.engine;
    return new AssetPromise((resolve, reject) => {
      engine.resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(this.url, this.requestConfig)
        .then((bin) => {
          const mipmaps = parseSingleKTX(bin).mipmaps;
          for (let miplevel = 0; miplevel < mipmaps.length; miplevel++) {
            const { width, height, data } = mipmaps[miplevel];
            resource.setPixelBuffer(data, miplevel, 0, 0, width, height);
          }
          resolve(resource);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
