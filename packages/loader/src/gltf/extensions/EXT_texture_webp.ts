import { Texture2D } from "@galacean/engine-core";
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
    try {
      this._supportWebP = document.createElement("canvas").toDataURL("image/webp").indexOf("data:image/webp") == 0;
    } catch (e) {
      this._supportWebP = false;
    }
  }

  override async createAndParse(
    context: GLTFParserContext,
    schema: EXTWebPSchema,
    textureInfo: ITexture,
    textureIndex: number
  ): Promise<Texture2D> {
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
