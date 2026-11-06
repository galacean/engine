import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  Loader,
  LoadItem,
  Mesh,
  RequestConfig,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";
import { decode } from "./resource-deserialize";

@resourceLoader(AssetType.Mesh, ["mesh"])
class MeshLoader extends Loader<Mesh> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Mesh> {
    const requestConfig: RequestConfig = {
      ...item,
      type: "arraybuffer"
    };
    const remoteUrl = resourceManager._getRemoteUrl(item.url!);
    return new AssetPromise((resolve, reject) => {
      resourceManager
        ._requestByRemoteUrl<ArrayBuffer>(remoteUrl, requestConfig)
        .then((data) => {
          return decode<Mesh>(data, resourceManager.engine);
        })
        .then((mesh: Mesh) => {
          resourceManager.addContentRestorer(new MeshContentRestorer(mesh, remoteUrl, requestConfig));
          resolve(mesh);
        })
        .catch(reject);
    });
  }
}

class MeshContentRestorer extends ContentRestorer<Mesh> {
  constructor(
    resource: Mesh,
    public remoteUrl: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<Mesh> {
    const resource = this.resource;
    const engine = resource.engine;
    return new AssetPromise((resolve, reject) => {
      engine.resourceManager
        ._requestByRemoteUrl<ArrayBuffer>(this.remoteUrl, this.requestConfig)
        .then((data) => {
          return decode<Mesh>(data, engine, resource);
        })
        .then((mesh) => {
          resolve(mesh);
        })
        .catch(reject);
    });
  }
}
