import {
  AssetPromise,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  SpriteAtlas,
  AssetType,
  Entity
} from "@oasis-engine/core";
import { decode } from "@oasis-engine/resource-process";

// @resourceLoader(AssetType.Prefab, ["prefab"], true)
// class PrefabLoader extends Loader<Entity> {
//   load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Entity> {
//     return new AssetPromise((resolve, reject) => {
//       this.request<ArrayBuffer>(item.url, { type: "arraybuffer" })
//         .then((arraybuffer) => decode<Entity>(arraybuffer, resourceManager.engine).then(resolve).catch(reject))
//         .catch(reject);
//     });
//   }
// }
