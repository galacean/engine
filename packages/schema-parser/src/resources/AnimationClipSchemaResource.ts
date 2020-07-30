import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
import { AnimationClipNew, AnimationClipType, Logger } from "@alipay/o3";
export class AnimationClipSchemaResource extends SchemaResource {
  config: AssetConfig;
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<AnimationClipSchemaResource> {
    return new Promise((resolve) => {
      this.config = assetConfig;
      const { name, props } = assetConfig;
      const { type = "Interpolation", options = {} } = props || {};
      const assetObj = new AnimationClipNew(name, type, options);
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
    const { Skeleton: Skeleton, AnimationComponent } = AnimationClipType;
    const { AnimationClipType: type } = this.resource;
    switch (type) {
      case Skeleton:
        const {
          props: {
            options: { gltfAssetId, action }
          }
        } = this.config;
        const resource = this.resourceManager.get(gltfAssetId);
        if (resource) {
          const { animations } = resource.resource;
          let actionMap = [];
          animations.forEach((clip) => {
            actionMap[clip.name] = clip;
          });
          this._resource.options = actionMap[action];
        } else {
          Logger.warn(`AnimationClip: ${this.meta.name} can't find asset "gltf", which id is: ${gltfAssetId}`);
        }
        break;
      case AnimationComponent:
        break;
    }
  }
}
