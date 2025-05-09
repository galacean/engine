import {
  AssetPromise,
  ContentRestorer,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  Texture2D
} from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { decode } from "../..";

@resourceLoader("EditorTexture2D", ["prefab"], true)
export class EditorTextureLoader extends Loader<Texture2D> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    const requestConfig = <RequestConfig>{
      ...item,
      type: "arraybuffer"
    };
    const url = item.url;
    return new AssetPromise((resolve, reject) => {
      resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(url, requestConfig)
        .then((data) => {
          decode<Texture2D>(data, resourceManager.engine).then((texture) => {
            resourceManager.addContentRestorer(new EditorTexture2DContentRestorer(texture, url, requestConfig));
            resolve(texture);
          });
        })
        .catch(reject);
    });
  }
}

class EditorTexture2DContentRestorer extends ContentRestorer<Texture2D> {
  constructor(
    resource: Texture2D,
    public url: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<Texture2D> {
    const texture = this.resource;
    const engine = texture.engine;
    return (
      engine.resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(this.url, this.requestConfig)
        .then((data) => decode<Texture2D>(data, engine, texture))
    );
  }
}
