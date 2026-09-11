import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  Loader,
  LoadItem,
  ModelMesh,
  RequestConfig,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";
import { decode } from "./resource-deserialize";

@resourceLoader(AssetType.Mesh, ["mesh"])
class MeshLoader extends Loader<ModelMesh> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<ModelMesh> {
    const requestConfig: RequestConfig = {
      ...item,
      type: "arraybuffer"
    };
    const remoteUrl = resourceManager._getRemoteUrl(item.url);
    return new AssetPromise((resolve, reject) => {
      resourceManager
        ._requestByRemoteUrl<ArrayBuffer>(remoteUrl, requestConfig)
        .then((data) => {
          return decode<ModelMesh>(data, resourceManager.engine);
        })
        .then((mesh: ModelMesh) => {
          resourceManager.addContentRestorer(new MeshContentRestorer(mesh, remoteUrl, requestConfig));
          resolve(mesh);
        })
        .catch(reject);
    });
  }
}

class MeshContentRestorer extends ContentRestorer<ModelMesh> {
  constructor(
    resource: ModelMesh,
    public remoteUrl: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<ModelMesh> {
    const resource = this.resource;
    const engine = resource.engine;
    return new AssetPromise((resolve, reject) => {
      engine.resourceManager
        ._requestByRemoteUrl<ArrayBuffer>(this.remoteUrl, this.requestConfig)
        .then((data) => {
          return decode<ModelMesh>(data, engine, resource);
        })
        .then((mesh) => {
          resolve(mesh);
        })
        .catch(reject);
    });
  }
}
