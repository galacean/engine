import { AssetPromise, AssetType, Texture2D, TextureFilterMode, TextureWrapMode } from "@oasis-engine/core";
import { BufferTextureRestoreInfo } from "../../GLTFLoader";
import { GLTFUtil } from "../GLTFUtil";
import { ISampler, TextureMagFilter, TextureMinFilter, TextureWrapMode as GLTFTextureWrapMode } from "../Schema";
import { Parser } from "./Parser";
import { ParserContext } from "./ParserContext";

export class TextureParser extends Parser {
  private static _wrapMap = {
    [GLTFTextureWrapMode.CLAMP_TO_EDGE]: TextureWrapMode.Clamp,
    [GLTFTextureWrapMode.MIRRORED_REPEAT]: TextureWrapMode.Mirror,
    [GLTFTextureWrapMode.REPEAT]: TextureWrapMode.Repeat
  };

  parse(context: ParserContext): AssetPromise<Texture2D[]> {
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
                url: GLTFUtil.parseRelativeUrl(url, uri),
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

            return GLTFUtil.loadImageBuffer(imageBuffer, mimeType).then((image) => {
              const texture = new Texture2D(engine, image.width, image.height);
              texture.setImageSource(image);
              texture.generateMipmaps();
              texture.name = textureName || imageName || `texture_${index}`;
              if (sampler !== undefined) {
                this._parseSampler(texture, glTF.samplers[sampler]);
              }
              const bufferTextureRestoreInfo = new BufferTextureRestoreInfo();
              context.contentRestorer.bufferTextures.push(bufferTextureRestoreInfo);
              bufferTextureRestoreInfo.texture = texture;
              bufferTextureRestoreInfo.mimeType = mimeType;
              bufferTextureRestoreInfo.bufferView = bufferView;

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
      texture.wrapModeU = TextureParser._wrapMap[wrapS];
    }

    if (wrapT) {
      texture.wrapModeV = TextureParser._wrapMap[wrapT];
    }
  }
}
