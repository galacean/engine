import { AssetPromise, Loader, LoadItem, resourceLoader, ResourceManager, Texture2D } from "@galacean/engine-core";
import { decode } from "../..";

@resourceLoader("EditorTexture2D", ["prefab"], true)
export class EditorTextureLoader extends Loader<Texture2D> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return (
      resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(item.url, { ...item, type: "arraybuffer" })
        .then((data: any) => decode<Texture2D>(data, resourceManager.engine))
    );
  }
}
