import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";

export class BlinnPhongMaterialResource extends SchemaResource {
  load(): Promise<BlinnPhongMaterialResource> {
    return new Promise(resolve => {
      const assetObj = new o3.BlinnPhongMaterial(this.assetConfig.name);
      for (let k in this.assetConfig.props) {
        assetObj[k] = this.assetConfig.props[k];
      }
      this._resource = assetObj;
      resolve(this);
    });
  }
}
