import { AssetPromise, AssetType, Texture, Texture2D, TextureWrapMode, Utils } from "@galacean/engine-core";
import { BufferTextureRestoreInfo } from "../../GLTFContentRestorer";
import { TextureWrapMode as GLTFTextureWrapMode } from "../GLTFSchema";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext } from "./GLTFParserContext";

export class GLTFTextureParser extends GLTFParser {
  /** @internal */
  static _wrapMap = {
    [GLTFTextureWrapMode.CLAMP_TO_EDGE]: TextureWrapMode.Clamp,
    [GLTFTextureWrapMode.MIRRORED_REPEAT]: TextureWrapMode.Mirror,
    [GLTFTextureWrapMode.REPEAT]: TextureWrapMode.Repeat
  };

  parse(context: GLTFParserContext): AssetPromise<Texture2D[]> | void {
    const { glTFResource, glTF } = context;
    const { engine, url } = glTFResource;

    if (glTF.textures) {
      const texturesPromiseInfo = context.texturesPromiseInfo;

      AssetPromise.all(
        glTF.textures.map((textureInfo, index) => {
          const { sampler, source = 0, name: textureName, extensions } = textureInfo;
          const { uri, bufferView: bufferViewIndex, mimeType, name: imageName } = glTF.images[source];

          let texture = <Texture | Promise<Texture>>(
            GLTFParser.executeExtensionsCreateAndParse(extensions, context, textureInfo)
          );

          if (!texture) {
            const samplerInfo = sampler !== undefined && GLTFUtils.getSamplerInfo(glTF.samplers[sampler]);
            if (uri) {
              // TODO: deleted in 2.0
              const index = uri.lastIndexOf(".");
              const ext = uri.substring(index + 1);
              const type = ext.startsWith("ktx") ? AssetType.KTX : AssetType.Texture2D;
              texture = engine.resourceManager
                .load<Texture2D>({
                  url: Utils.resolveAbsoluteUrl(url, uri),
                  type: type,
                  params: {
                    mipmap: samplerInfo?.mipmap
                  }
                })
                .then<Texture2D>((texture) => {
                  if (!texture.name) {
                    texture.name = textureName || imageName || `texture_${index}`;
                  }
                  if (sampler !== undefined) {
                    GLTFUtils.parseSampler(texture, samplerInfo);
                  }
                  return texture;
                });
            } else {
              const bufferView = glTF.bufferViews[bufferViewIndex];

              texture = context.getBuffers().then((buffers) => {
                const buffer = buffers[bufferView.buffer];
                const imageBuffer = new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength);

                return GLTFUtils.loadImageBuffer(imageBuffer, mimeType).then((image) => {
                  const texture = new Texture2D(engine, image.width, image.height, undefined, samplerInfo?.mipmap);
                  texture.setImageSource(image);
                  texture.generateMipmaps();
                  texture.name = textureName || imageName || `texture_${index}`;
                  if (sampler !== undefined) {
                    GLTFUtils.parseSampler(texture, samplerInfo);
                  }
                  const bufferTextureRestoreInfo = new BufferTextureRestoreInfo(texture, bufferView, mimeType);
                  context.contentRestorer.bufferTextures.push(bufferTextureRestoreInfo);

                  return texture;
                });
              });
            }
          }

          return Promise.resolve(texture).then((texture) => {
            GLTFParser.executeExtensionsAdditiveAndParse(extensions, context, texture, textureInfo);
            return texture;
          });
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
}
