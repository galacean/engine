import { AssetType, Logger, Texture2D, TextureWrapMode } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { ISampler } from "../Schema";
import { getBufferViewData, loadImageBuffer, parseRelativeUrl } from "../Util";
import { Parser } from "./Parser";

export class TextureParser extends Parser {
  private static _wrapMap = {
    33071: TextureWrapMode.Clamp,
    33648: TextureWrapMode.Mirror,
    10497: TextureWrapMode.Repeat
  };

  parse(context: GLTFResource): void | Promise<void> {
    const { gltf, buffers, engine, url } = context;

    if (gltf.textures) {
      return Promise.all(
        gltf.textures.map(({ sampler, source = 0, name: textureName }, index) => {
          const { uri, bufferView: bufferViewIndex, mimeType, name: imageName } = gltf.images[source];

          if (uri) {
            return engine.resourceManager
              .load<Texture2D>({
                url: parseRelativeUrl(url, uri),
                type: AssetType.Texture2D
              })
              .then((texture) => {
                if (!texture.name) {
                  texture.name = textureName || imageName || `texture_${index}`;
                }
                if (sampler !== undefined) {
                  this._parseSampler(texture, gltf.samplers[sampler]);
                }
                return texture;
              });
          } else {
            const bufferView = gltf.bufferViews[bufferViewIndex];
            const bufferViewData = getBufferViewData(bufferView, buffers);
            return loadImageBuffer(bufferViewData, mimeType).then((image) => {
              const texture = new Texture2D(engine, image.width, image.height);
              texture.setImageSource(image);
              texture.generateMipmaps();
              texture.name = textureName || imageName || `texture_${index}`;
              if (sampler !== undefined) {
                this._parseSampler(texture, gltf.samplers[sampler]);
              }
              return texture;
            });
          }
        })
      ).then((textures: Texture2D[]) => {
        context.textures = textures;
      });
    }
  }

  private _parseSampler(texture: Texture2D, sampler: ISampler): void {
    const { magFilter, minFilter, wrapS, wrapT } = sampler;

    if (magFilter || minFilter) {
      Logger.warn("texture use filterMode in engine");
    }

    if (wrapS) {
      texture.wrapModeU = TextureParser._wrapMap[wrapS];
    }

    if (wrapT) {
      texture.wrapModeV = TextureParser._wrapMap[wrapT];
    }
  }
}
