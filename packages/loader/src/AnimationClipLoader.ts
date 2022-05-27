import {
  AnimationClip,
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager
} from "@oasis-engine/core";

@resourceLoader(AssetType.AnimationClip, ["gltf", "glb"])
export class AnimationClipLoader extends Loader<AnimationClip> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AnimationClip> {
    const url = item.url;
    return new AssetPromise((resolve, reject) => {
      this.request(url, {
        type: "json"
      }).then((res) => {
        console.log("resourceLoader", res);
        resolve(new AnimationClip("animationClip"));
      });
    });
  }
}
