import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  Texture2D,
  ResourceManager
} from "@oasis-engine/core";
import { decode } from "./custom-file-loaders";

@resourceLoader(AssetType.EditorFile, ["oasis"], false)
class EditorFileLoader<T> extends Loader<T> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<T> {
    return new AssetPromise((resolve, reject) => {
      this.request<ArrayBuffer>(item.url, {
        ...item,
        type: "arraybuffer"
      })
        .then((ab) => decode(ab, resourceManager.engine))
        .then((object) => {
          resolve(object);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }
}
