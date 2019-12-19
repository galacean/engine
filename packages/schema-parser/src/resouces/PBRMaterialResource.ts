import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { ResourceManager } from "../ResourceManager";

export class PBRMaterialResource extends SchemaResource {
  static textureArr = [
    "metallicRoughnessTexture",
    "specularGlossinessTexture",
    "baseColorTexture",
    "normalTexture",
    "emissiveTexture",
    "occlusionTexture"
  ];

  load(): Promise<PBRMaterialResource> {
    return new Promise(resolve => {
      const assetObj = new o3.PBRMaterial(this.assetConfig.name);
      for (let k in this.assetConfig.props) {
        assetObj[k] = this.assetConfig.props[k];
      }
      this._resource = assetObj;
      resolve(this);
    });
  }

  bind(resourceManager: ResourceManager) {
    // 替换PBR材质中的纹理
    const resource = this._resource;
    PBRMaterialResource.textureArr.map(attr => {
      const value = resource[attr];
      if (value && resourceManager.get(value.id)) {
        resource[attr] = resourceManager.get(value.id).resource.asset;
      }
    });
  }

  update(key: string, value: any) {
    if (key.indexOf("Texture") > -1) {
      this._resource[key] = value.asset;
    } else {
      this._resource[key] = value;
    }
  }
}
