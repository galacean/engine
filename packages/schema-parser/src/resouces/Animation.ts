import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
const { Animation: AnimationAsset } = o3;
export class Animation extends SchemaResource {
  private config: AssetConfig;
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<Animation> {
    return new Promise(resolve => {
      this.config = assetConfig;
      const { name, props } = assetConfig;
      const assetObj = new AnimationAsset(name, props);
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

  parseDate(value) {
    const parseData = {};
    Object.keys(value).forEach(keyFrameTime => {
      const keyFrameList = value[keyFrameTime];
      parseData[keyFrameTime] = parseData[keyFrameTime] || [];
      keyFrameList.forEach(animationClipId => {
        const animationClip = this.resourceManager.get(animationClipId).resource;
        parseData[keyFrameTime].push(animationClip);
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
    console.log("bind", this._resource);
  }
}
