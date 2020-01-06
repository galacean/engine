import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
console.log("o3", o3, o3.AnimationType, o3.AnimationClipNew);
const { Animator: AnimatorAsset } = o3;
export class Animator extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<AnimationClip> {
    return new Promise(resolve => {
      const { name, props } = assetConfig;
      const { keyFrames } = props || {};
      const assetObj = new AnimatorAsset(name, keyFrames);
      console.log("assetObj", assetConfig, assetObj);
      this._resource = assetObj;
      this.setMeta();
      resolve(this);
    });
  }

  setMeta() {
    if (this.resource) {
      this.meta.name = this.resource.name;
    }
  }
}
