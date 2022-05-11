import {
  AssetPromise,
  Loader,
  LoadItem,
  Mesh,
  ModelMesh,
  resourceLoader,
  ResourceManager,
  Texture2D,
  UnlitMaterial
} from "@oasis-engine/core";
import { decode } from "../..";

@resourceLoader("EditorTexture2D", ["prefab"], true)
export class EditorTextureLoader extends Loader<Texture2D> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      this.request<ArrayBuffer>(item.url, { type: "arraybuffer" }).then((data) => {
        decode<Texture2D>(data, resourceManager.engine).then((texture) => {
          resolve(texture);
        });
      });
    });
  }
}
