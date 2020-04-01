import { Resource } from "@alipay/o3-loader";

import { khronosTextureContainerParser } from "../KhronosTextureContainer";
import { CompressedTexture2D } from "../CompressedTexture2D";
import { CompressedTextureCubeMap } from "../CompressedTextureCubeMap";
import { CompressedTextureData, CompressedCubeData } from "../type";
/**
 * @private
 */
export class KTXTextureHandler {
  load(request, props, callback) {
    let urls = props.url;
    if (!Array.isArray(urls)) urls = [props.url];
    if (urls.length !== 1 && urls.length !== 6) {
      callback(new Error("KTXTextureLoader: ktx texture should have 1 or 6 url"));
      return;
    }
    const promises = urls.map(url => {
      return new Promise((resolve, reject) => {
        request.load("binary", Object.assign({}, props, { url }), function(err, buffer) {
          if (!err) {
            resolve(buffer);
          } else {
            reject("Error loading KTXTexture from " + url);
          }
        });
      });
    });

    Promise.all(promises)
      .then(res => {
        callback(null, res);
      })
      .catch(err => {
        callback(err);
      });
  }

  open(resource: Resource) {
    if (resource.data.length === 1) {
      const data = resource.data[0];
      const texture = new CompressedTexture2D(resource.name, parseSingleKTX(data));
      resource.asset = texture;
    } else if (resource.data.length === 6) {
      const texture = new CompressedTextureCubeMap(resource.name, parseCubeKTX(resource.data));
      resource.asset = texture;
    } else {
      throw new Error("KTXTextureLoader: ktx texture should have 1 or 6 texture");
    }
  }
}

function parseCubeKTX(dataArray: ArrayBuffer[]): CompressedCubeData {
  const mipmapsFaces = [];
  let internalFormat: number;
  let width: number;
  let height: number;
  for (let i = 0; i < dataArray.length; i++) {
    const ktx = khronosTextureContainerParser.parse(dataArray[i], 1, true);
    mipmapsFaces.push(ktx.mipmaps);
    if (i === 0) {
      width = ktx.pixelWidth;
      height = ktx.pixelHeight;
      internalFormat = ktx.glInternalFormat;
    }
  }
  return {
    mipmapsFaces,
    internalFormat,
    width,
    height
  };
}

function parseSingleKTX(data: ArrayBuffer): CompressedTextureData {
  const ktx = khronosTextureContainerParser.parse(data, 1, true);
  return {
    mipmaps: ktx.mipmaps,
    internalFormat: ktx.glInternalFormat,
    width: ktx.pixelWidth,
    height: ktx.pixelHeight
  };
}
