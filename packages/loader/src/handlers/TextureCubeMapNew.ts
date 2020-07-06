import { TextureCubeMap } from "@alipay/o3-material";
import { Logger, TextureCubeFace } from "@alipay/o3-base";
import { Request, Prop, HandlerCb } from "../type";
import { Resource } from "../Resource";

/**
 * 处理CubeMap资源的请求和创建
 * @private
 */
export class TextureCubeMapNewHandler {
  /**
   * 请求相关图像资源
   * @param {Request} request 请求资源模块
   * @param {Object} props 资源属性
   * @param {Function} callback 回调函数
   * @private
   */
  load(request: Request, props: Prop, callback: HandlerCb) {
    let urls = props.url;
    if (!Array.isArray(urls[0])) urls = [urls];

    const promises = [];

    const data = [];
    for (let i = 0; i < urls.length; i++) {
      data[i] = [];
      for (let j = 0; j < urls[i].length; j++) {
        const promise = new Promise((resolve, reject) => {
          request.load("image", Object.assign({}, props, { url: urls[i][j] }), function (err, img) {
            if (!err) {
              data[i][j] = img;
              resolve();
            } else {
              callback("Error loading Texture from " + urls[i]);
              reject();
            }
          });
        });
        promises.push(promise);
      }
    }

    Promise.all(promises).then(() => {
      callback(null, data);
    });
  }

  /**
   * 创建所需资源对象（TextureCubeMap）
   * @param {Resource} resource 资源数据
   * @private
   */
  open(resource: Resource, rhi) {
    const { data, name } = resource;
    const { width, height } = data[0][0];

    if (width !== height) {
      Logger.error("The cube texture must have the same width and height");
      return;
    }

    const tex = new TextureCubeMap(rhi, width);
    tex.name = name;

    if (!tex._glTexture) return;

    for (let miplevel = 0; miplevel < data.length; miplevel++) {
      for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
        tex.setImageSource(TextureCubeFace.PositiveX + faceIndex, data[miplevel][faceIndex], miplevel);
      }
    }

    if (data.length === 1) {
      tex.generateMipmaps();
    }

    tex.type = resource.assetType;
    resource.asset = tex;
  }
}
