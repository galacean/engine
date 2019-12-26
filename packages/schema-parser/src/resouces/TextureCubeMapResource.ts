import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3";
import { AssetConfig } from "../types";

const imageOrderMap = {
  px: 0,
  nx: 1,
  py: 2,
  ny: 3,
  pz: 4,
  nz: 5
};

export class TextureCubeMapResource extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader, assetConfig: AssetConfig): Promise<TextureCubeMapResource> {
    return new Promise((resolve, reject) => {
      this._resource = new o3.TextureCubeMap(assetConfig.name, [], assetConfig.props);
      this._resource.imageAssets = assetConfig.props.textures;
      this.setMeta();
      resolve(this);
    });
  }

  bind() {
    const cubeMap = this._resource;
    const imageAssets = cubeMap.imageAssets;
    const images = [];
    Object.keys(imageAssets).forEach(key => {
      images[imageOrderMap[key]] = this.resourceManager.get(imageAssets[key].id).resource.image;
    });
    cubeMap.images = [images];
  }
}
