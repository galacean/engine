import {
  AssetPromise,
  AssetType,
  Engine,
  EngineConfiguration,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";
import { PrefabResource } from "./prefab/PrefabResource";
import { IHierarchyFile } from "./resource-deserialize";
import { PrefabParser } from "./prefab/PrefabParser";

@resourceLoader(AssetType.Prefab, ["prefab"])
export class PrefabLoader extends Loader<PrefabResource> {
  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<PrefabResource> {
    const engine = resourceManager.engine;

    return new AssetPromise((resolve, reject) => {
      this.request<IHierarchyFile>(item.url, {
        ...item,
        type: "json"
      }).then((data) => {
        PrefabParser.parse(engine, item.url, data).then(resolve).catch(reject);
      });
    });
  }
}
