import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
console.log("o3", o3, o3.AnimationType, o3.AnimationClipNew);
const { Animation: AnimationAsset } = o3;
export class Animation extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<AnimationClip> {
    return new Promise(resolve => {
      const { name, props } = assetConfig;
      const { keyFrames } = props || {};
      const assetObj = new AnimationAsset(name, keyFrames);
      console.log(111, this.resourceManager.get("8"));
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
