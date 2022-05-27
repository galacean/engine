import {
  AnimatorController,
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager
} from "@oasis-engine/core";
import { GLTFParser } from "./gltf/GLTFParser";
import { GLTFResource } from "./gltf/GLTFResource";

@resourceLoader(AssetType.AnimatorController, ["gltf", "glb"])
export class AnimatorControllerLoader extends Loader<AnimatorController> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AnimatorController> {
    const url = item.url;
    return new AssetPromise((resolve, reject) => {
      this.request(url, {
        type: "json"
      }).then((res) => {
        console.log("resourceLoader", res);
        resolve(new AnimatorController());
      });
    });
  }
}
