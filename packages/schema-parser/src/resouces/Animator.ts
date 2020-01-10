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
    if (key === "options") {
      this._resource[key] = this.parseDate(value);
    } else {
      super.update(key, value);
    }
  }
  attach() {
    const {
      props: { options }
    } = this.config;
    this._resource["options"] = this.parseDate(options);
    this.resource.onAttach && this.resource.onAttach(this.resource);
  }
}
