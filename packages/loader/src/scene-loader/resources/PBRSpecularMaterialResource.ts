import { Logger, PBRSpecularMaterial, ResourceManager, Texture } from "@oasis-engine/core";
import { AssetConfig, LoadAttachedResourceResult } from "../types";
import { getAllGetters, isAsset } from "../utils";
import { SchemaResource } from "./SchemaResource";
import { TextureResource } from "./TextureResource";

const attrs = [
  "specularColor",
  "glossinessFactor",
  "specularGlossinessTexture",

  "tilingOffset",
  "baseColor",
  "normalIntensity",
  "emissiveColor",
  "occlusionStrength",
  "envMapIntensity",
  "refractionRatio",
  "refractionDepth",
  "perturbationUOffset",
  "perturbationVOffset",
  "baseTexture",
  "opacityTexture",
  "normalTexture",
  "emissiveTexture",
  "occlusionTexture",
  "refractionTexture",
  "perturbationTexture",
  "srgb",
  "srgbFast",
  "gamma",
  "getOpacityFromRGB",
  "isTransparent",
  "alphaCutoff",
  "renderFace",
  "blendMode"
];

export class PBRSpecularMaterialResource extends SchemaResource {
  private configProps;

  load(resourceManager: ResourceManager, assetConfig: AssetConfig): Promise<PBRSpecularMaterialResource> {
    return new Promise((resolve) => {
      const assetObj = new PBRSpecularMaterial(resourceManager.engine);
      this.configProps = assetConfig.props;
      this._resource = assetObj;

      for (let k in this.configProps) {
        if (!isAsset(this.configProps[k])) {
          assetObj[k] = this.configProps[k];
        }
      }
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
      if (assetConfig.resource instanceof PBRSpecularMaterial) {
        loadPromise = new Promise((resolve) => {
          this._resource = assetConfig.resource;
          this.setMeta();
          resolve(this);
        });
      } else if (assetConfig.props) {
        loadPromise = this.load(resourceManager, assetConfig);
      } else {
        reject("Load PBRSpecularMaterial Error");
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

          const material = this._resource;
          Object.keys(this._resource).forEach((attr) => {
            if (!(material[attr] instanceof Texture)) return;
            const textureResource = new TextureResource(this.resourceManager, material[attr]);
            this.attachedResources.push(textureResource);
            result.resources.push(textureResource);
            result.structure.props[attr] = {
              index: result.resources.length - 1
            };
          });
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
    const result = {};
    attrs.forEach((prop) => (result[prop] = this.resource[prop]));
    return result;
  }

  bind() {
    const resource = this._resource;
    Object.keys(this.configProps).forEach((attr) => {
      const value = this.configProps[attr];
      if (isAsset(value)) {
        const textureResource = this.resourceManager.get(value.id);
        if (textureResource && textureResource instanceof TextureResource) {
          resource[attr] = textureResource.resource;
          this._attachedResources.push(textureResource);
        } else {
          resource[attr] = null;
          Logger.warn(
            `PBRSpecularMaterialResource: ${this.meta.name} can't find asset "${attr}", which id is: ${value.id}`
          );
        }
      } else {
        resource[attr] = value;
      }
    });
  }
}
