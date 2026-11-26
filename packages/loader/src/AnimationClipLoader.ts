import {
  AnimationClip,
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  ReferResource,
  ResourceManager,
  resourceLoader
} from "@galacean/engine-core";
import { decode } from "./resource-deserialize";
import type { RefItem } from "./schema/CommonSchema";

@resourceLoader(AssetType.AnimationClip, ["anim"])
class AnimationClipLoader extends Loader<AnimationClip> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AnimationClip> {
    return resourceManager
      ._request<ArrayBuffer>(item.url!, { ...item, type: "arraybuffer" })
      .then((data) =>
        decode<AnimationClip>(data, resourceManager.engine, (ref: RefItem) =>
          resourceManager.getResourceByRef<ReferResource>(ref)
        )
      );
  }
}
