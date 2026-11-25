import {
  AnimationClip,
  AnimationRefCurve,
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  ReferResource,
  ResourceManager,
  resourceLoader
} from "@galacean/engine-core";
import { decode } from "./resource-deserialize";

@resourceLoader(AssetType.AnimationClip, ["anim"])
class AnimationClipLoader extends Loader<AnimationClip> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AnimationClip> {
    return new AssetPromise((resolve, reject) => {
      resourceManager
        ._request<ArrayBuffer>(item.url!, {
          ...item,
          type: "arraybuffer"
        })
        .then((data) => {
          return decode<AnimationClip>(data, resourceManager.engine)
            .then((clip) => {
              const curveBindings = clip.curveBindings;
              const promises: Promise<void>[] = [];
              for (let i = 0, n = curveBindings.length; i < n; i++) {
                const curve = curveBindings[i].curve;
                if (!(curve instanceof AnimationRefCurve)) continue;
                for (let j = 0, m = curve.keyCount; j < m; j++) {
                  const key = curve.getKey(j);
                  const value = key.value as { url?: string } | null;
                  if (typeof value === "object" && value?.url) {
                    const keyIndex = j;
                    promises.push(
                      resourceManager.getResourceByRef<ReferResource>(value as never).then((asset: ReferResource) => {
                        key.value = asset;
                        curve.setKey(keyIndex, key);
                      })
                    );
                  }
                }
              }
              return Promise.all(promises).then(() => {
                resolve(clip);
              });
            })
            .catch(reject);
        })
        .catch(reject);
    });
  }
}
