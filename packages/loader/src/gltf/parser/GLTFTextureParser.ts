import { AssetType, Texture, Texture2D, TextureFilterMode, TextureWrapMode, Utils } from "@galacean/engine-core";
import { BufferTextureRestoreInfo } from "../../GLTFContentRestorer";
import {
  TextureWrapMode as GLTFTextureWrapMode,
  ISampler,
  ITexture,
  TextureMagFilter,
  TextureMinFilter
} from "../GLTFSchema";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Texture)
export class GLTFTextureParser extends GLTFParser {
  private static _wrapMap = {
    [GLTFTextureWrapMode.CLAMP_TO_EDGE]: TextureWrapMode.Clamp,
    [GLTFTextureWrapMode.MIRRORED_REPEAT]: TextureWrapMode.Mirror,
    [GLTFTextureWrapMode.REPEAT]: TextureWrapMode.Repeat
  };

  parse(context: GLTFParserContext, index?: number): Promise<Texture[] | Texture> {
    const {
      glTF: { textures },
      _cache
    } = context;
    if (!textures) return Promise.resolve(null);

    const cacheKey = `${GLTFParserType.Texture}:${index}`;
    let promise: Promise<Texture[] | Texture> = _cache.get(cacheKey);

    if (!promise) {
      if (index === undefined) {
        promise = Promise.all(textures.map((textureInfo) => this._parseSingleTexture(context, textureInfo)));
      } else {
        promise = this._parseSingleTexture(context, textures[index]);
      }

      _cache.set(cacheKey, promise);
    }

    return promise;
  }

  private _parseSingleTexture(context: GLTFParserContext, textureInfo: ITexture): Promise<Texture> {
    const { glTFResource, glTF } = context;
    const { engine, url } = glTFResource;
    const { sampler, source = 0, name: textureName, extensions } = textureInfo;
    const { uri, bufferView: bufferViewIndex, mimeType, name: imageName } = glTF.images[source];

    let texture = <Texture | Promise<Texture>>(
      GLTFParser.executeExtensionsCreateAndParse(extensions, context, textureInfo)
    );

    if (!texture) {
      const samplerInfo = sampler !== undefined && this._getSamplerInfo(glTF.samplers[sampler]);
      if (uri) {
        // TODO: support ktx extension https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md
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
              texture.name = textureName || imageName;
            }
            if (sampler !== undefined) {
              this._parseSampler(texture, samplerInfo);
            }
            return texture;
          });
      } else {
        const bufferView = glTF.bufferViews[bufferViewIndex];

        texture = context.get<ArrayBuffer[]>(GLTFParserType.Buffer).then((buffers) => {
          const buffer = buffers[bufferView.buffer];
          const imageBuffer = new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength);

          return GLTFUtils.loadImageBuffer(imageBuffer, mimeType).then((image) => {
            const texture = new Texture2D(engine, image.width, image.height, undefined, samplerInfo?.mipmap);
            texture.setImageSource(image);
            texture.generateMipmaps();
            texture.name = textureName || imageName;
            if (sampler !== undefined) {
              this._parseSampler(texture, samplerInfo);
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
  }

  private _getSamplerInfo(sampler: ISampler): ISamplerInfo {
    const { minFilter, magFilter, wrapS, wrapT } = sampler;
    const info = <ISamplerInfo>{};

    if (minFilter || magFilter) {
      info.mipmap = minFilter >= TextureMinFilter.NEAREST_MIPMAP_NEAREST;

      if (magFilter === TextureMagFilter.NEAREST) {
        info.filterMode = TextureFilterMode.Point;
      } else {
        if (minFilter <= TextureMinFilter.LINEAR_MIPMAP_NEAREST) {
          info.filterMode = TextureFilterMode.Bilinear;
        } else {
          info.filterMode = TextureFilterMode.Trilinear;
        }
      }
    }

    if (wrapS) {
      info.wrapModeU = GLTFTextureParser._wrapMap[wrapS];
    }

    if (wrapT) {
      info.wrapModeV = GLTFTextureParser._wrapMap[wrapT];
    }

    return info;
  }

  private _parseSampler(texture: Texture2D, samplerInfo: ISamplerInfo): void {
    const { filterMode, wrapModeU, wrapModeV } = samplerInfo;

    if (filterMode !== undefined) {
      texture.filterMode = filterMode;
    }

    if (wrapModeU !== undefined) {
      texture.wrapModeU = wrapModeU;
    }

    if (wrapModeV !== undefined) {
      texture.wrapModeV = wrapModeV;
    }
  }
}

interface ISamplerInfo {
  filterMode?: TextureFilterMode;
  wrapModeU?: TextureWrapMode;
  wrapModeV?: TextureWrapMode;
  mipmap?: boolean;
}
