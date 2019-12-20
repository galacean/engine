import { SchemaResource } from "./SchemaResource";
import { ResourceManager } from "../ResourceManager";
import * as o3 from "@alipay/o3";

const imageOrderMap = {
  px: 0,
  nx: 1,
  py: 2,
  ny: 3,
  pz: 4,
  nz: 5
};

export class TextureCubeMapResource extends SchemaResource {
  load(): Promise<TextureCubeMapResource> {
    const assetConfig = this.assetConfig;
    return new Promise((resolve, reject) => {
      this._resource = new o3.TextureCubeMap(assetConfig.name, [], assetConfig.props);
      resolve(this);
    });
  }

  bind(resourceManager: ResourceManager) {
    const cubeMap = this._resource;
    const textureAssets = this.assetConfig.props.textures;
    const images = [];
    Object.keys(textureAssets).forEach(key => {
      images[imageOrderMap[key]] = resourceManager.get(textureAssets[key].id).resource.image;
    });
    cubeMap.images = [images];
  }
}
