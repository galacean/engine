import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
const { AnimationClipNew, AnimationClipType } = o3;
export class AnimationClip extends SchemaResource {
  config: AssetConfig;
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<AnimationClip> {
    return new Promise(resolve => {
      this.config = assetConfig;
      const { name, props } = assetConfig;
      const { type = "Interpolation", options = {} } = props || {};
      const assetObj = new AnimationClipNew(name, AnimationClipType[type], options);
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

  bind() {
    const { Skeleton, AnimationComponent } = AnimationClipType;
    const { AnimationClipType: type } = this.resource;
    switch (type) {
      case Skeleton:
        const {
          props: {
            options: { gltfAssetId, action }
          }
        } = this.config;
        const { animations } = this.resourceManager.get(gltfAssetId).resource;
        let actionMap = [];
        animations.forEach(clip => {
          actionMap[clip.name] = clip;
        });
        this._resource.options = actionMap[action];
        break;
      case AnimationComponent:
        break;
    }
  }
}
