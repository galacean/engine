import { SchemaResource } from "./SchemaResource";
import { AbilityManager } from "../AbilityManager";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
const { Animator: AnimatorAsset } = o3;
export class Animator extends SchemaResource {
  private config: AssetConfig;
  private abilityManager: AbilityManager;
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig, { abilityManager }): Promise<Animator> {
    return new Promise(resolve => {
      this.config = assetConfig;
      this.abilityManager = abilityManager;
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

  parseDate(value) {
    const { keyFrames = {} } = value;
    const parseData = {};
    Object.keys(keyFrames).forEach(keyFrameTime => {
      const keyFrameList = keyFrames[keyFrameTime];
      parseData[keyFrameTime] = parseData[keyFrameTime] || [];
      keyFrameList.forEach(animationId => {
        const animation = this.abilityManager.get(animationId);
        parseData[keyFrameTime].push(animation);
      });
    });
    return {
      ...value,
      keyFrames: parseData
    };
  }

  update(key: string, value: any) {
    console.log("Animator11", key, value);
    if (key === "options") {
      this.resource[key] = this.parseDate(value);
      console.log(this.resource);
    } else {
      super.update(key, value);
    }
  }
  attach() {
    const {
      props: { options }
    } = this.config;
    console.log("attach", options);
    this.resource["options"] = this.parseDate(options);
  }
}
