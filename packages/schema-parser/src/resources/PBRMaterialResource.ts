import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { ResourceLoader, Logger } from "@alipay/o3";

import { TextureResource } from "./TextureResource";
import { AssetConfig, LoadAttachedResourceResult } from "../types";

export class PBRMaterialResource extends SchemaResource {
  static textureArr = [
    "baseColorTexture",
    "metallicTexture",
    "roughnessTexture",
    "metallicRoughnessTexture",
    "normalTexture",
    "emissiveTexture",
    "occlusionTexture",
    "opacityTexture",
    "specularGlossinessTexture",
    "perturbationTexture",
    "refractionTexture",
    "reflectionTexture"
  ];

  static propsKey = [
    "isMetallicWorkflow",
    "envMapIntensity",
    "metallicFactor",
    "roughnessFactor",
    "metallicRoughnessTexture",
    "glossinessFactor",
    "specularFactor",
    "specularGlossinessTexture",
    "normalScale",
    "alphaCutoff",
    "clearCoat",
    "clearCoatRoughness",
    "doubleSided",
    "unlit",
    "srgb",
    "gamma",
    "alphaMode",
    "baseColorFactor",
    "emissiveFactor",
    "baseColorTexture",
    "normalTexture",
    "emissiveTexture",
    "occlusionTexture",
    "occlusionStrength",
    "opacity",
    "getOpacityFromRGB",
    "refractionRatio",
    "envMapModeRefract",
    "perturbationUOffset",
    "perturbationVOffset",
    "refractionDepth"
  ];

  load(resourceLoader: ResourceLoader, assetConfig: AssetConfig): Promise<PBRMaterialResource> {
    return new Promise(resolve => {
      const assetObj = new o3.PBRMaterial(assetConfig.name);
      for (let k in assetConfig.props) {
        assetObj[k] = assetConfig.props[k];
      }
      this._resource = assetObj;
      this.setMeta();
      resolve(this);
    });
  }

  loadWithAttachedResources(
    resourceLoader: ResourceLoader,
    assetConfig: AssetConfig
  ): Promise<LoadAttachedResourceResult> {
    return new Promise(resolve => {
      this.load(resourceLoader, assetConfig).then(() => {
        const result: any = {
          resources: [this],
          structure: {
            index: 0,
            props: {}
          }
        };

        const material = this._resource;
        PBRMaterialResource.textureArr.forEach(attr => {
          if (!(material[attr] instanceof o3.Texture)) return;
          const textureResource = new TextureResource(this.resourceManager, material[attr]);
          this.attachedResources.push(textureResource);
          result.resources.push(textureResource);
          result.structure.props[attr] = {
            index: result.resources.length - 1
          };
        });
        resolve(result);
      });
    });
  }

  setMeta() {
    if (this.resource) {
      this.meta.name = this.resource.name;
    }
  }

  getProps() {
    const result = {};
    for (let k in PBRMaterialResource.propsKey) {
      result[k] = this.resource[k];
    }
    return result;
  }

  bind() {
    // 替换PBR材质中的纹理
    const resource = this._resource;
    PBRMaterialResource.textureArr.forEach(attr => {
      const value = resource[attr];
      if (value && value.type === "asset") {
        const textureResource = this.resourceManager.get(value.id);
        if (textureResource && textureResource instanceof TextureResource) {
          resource[attr] = textureResource.resource;
          this._attachedResources.push(textureResource);
        } else {
          resource[attr] = null;
          Logger.warn(`PBRMaterialResource: ${this.meta.name} can't find asset "${attr}", which id is: ${value.id}`);
        }
      }
    });
  }
}
