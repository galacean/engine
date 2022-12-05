import { AssetType, Logger, Texture2D, TextureWrapMode, TextureFilterMode } from "@oasis-engine/core";
import { GLTFUtil } from "../GLTFUtil";
import { ISampler, TextureWrapMode as GLTFTextureWrapMode, TextureMagFilter, TextureMinFilter } from "../Schema";
import { Parser } from "./Parser";
import { ParserContext } from "./ParserContext";

export class TextureParser extends Parser {
  private static _wrapMap = {
    [GLTFTextureWrapMode.CLAMP_TO_EDGE]: TextureWrapMode.Clamp,
    [GLTFTextureWrapMode.MIRRORED_REPEAT]: TextureWrapMode.Mirror,
    [GLTFTextureWrapMode.REPEAT]: TextureWrapMode.Repeat
  };

  parse(context: ParserContext) {
    const { textureIndex, glTFResource } = context;
    const { gltf, buffers, engine, url } = glTFResource;

    if (gltf.textures) {
      return Promise.all(
        gltf.textures.map(({ sampler, source = 0, name: textureName }, index) => {
          if (textureIndex >= 0 && textureIndex !== index) {
            return;
          }

          const { uri, bufferView: bufferViewIndex, mimeType, name: imageName } = gltf.images[source];

          if (uri) {
            // TODO: support ktx extension https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md
            const type = uri.endsWith(".ktx") ? AssetType.KTX : AssetType.Texture2D;
            return engine.resourceManager
              .load<Texture2D>({
                url: GLTFUtil.parseRelativeUrl(url, uri),
                type: type
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
            const bufferViewData = GLTFUtil.getBufferViewData(bufferView, buffers);
            return GLTFUtil.loadImageBuffer(bufferViewData, mimeType).then((image) => {
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
        if (textureIndex >= 0) {
          const texture = textures[textureIndex];
          if (texture) {
            return texture;
          } else {
            throw `texture index not find in: ${textureIndex}`;
          }
        }
        glTFResource.textures = textures;
      });
    }
  }

  private _parseSampler(texture: Texture2D, sampler: ISampler): void {
    const { magFilter, minFilter, wrapS, wrapT } = sampler;

    if (magFilter || minFilter) {
      if (magFilter === TextureMagFilter.NEAREST) {
        texture.filterMode = TextureFilterMode.Point;
      } else if (minFilter <= TextureMinFilter.LINEAR_MIPMAP_NEAREST) {
        texture.filterMode = TextureFilterMode.Bilinear;
      } else {
        texture.filterMode = TextureFilterMode.Trilinear;
      }
    }

    if (wrapS) {
      texture.wrapModeU = TextureParser._wrapMap[wrapS];
    }

    if (wrapT) {
      texture.wrapModeV = TextureParser._wrapMap[wrapT];
    }
  }
}
