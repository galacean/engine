import {
  AssetPromise,
  AssetType,
  Entity,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";
import { PrefabParserContext } from "./resource-deserialize/resources/prefab/PrefabParserContext";
import { PrefabParser } from "./resource-deserialize";

export interface IPrefabContextData {
  context: PrefabParserContext;
  entity: Entity;
}

@resourceLoader(AssetType.Prefab, ["prefab"], false)
class PrefabLoader extends Loader<Entity | IPrefabContextData> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Entity | IPrefabContextData> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, { type: "json" })
        .then((data) => {
          const parser = PrefabParser.parse(engine, data);
          parser.promise.then((prefab) => {
            if (item?.params?.needContext) {
              resolve({
                context: parser.context,
                entity: prefab
              });
            } else {
              resolve(prefab);
            }
          });
        })
        .catch(reject);
    });
  }
}
