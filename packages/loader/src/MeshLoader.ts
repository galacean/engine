import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  Loader,
  LoadItem,
  ModelMesh,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";
import { decode } from "./resource-deserialize";

@resourceLoader(AssetType.Mesh, ["mesh"])
class MeshLoader extends Loader<ModelMesh> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<ModelMesh> {
    return new AssetPromise((resolve, reject) => {
      const request = this.request;
      const engine = resourceManager.engine;
      request<any>(item.url, {
        ...item,
        type: "arraybuffer"
      })
        .then((data) => {
          return decode<ModelMesh>(data, engine);
        })
        .then((mesh) => {
          resourceManager.addContentRestorer(
            new (class extends ContentRestorer<ModelMesh> {
              restoreContent() {
                return new AssetPromise<ModelMesh>((resolve, reject) => {
                  request<any>(item.url, {
                    ...item,
                    type: "arraybuffer"
                  })
                    .then((data) => {
                      return decode<ModelMesh>(data, engine, mesh);
                    })
                    .then((mesh) => {
                      resolve(mesh);
                    })
                    .catch(reject);
                });
              }
            })(mesh)
          );
          resolve(mesh);
        })
        .catch(reject);
    });
  }
}
