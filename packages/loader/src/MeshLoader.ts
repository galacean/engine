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
    const url = item.url;
    return new AssetPromise((resolve, reject) => {
      resourceManager
        // @ts-ignore
        ._request(url, requestConfig)
        .then((data) => {
          // @ts-ignore
          return decode<ModelMesh>(data, resourceManager.engine);
        })
        .then((mesh: ModelMesh) => {
          resourceManager.addContentRestorer(new MeshContentRestorer(mesh, url, requestConfig));
          resolve(mesh);
        })
        .catch(reject);
    });
  }
}

class MeshContentRestorer extends ContentRestorer<ModelMesh> {
  constructor(
    resource: ModelMesh,
    public url: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<ModelMesh> {
    const resource = this.resource;
    const engine = resource.engine;
    return new AssetPromise((resolve, reject) => {
      engine.resourceManager
        // @ts-ignore
        ._request<any>(this.url, this.requestConfig)
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
