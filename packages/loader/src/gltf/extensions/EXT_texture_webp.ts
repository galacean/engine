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
  private _supportWebP = false;

  constructor() {
    super();

    // @ts-ignore
    if (SystemInfo._isBrowser) {
      const testCanvas = document.createElement("canvas");
      testCanvas.width = testCanvas.height = 1;
      this._supportWebP = testCanvas.toDataURL("image/webp").indexOf("data:image/webp") == 0;
    } else {
      this._supportWebP = false;
    }
  }

  override createAndParse(
    context: GLTFParserContext,
    schema: EXTWebPSchema,
    textureInfo: ITexture,
    textureIndex: number
  ): AssetPromise<Texture2D> {
    const webPIndex = schema.source;
    const { sampler, source: fallbackIndex = 0, name: textureName } = textureInfo;
    const texture = GLTFTextureParser._parseTexture(
      context,
      this._supportWebP ? webPIndex : fallbackIndex,
      textureIndex,
      sampler,
      textureName
    );

    return texture;
  }
}
