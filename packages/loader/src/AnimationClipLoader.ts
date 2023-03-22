import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  AnimationClip,
  AnimationEvent
} from "@oasis-engine/core";
import { decode } from "./resource-deserialize";

@resourceLoader(AssetType.AnimationClip, ["ani"])
class AnimationClipLoader extends Loader<AnimationClip> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AnimationClip> {
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, {
        ...item,
        type: "arraybuffer"
      })
        .then((data) => {
          return decode<AnimationClip>(data, resourceManager.engine);
        })
        .catch(reject);
    });
  }
}
