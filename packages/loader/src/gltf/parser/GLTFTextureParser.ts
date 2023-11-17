import { AssetType, Texture, Texture2D, TextureWrapMode, Utils } from "@galacean/engine-core";
import { BufferTextureRestoreInfo } from "../../GLTFContentRestorer";
import { TextureWrapMode as GLTFTextureWrapMode, ITexture } from "../GLTFSchema";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Texture)
export class GLTFTextureParser extends GLTFParser {
  /** @internal */
  static _wrapMap = {
    [GLTFTextureWrapMode.CLAMP_TO_EDGE]: TextureWrapMode.Clamp,
    [GLTFTextureWrapMode.MIRRORED_REPEAT]: TextureWrapMode.Mirror,
    [GLTFTextureWrapMode.REPEAT]: TextureWrapMode.Repeat
  };

  parse(context: GLTFParserContext, index: number): Promise<Texture> {
    const textureInfo = context.glTF.textures[index];
    const { glTFResource, glTF } = context;
    const { engine, url } = glTFResource;
    const { sampler, source = 0, name: textureName, extensions } = textureInfo;
    const { uri, bufferView: bufferViewIndex, mimeType, name: imageName } = glTF.images[source];

    let texture = <Texture | Promise<Texture>>(
      GLTFParser.executeExtensionsCreateAndParse(extensions, context, textureInfo)
    );

    if (!texture) {
      const useSampler = sampler !== undefined;
      const samplerInfo = sampler !== undefined && GLTFUtils.getSamplerInfo(glTF.samplers[sampler]);
      if (uri) {
        // TODO: deleted in 2.0
        const extIndex = uri.lastIndexOf(".");
        const ext = uri.substring(extIndex + 1);
        const type = ext.startsWith("ktx") ? AssetType.KTX : AssetType.Texture2D;
        texture = engine.resourceManager
          .load<Texture2D>({
            url: Utils.resolveAbsoluteUrl(url, uri),
            type,
            params: {
              mipmap: samplerInfo?.mipmap
            }
          })
          .onProgress((e) => {
            context._dispatchProgressEvent(e);
          })
          .then<Texture2D>((texture) => {
            texture.name = textureName || imageName || texture.name || `texture_${index}`;
            useSampler && GLTFUtils.parseSampler(texture, samplerInfo);
            return texture;
          });

        context._dispatchProgressEvent(undefined, texture);
      } else {
        const bufferView = glTF.bufferViews[bufferViewIndex];

        texture = context.get<ArrayBuffer>(GLTFParserType.Buffer).then((buffers) => {
          const buffer = buffers[bufferView.buffer];
          const imageBuffer = new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength);

          return GLTFUtils.loadImageBuffer(imageBuffer, mimeType).then((image) => {
            const texture = new Texture2D(engine, image.width, image.height, undefined, samplerInfo?.mipmap);
            texture.setImageSource(image);
            texture.generateMipmaps();

            texture.name = textureName || imageName || `texture_${index}`;
            useSampler && GLTFUtils.parseSampler(texture, samplerInfo);

            const bufferTextureRestoreInfo = new BufferTextureRestoreInfo(texture, bufferView, mimeType);
            context.contentRestorer.bufferTextures.push(bufferTextureRestoreInfo);

            return texture;
          });
        });
      }
    }

    return Promise.resolve(texture).then((texture) => {
      GLTFParser.executeExtensionsAdditiveAndParse(extensions, context, texture, textureInfo);
      // @ts-ignore
      texture._associationSuperResource(glTFResource);
      return texture;
    });
  }
}
