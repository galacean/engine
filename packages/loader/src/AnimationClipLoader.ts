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
          return decode<AnimationClip>(data, resourceManager.engine).then((clip) => {
            const promises: Promise<AnimationEvent>[] = clip.events.map((event) => {
              return new Promise((resolve) => {
                if (typeof event.parameter === "object") {
                  // @ts-ignore
                  resourceManager.getResourceByRef(event.parameter).then((asset) => {
                    event.parameter = asset;
                  });
                }

                resolve(event);
              });
            });

            Promise.all(promises).then((res) => {
              resolve(clip);
            });
          });
        })
        .catch(reject);
    });
  }
}
