import {
  AssetPromise,
  AssetType,
  Entity,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";
import { PrefabParser } from "./resource-deserialize";

@resourceLoader(AssetType.Prefab, ["prefab"], true)
class PrefabLoader extends Loader<Entity> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Entity> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, { type: "json" })
        .then((data) => {
          return PrefabParser.parse(engine, data).then((prefab) => {
            resolve(prefab);
          });
        })
        .catch(reject);
    });
  }
}
