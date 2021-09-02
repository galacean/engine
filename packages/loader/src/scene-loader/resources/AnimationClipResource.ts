import {
  ResourceManager,
} from "@oasis-engine/core";
import { AssetConfig, LoadAttachedResourceResult } from "../types";
import { SchemaResource } from "./SchemaResource";

export class AnimationClipResource extends SchemaResource {
  load(resourceManager: ResourceManager, assetConfig: AssetConfig): Promise<any> {
    return new Promise((resolve) => {
      this._resource = assetConfig.props || {};
      this.setMeta();
      resolve(this);
    });
  }

  loadWithAttachedResources(
    resourceManager: ResourceManager,
    assetConfig: AssetConfig
  ): Promise<LoadAttachedResourceResult> {
    return new Promise((resolve, reject) => {
      let loadPromise;
      if (assetConfig.props) {
        loadPromise = this.load(resourceManager, assetConfig);
      } else {
        reject("Load AnimationClip Error");
      }
      if (loadPromise) {
        loadPromise.then(() => {
          const result: any = {
            resources: [this],
            structure: {
              index: 0,
              props: {}
            }
          };
          resolve(result);
        });
      }
    });
  }

  setMeta() {
    if (this.resource) {
      this.meta.name = this.resource.name;
    }
  }

  getProps() {
    return this._resource;
  }
}
