import { AssetType, Texture, Texture2D, TextureWrapMode, Utils } from "@galacean/engine-core";
import { BufferTextureRestoreInfo } from "../../GLTFContentRestorer";
import { TextureWrapMode as GLTFTextureWrapMode } from "../GLTFSchema";
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

  /** @internal */
  static _parseTexture(
    context: GLTFParserContext,
    imageIndex: number,
    textureIndex: number,
    sampler?: number,
    textureName?: string
  ): Promise<Texture2D> {
    const { glTFResource, glTF } = context;
    const { engine, url } = glTFResource;
    const { uri, bufferView: bufferViewIndex, mimeType, name: imageName } = glTF.images[imageIndex];

    const useSampler = sampler !== undefined;
    const samplerInfo = useSampler && GLTFUtils.getSamplerInfo(glTF.samplers[sampler]);
    let texture: Promise<Texture2D>;

    if (uri) {
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
        .onProgress(undefined, context._onTaskDetail)
        .then<Texture2D>((texture) => {
          texture.name = textureName || imageName || texture.name || `texture_${textureIndex}`;
          useSampler && GLTFUtils.parseSampler(texture, samplerInfo);
          return texture;
        });

      context._addTaskCompletePromise(texture);
    } else {
      const bufferView = glTF.bufferViews[bufferViewIndex];

      texture = context.get<ArrayBuffer>(GLTFParserType.Buffer).then((buffers) => {
        const buffer = buffers[bufferView.buffer];
        const imageBuffer = new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength);

        return GLTFUtils.loadImageBuffer(imageBuffer, mimeType).then((image) => {
          const texture = new Texture2D(engine, image.width, image.height, undefined, samplerInfo?.mipmap);
          texture.setImageSource(image);
          texture.generateMipmaps();

          texture.name = textureName || imageName || `texture_${textureIndex}`;
          useSampler && GLTFUtils.parseSampler(texture, samplerInfo);

          const bufferTextureRestoreInfo = new BufferTextureRestoreInfo(texture, bufferView, mimeType);
          context.contentRestorer.bufferTextures.push(bufferTextureRestoreInfo);

          return texture;
        });
      });
    }

    return texture;
  }

  parse(context: GLTFParserContext, textureIndex: number): Promise<Texture> {
    const textureInfo = context.glTF.textures[textureIndex];
    const glTFResource = context.glTFResource;
    const { sampler, source: imageIndex = 0, name: textureName, extensions } = textureInfo;

    let texture = <Texture | Promise<Texture>>(
      GLTFParser.executeExtensionsCreateAndParse(extensions, context, textureInfo, textureIndex)
    );

    if (!texture) {
      texture = GLTFTextureParser._parseTexture(context, imageIndex, textureIndex, sampler, textureName);
    }

    return Promise.resolve(texture).then((texture) => {
      GLTFParser.executeExtensionsAdditiveAndParse(extensions, context, texture, textureInfo);
      // @ts-ignore
      texture._associationSuperResource(glTFResource);
      return texture;
    });
  }
}
