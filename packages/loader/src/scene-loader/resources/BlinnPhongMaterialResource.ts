import { BlinnPhongMaterial, ResourceManager } from "@oasis-engine/core";
import { AssetConfig } from "../types";
import { SchemaResource } from "./SchemaResource";

export class BlinnPhongMaterialResource extends SchemaResource {
  load(resourceManager: ResourceManager, assetConfig: AssetConfig): Promise<BlinnPhongMaterialResource> {
    return new Promise((resolve) => {
      const assetObj = new BlinnPhongMaterial(resourceManager.engine, assetConfig.name);
      for (let k in assetConfig.props) {
        assetObj[k] = assetConfig.props[k];
      }
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
