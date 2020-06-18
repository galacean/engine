import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { RegistExtension } from "@alipay/o3-loader-gltf";
import { TransparentMaterial, TextureMaterial } from "@alipay/o3-mobile-material";
import { PBRMaterial } from "@alipay/o3-pbr";

RegistExtension({
  TextureMaterial,
  TransparentMaterial,
  PBRMaterial
});

class AssetsLoader {
  constructor() {
    this.assets = [];
    this.resourceLoader = new ResourceLoader();
  }

  /**
   * @description: 添加资源
   * @name {String} 资源名称
   * @props {Object} 资源配置项(一般指定type:gltf,url即可)
   * @return:
   */
  addAsset(name, props) {
    const asset = new Resource(name, props);
    console.log(asset);
    this.assets.push(asset);
  }

  load() {
    const loader = this.resourceLoader;
    return new Promise((res, rej) => {
      if (this.assets.length > 1) {
        loader.batchLoad(this.assets, (err, result) => {
          if (err) {
            rej(err);
          } else {
            res(result);
          }
        });
      } else {
        loader.load(this.assets[0], (err, result) => {
          if (err) {
            rej(err);
          } else {
            res(result);
          }
        });
      }
    });
  }
}

export default AssetsLoader;
