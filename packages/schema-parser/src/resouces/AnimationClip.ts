import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
console.log("o3", o3);
export class AnimationClip extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<AnimationClip> {
    return new Promise(resolve => {
      const {
        name,
        props: { type, options }
      } = assetConfig;
      const assetObj = new o3.AnimationClipNew(name, type, options);
      console.log("assetObj", assetObj);
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
