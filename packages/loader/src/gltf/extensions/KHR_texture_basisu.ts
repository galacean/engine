import { AssetPromise, AssetType, Logger, Texture2D, Utils } from "@galacean/engine-core";
import { BufferTextureRestoreInfo } from "../../GLTFContentRestorer";
import { KTX2Loader } from "../../ktx2/KTX2Loader";
import type { ITexture } from "../GLTFSchema";
import { GLTFUtils } from "../GLTFUtils";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";

interface KHRBasisSchema {
  source: number;
}

@registerGLTFExtension("KHR_texture_basisu", GLTFExtensionMode.CreateAndParse)
class KHR_texture_basisu extends GLTFExtensionParser {
  override createAndParse(
    context: GLTFParserContext,
    schema: KHRBasisSchema,
    textureInfo: ITexture
  ): AssetPromise<Texture2D> {
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
        .onProgress(undefined, context._onTaskDetail)
        .then<Texture2D>((texture) => {
          if (!texture.name) {
            texture.name = textureName || imageName || `texture_${index}`;
          }
          if (sampler !== undefined) {
            GLTFUtils.parseSampler(texture, samplerInfo);
          }
          return texture;
        });

      context._addTaskCompletePromise(promise);
      return promise;
    } else {
      const bufferView = glTF.bufferViews[bufferViewIndex];

      return new AssetPromise<Texture2D>((resolve, reject) => {
        context
          .get<ArrayBuffer>(GLTFParserType.Buffer, bufferView.buffer)
          .then((buffer) => {
            const imageBuffer = new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength);
            KTX2Loader._parseBuffer(imageBuffer, engine)
              .then(({ engine, result, targetFormat, params }) => {
                const texture = <Texture2D>KTX2Loader._createTextureByBuffer(engine, result, targetFormat, params);
                texture.name = textureName || imageName || `texture_${bufferViewIndex}`;
                if (sampler !== undefined) {
                  GLTFUtils.parseSampler(texture, samplerInfo);
                }
                const bufferTextureRestoreInfo = new BufferTextureRestoreInfo(texture, bufferView, mimeType);
                context.contentRestorer.bufferTextures.push(bufferTextureRestoreInfo);
                resolve(texture);
              })
              .catch(reject);
          })
          .catch((e) => {
            Logger.error("KHR_texture_basisu: buffer error", e);
          });
      });
    }
  }
}
