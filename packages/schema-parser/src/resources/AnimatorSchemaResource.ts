import { SchemaResource } from "./SchemaResource";
import { AbilityManager } from "../AbilityManager";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";
// const { AnimatorAsset } = o3;
export class AnimatorSchemaResource extends SchemaResource {
  private config: AssetConfig;
  private abilityManager: AbilityManager;
  load(
    resourceLoader: o3.ResourceLoader,
    assetConfig: AssetConfig,
    { abilityManager }
  ): Promise<AnimatorSchemaResource> {
    return new Promise((resolve) => {
      this.config = assetConfig;
      this.abilityManager = abilityManager;
      const { name, props } = assetConfig;
      const { keyframes } = props || {};
      // const assetObj = new AnimatorAsset(name, keyframes);//CM:松哥说先注释掉
      const assetObj = null;
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
    const { keyframes = {} } = value;
    const parseData = {};
    Object.keys(keyframes).forEach((keyframeTime) => {
      const keyframeList = keyframes[keyframeTime];
      parseData[keyframeTime] = parseData[keyframeTime] || [];
      keyframeList.forEach((animationId) => {
        const animation = this.abilityManager.get(animationId);
        parseData[keyframeTime].push(animation);
      });
    });
    return {
      ...value,
      keyframes: parseData
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
