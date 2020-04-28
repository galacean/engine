import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
import { Logger } from "@alipay/o3";
const { Animation: AnimationAsset } = o3;

export class Animation extends SchemaResource {
  private config: AssetConfig;
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<Animation> {
    return new Promise(resolve => {
      this.config = assetConfig;
      const { name, props } = assetConfig;
      const assetObj = new AnimationAsset(name, props);
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

  parseDate(value) {
    const parseData = {};
    Object.keys(value).forEach(keyframeTime => {
      const keyframeList = value[keyframeTime];
      parseData[keyframeTime] = parseData[keyframeTime] || [];
      keyframeList.forEach(animationClipId => {
        const animationClipResource = this.resourceManager.get(animationClipId);
        if (animationClipResource) {
          const animationClip = animationClipResource.resource;
          parseData[keyframeTime].push(animationClip);
        } else {
          Logger.warn(
            `AnimationResource: ${this.meta.name} can't find asset "animationClip", which id is: ${animationClipId}`
          );
        }
      });
    });
    return parseData;
  }

  update(key: string, value: any) {
    if (key === "keyframes") {
      this._resource[key] = this.parseDate(value);
    } else {
      super.update(key, value);
    }
  }

  bind() {
    const {
      props: { keyframes }
    } = this.config;
    this._resource["keyframes"] = this.parseDate(keyframes);
  }
}
