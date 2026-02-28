import { AssetPromise, SystemInfo, Texture2D } from "@galacean/engine-core";
import type { ITexture } from "../GLTFSchema";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFTextureParser } from "../parser/GLTFTextureParser";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";

interface EXTWebPSchema {
  source: number;
}

@registerGLTFExtension("EXT_texture_webp", GLTFExtensionMode.CreateAndParse)
class EXT_texture_webp extends GLTFExtensionParser {
  override createAndParse(
    context: GLTFParserContext,
    schema: EXTWebPSchema,
    textureInfo: ITexture,
    textureIndex: number,
    isSRGBColorSpace: boolean
  ): AssetPromise<Texture2D> {
    const webPIndex = schema.source;
    const { sampler, source: fallbackIndex = 0, name: textureName } = textureInfo;
    return SystemInfo._checkWebpSupported().then((supportWebP) => {
      return GLTFTextureParser._parseTexture(
        context,
        supportWebP ? webPIndex : fallbackIndex,
        textureIndex,
        sampler,
        textureName,
        isSRGBColorSpace
      );
    });
  }
}
