import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  AnimationClip,
  ReferResource
} from "@galacean/engine-core";
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
            const curveBindingPromises = clip.curveBindings.map((curveBinding) => {
              const { curve } = curveBinding;
              const promises = curve.keys.map((key) => {
                const value = key.value;
                if (typeof value === "object" && (value as any).refId) {
                  return new Promise((resolve) => {
                    resourceManager
                      // @ts-ignore
                      .getResourceByRef<ReferResource>(value as any)
                      .then((asset: ReferResource) => {
                        key.value = asset;
                        resolve(key);
                      })
                      .catch(reject);
                  });
                }
              });
              return Promise.all(promises);
            });
            return Promise.all(curveBindingPromises).then(() => {
              resolve(clip);
            });
          });
        })
        .catch(reject);
    });
  }
}
