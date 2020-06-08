import { TextureFormat, TextureCubeFace } from "@alipay/o3-base";
import { Resource } from "@alipay/o3-loader";
import { khronosTextureContainerParser } from "../KhronosTextureContainer";
import { Texture2D, TextureCubeMap } from "@alipay/o3-material";
import { CompressedTextureDataNew, CompressedCubeDataNew } from "../type";

/**
 * @private
 */
export class KTXTextureNewHandler {
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

  open(resource: Resource, rhi) {
    if (resource.data.length === 1) {
      const parsedData = parseSingleKTX(resource.data[0]);
      const { width, height, mipmaps, engineFormat } = parsedData;
      const texture = new (Texture2D as any)(rhi, width, height, engineFormat);

      if (!texture._glTexture) return;

      for (let miplevel = 0; miplevel < mipmaps.length; miplevel++) {
        const { width, height, data } = mipmaps[miplevel];

        texture.setPixelBuffer(data, miplevel, 0, 0, width, height);
      }

      resource.asset = texture;
    } else if (resource.data.length === 6) {
      const parsedData = parseCubeKTX(resource.data);
      const { width, height, mipmapsFaces, engineFormat } = parsedData;
      const texture = new (TextureCubeMap as any)(rhi, width, engineFormat, true);

      if (!texture._glTexture) return;

      for (let face = 0; face < 6; face++) {
        const length = mipmapsFaces[face].length;

        for (let miplevel = 0; miplevel < length; miplevel++) {
          const { data, width, height } = mipmapsFaces[face][miplevel];

          texture.setPixelBuffer(TextureCubeFace.PositiveX + face, data, miplevel, 0, 0, width, height);
        }
      }

      resource.asset = texture;
    } else {
      throw new Error("KTXTextureLoader: ktx texture should have 1 or 6 texture");
    }
  }
}

function parseCubeKTX(dataArray: ArrayBuffer[]): CompressedCubeDataNew {
  const mipmapsFaces = [];
  let internalFormat: number;
  let engineFormat: TextureFormat;
  let width: number;
  let height: number;
  for (let i = 0; i < dataArray.length; i++) {
    const ktx = khronosTextureContainerParser.parse(dataArray[i], 1, true, true);
    mipmapsFaces.push(ktx.mipmaps);
    if (i === 0) {
      width = ktx.pixelWidth;
      height = ktx.pixelHeight;
      internalFormat = ktx.glInternalFormat;
      engineFormat = ktx.engineFormat;
    }
  }
  return {
    mipmapsFaces,
    engineFormat,
    internalFormat,
    width,
    height
  };
}

function parseSingleKTX(data: ArrayBuffer): CompressedTextureDataNew {
  const ktx = khronosTextureContainerParser.parse(data, 1, true, true);
  return {
    mipmaps: ktx.mipmaps,
    engineFormat: ktx.engineFormat,
    internalFormat: ktx.glInternalFormat,
    width: ktx.pixelWidth,
    height: ktx.pixelHeight
  };
}
