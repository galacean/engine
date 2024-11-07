import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  ModelMesh
} from "@galacean/engine-core";
import { decode } from "./resource-deserialize";

@resourceLoader(AssetType.Mesh, ["mesh"])
class MeshLoader extends Loader<ModelMesh> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<ModelMesh> {
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, resourceManager, {
        ...item,
        type: "arraybuffer"
      })
        .then((data) => {
          return decode<ModelMesh>(data, resourceManager.engine);
        })
        .then((mesh) => {
          resolve(mesh);
        })
        .catch(reject);
    });
  }
}
