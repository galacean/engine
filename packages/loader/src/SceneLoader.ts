import {
  AssetPromise,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  SpriteAtlas,
  AssetType,
  Entity,
  Scene
} from "@oasis-engine/core";
import { decode } from "@oasis-engine/resource-process";

// @resourceLoader(AssetType.Scene, ["prefab"], true)
// class SceneLoader extends Loader<Scene> {
//   load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Scene> {
//     return new AssetPromise((resolve, reject) => {
//       this.request<ArrayBuffer>(item.url, { type: "arraybuffer" })
//         .then((arraybuffer) => decode<Entity>(arraybuffer, resourceManager.engine).then(resolve).catch(reject))
//         .catch(reject);
//     });
//   }
// }
