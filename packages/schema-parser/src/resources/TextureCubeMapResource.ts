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

  bind() {
    const cubeMap = this._resource;
    const imageAssets = this.imageAssets;
    const images = [];
    Object.keys(imageAssets).forEach(key => {
      if (imageAssets[key]) {
        images[imageOrderMap[key]] = this.resourceManager.get(imageAssets[key].id).resource.image;
      }
    });
    cubeMap.images = [images];
  }

  update(key: string, value: any) {
    this.imageAssets[key] = value;
    this.bind();
  }
}
