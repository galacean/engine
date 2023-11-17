import { AssetType, Texture2D, Utils } from "@galacean/engine-core";
import type { ITexture } from "../GLTFSchema";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { GLTFUtils } from "../GLTFUtils";
import { BufferTextureRestoreInfo } from "../../GLTFContentRestorer";
import { KTX2Loader } from "../../ktx2/KTX2Loader";

interface KHRBasisSchema {
  source: number;
}

@registerGLTFExtension("KHR_texture_basisu", GLTFExtensionMode.CreateAndParse)
class KHR_texture_basisu extends GLTFExtensionParser {
  override async createAndParse(
    context: GLTFParserContext,
    schema: KHRBasisSchema,
    textureInfo: ITexture
  ): Promise<Texture2D> {
    const { glTF, glTFResource } = context;
    const { engine, url } = glTFResource;

    const { sampler, name: textureName } = textureInfo;
    const { source } = schema;
    const { uri, bufferView: bufferViewIndex, mimeType, name: imageName } = glTF.images[source];
    const samplerInfo = sampler !== undefined && GLTFUtils.getSamplerInfo(glTF.samplers[sampler]);
    if (uri) {
      const index = uri.lastIndexOf(".");
      const promise = engine.resourceManager
        .load<Texture2D>({
          url: Utils.resolveAbsoluteUrl(url, uri),
          type: AssetType.KTX2
        })
        .onProgress((e) => {
          context._dispatchProgressEvent(e);
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

      context._dispatchProgressEvent(undefined, promise);
      return promise;
    } else {
      const bufferView = glTF.bufferViews[bufferViewIndex];

      return context.get<ArrayBuffer>(GLTFParserType.Buffer, bufferView.buffer).then((buffer) => {
        const imageBuffer = new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength);

        return KTX2Loader._parseBuffer(imageBuffer, engine)
          .then(({ engine, result, targetFormat, params }) =>
            KTX2Loader._createTextureByBuffer(engine, result, targetFormat, params)
          )
          .then((texture: Texture2D) => {
            texture.name = textureName || imageName || `texture_${bufferViewIndex}`;
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
}
