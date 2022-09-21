import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  Sprite,
  Texture2D,
  ResourceManager,
  AnimatorController
} from "@oasis-engine/core";

@resourceLoader(AssetType.AnimatorController, ["animatorController"], false)
class AnimatorControllerLoader extends Loader<AnimatorController> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AnimatorController> {
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, {
        ...item,
        type: "json"
      }).then((data) => {
        console.log(333, data);
        resolve(new AnimatorController());
      });
    });
  }
}
