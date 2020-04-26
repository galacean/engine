import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { ResourceLoader, Logger } from "@alipay/o3";
import { TextureResource } from "./TextureResource";
import { Oasis } from "../Oasis";
import { AssetConfig, LoadAttachedResourceResult } from "../types";

const imageOrderMap = {
  px: 0,
  nx: 1,
  py: 2,
  ny: 3,
  pz: 4,
  nz: 5
};

export class TextureCubeMapResource extends SchemaResource {
  private imageAssets = {};
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<TextureCubeMapResource> {
    return new Promise((resolve, reject) => {
      this._resource = new o3.TextureCubeMap(assetConfig.name, null, assetConfig.props);
      for (const key in imageOrderMap) {
        if (imageOrderMap.hasOwnProperty(key)) {
          this.imageAssets[key] = assetConfig.props[key];
        }
      }
      this.imageAssets = assetConfig.props;
      this.setMeta();
      resolve(this);
    });
  }

  loadWithAttachedResources(
    resourceLoader: ResourceLoader,
    assetConfig: AssetConfig,
    oasis: Oasis
  ): Promise<LoadAttachedResourceResult> {
    return new Promise(resolve => {
      const result: LoadAttachedResourceResult = {
        resources: [this],
        structure: {
          index: 0,
          props: {}
        }
      };
      const textureResources = [];
      const configs = [];
      for (const key in assetConfig.props) {
        if (assetConfig.props.hasOwnProperty(key)) {
          const element = assetConfig.props[key];
          configs[imageOrderMap[key]] = element;
          const textureResource = new TextureResource(this.resourceManager);
          result.resources.push(textureResource);
          result.structure.props[key] = {
            index: result.resources.length - 1
          };
          textureResources[imageOrderMap[key]] = textureResource;
          this._attachedResources.push(textureResource);
        }
      }
      const promises = textureResources.map((textureResource, index) => {
        return textureResource.load(resourceLoader, configs[index], oasis);
      });

      Promise.all(promises).then(textureResources => {
        const images = textureResources.map(textureResource => textureResource.resource.image);
        this._resource = new o3.TextureCubeMap(assetConfig.name, [images], assetConfig.props);
        this.setMeta();
        resolve(result);
      });
    });
  }

  setMeta() {
    if (this.resource) {
      this.meta.name = this.resource.name;
    }
  }

  bind() {
    const cubeMap = this._resource;
    const imageAssets = this.imageAssets;
    const images = [];
    Object.keys(imageAssets).forEach(key => {
      if (imageAssets[key]) {
        const textureResource = this.resourceManager.get(imageAssets[key].id);
        if (textureResource && textureResource instanceof TextureResource) {
          images[imageOrderMap[key]] = textureResource.resource.image;
          this._attachedResources.push(textureResource);
        } else {
          Logger.warn(
            `TextureCubeMapResource: ${this.meta.name} can't find asset "${key}", which id is: ${imageAssets[key].id}`
          );
        }
      }
    });
    cubeMap.images = [images];
  }

  update(key: string, value: any) {
    const resource = this.resourceManager.get(value.id);
    if (resource && resource instanceof TextureResource) {
      this.resource.updateImage(imageOrderMap[key], resource.resource.image);
      this.resource.updateTexture();
    }
  }
}
