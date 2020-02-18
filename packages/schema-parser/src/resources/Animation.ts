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
    Object.keys(value).forEach(keyFrameTime => {
      const keyFrameList = value[keyFrameTime];
      parseData[keyFrameTime] = parseData[keyFrameTime] || [];
      keyFrameList.forEach(animationClipId => {
        const animationClipResource = this.resourceManager.get(animationClipId);
        if (animationClipResource) {
          const animationClip = animationClipResource.resource;
          parseData[keyFrameTime].push(animationClip);
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
    if (key === "keyFrames") {
      this._resource[key] = this.parseDate(value);
    } else {
      super.update(key, value);
    }
  }

  bind() {
    const {
      props: { keyFrames }
    } = this.config;
    this._resource["keyFrames"] = this.parseDate(keyFrames);
  }
}
