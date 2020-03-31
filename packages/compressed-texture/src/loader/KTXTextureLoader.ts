import { Resource } from "@alipay/o3-loader";

import { KhronosTextureContainer } from "../KhronosTextureContainer";
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
      if (KhronosTextureContainer.IsValid(data)) {
        const texture = new CompressedTexture2D(resource.name, parseSingleKTX(data));
        resource.asset = texture;
      } else {
        throw new Error("KTXTextureLoader: texture missing KTX identifier");
      }
    } else if (resource.data.length === 6) {
      const texture = new CompressedTextureCubeMap(resource.name, parseCubeKTX(resource.data));
      resource.asset = texture;
    } else {
      throw new Error("KTXTextureLoader: ktx texture should have 1 or 6 texture");
    }
  }
}

function parseCubeKTX(dataArray: ArrayBuffer[]): CompressedCubeData {
  for (let i = 0; i < dataArray.length; i++) {
    if (!KhronosTextureContainer.IsValid(dataArray[i])) {
      throw new Error("KTXTextureLoader: texture missing KTX identifier");
    }
  }
  const ktxArray = dataArray.map(data => new KhronosTextureContainer(data, 1));
  const mipmapsFaces = ktxArray.map(ktx => ktx.mipmaps(true));
  return {
    mipmapsFaces,
    internalFormat: ktxArray[0].glInternalFormat,
    width: ktxArray[0].pixelWidth,
    height: ktxArray[0].pixelHeight
  };
}

function parseSingleKTX(data: ArrayBuffer): CompressedTextureData {
  const ktx = new KhronosTextureContainer(data, 1);
  const mipmaps = ktx.mipmaps(true);
  return {
    mipmaps,
    internalFormat: ktx.glInternalFormat,
    width: ktx.pixelWidth,
    height: ktx.pixelHeight
  };
}
