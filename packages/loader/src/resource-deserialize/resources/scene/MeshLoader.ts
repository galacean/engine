import {
  AssetPromise,
  Loader,
  LoadItem,
  Mesh,
  ModelMesh,
  resourceLoader,
  ResourceManager,
  UnlitMaterial
} from "@oasis-engine/core";
import { decode } from "../..";

@resourceLoader("Mesh", ["prefab"], true)
export class MeshLoader extends Loader<ModelMesh> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<ModelMesh> {
    return new AssetPromise((resolve, reject) => {
      this.request<ArrayBuffer>(item.url, { type: "arraybuffer" }).then((data) => {
        decode<ModelMesh>(data, resourceManager.engine).then((mesh) => {
          resolve(mesh);
        });
      });
    });
  }
}
