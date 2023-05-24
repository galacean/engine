import { AssetPromise, AssetType, Texture2D, TextureFilterMode, TextureWrapMode, Utils } from "@galacean/engine-core";
import { BufferTextureRestoreInfo } from "../../GLTFContentRestorer";
import { GLTFUtils } from "../GLTFUtils";
import { ISampler, TextureMagFilter, TextureMinFilter, TextureWrapMode as GLTFTextureWrapMode } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext } from ".";

export class GLTFTextureParser extends GLTFParser {
  private static _wrapMap = {
    [GLTFTextureWrapMode.CLAMP_TO_EDGE]: TextureWrapMode.Clamp,
    [GLTFTextureWrapMode.MIRRORED_REPEAT]: TextureWrapMode.Mirror,
    [GLTFTextureWrapMode.REPEAT]: TextureWrapMode.Repeat
  };

  parse(context: GLTFParserContext): AssetPromise<Texture2D[]> {
    const { glTFResource, glTF, buffers } = context;
    const { engine, url } = glTFResource;

    if (glTF.textures) {
      const texturesPromiseInfo = context.texturesPromiseInfo;
      AssetPromise.all(
        glTF.textures.map(({ sampler, source = 0, name: textureName }, index) => {
          const { uri, bufferView: bufferViewIndex, mimeType, name: imageName } = glTF.images[source];
          if (uri) {
            // TODO: support ktx extension https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md
            const index = uri.lastIndexOf(".");
            const ext = uri.substring(index + 1);
            const type = ext.startsWith("ktx") ? AssetType.KTX : AssetType.Texture2D;
            return engine.resourceManager
              .load<Texture2D>({
                url: Utils.resolveAbsoluteUrl(url, uri),
                type: type
              })
              .then((texture) => {
                if (!texture.name) {
                  texture.name = textureName || imageName || `texture_${index}`;
                }
                if (sampler !== undefined) {
                  this._parseSampler(texture, glTF.samplers[sampler]);
                }
                return texture;
              });
          } else {
            const bufferView = glTF.bufferViews[bufferViewIndex];
            const buffer = buffers[bufferView.buffer];
            const imageBuffer = new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength);

            return GLTFUtils.loadImageBuffer(imageBuffer, mimeType).then((image) => {
              const texture = new Texture2D(engine, image.width, image.height);
              texture.setImageSource(image);
              texture.generateMipmaps();
              texture.name = textureName || imageName || `texture_${index}`;
              if (sampler !== undefined) {
                this._parseSampler(texture, glTF.samplers[sampler]);
              }
              const bufferTextureRestoreInfo = new BufferTextureRestoreInfo(texture, bufferView, mimeType);
              context.contentRestorer.bufferTextures.push(bufferTextureRestoreInfo);

              return texture;
            });
          }
        })
      )
        .then((textures: Texture2D[]) => {
          glTFResource.textures = textures;
          texturesPromiseInfo.resolve(textures);
        })
        .catch(texturesPromiseInfo.reject);
      return texturesPromiseInfo.promise;
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
      texture.wrapModeU = GLTFTextureParser._wrapMap[wrapS];
    }

    if (wrapT) {
      texture.wrapModeV = GLTFTextureParser._wrapMap[wrapT];
    }
  }
}
