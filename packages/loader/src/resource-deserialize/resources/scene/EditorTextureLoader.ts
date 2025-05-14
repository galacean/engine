import {
  AssetPromise,
  ContentRestorer,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  Texture2D
} from "@galacean/engine-core";
import { decode } from "../..";

@resourceLoader("EditorTexture2D", ["prefab"], true)
export class EditorTextureLoader extends Loader<Texture2D> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      const request = this.request;
      request<ArrayBuffer>(item.url, {
        ...item,
        type: "arraybuffer"
      })
        .then((data) => {
          decode<Texture2D>(data, resourceManager.engine).then((texture) => {
            resourceManager.addContentRestorer(
              new (class extends ContentRestorer<Texture2D> {
                override restoreContent(): AssetPromise<Texture2D> {
                  return request<ArrayBuffer>(item.url, {
                    ...item,
                    type: "arraybuffer"
                  }).then((data) => decode<Texture2D>(data, resourceManager.engine, texture));
                }
              })(texture)
            );
            resolve(texture);
          });
        })
        .catch(reject);
    });
  }
}
