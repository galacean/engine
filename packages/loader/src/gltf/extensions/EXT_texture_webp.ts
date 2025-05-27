import { AssetPromise, SystemInfo, Texture2D } from "@galacean/engine-core";
import type { ITexture } from "../GLTFSchema";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFTextureParser } from "../parser/GLTFTextureParser";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";

interface EXTWebPSchema {
  source: number;
}
function checkWebpSupport(): Promise<boolean> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function () {
        const result = (img.width > 0) && (img.height > 0);
        resolve(result);
        };
        img.onerror = function () {
        resolve(false);
        };
        img.src = 'data:image/webp;base64,UklGRhACAABXRUJQVlA4WAoAAAAwAAAAAAAAAAAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIAgAAAAAAVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v02aAA=';
    })
}

@registerGLTFExtension("EXT_texture_webp", GLTFExtensionMode.CreateAndParse)
class EXT_texture_webp extends GLTFExtensionParser {
  private _supportWebP = false as boolean| Promise<boolean>;

  constructor() {
    super();

    // @ts-ignore
    if (SystemInfo._isBrowser) {
      this._supportWebP = checkWebpSupport()
    } else {
      this._supportWebP = false;
    }
  }

  override async createAndParse(
    context: GLTFParserContext,
    schema: EXTWebPSchema,
    textureInfo: ITexture,
    textureIndex: number,
    isSRGBColorSpace: boolean
  ): AssetPromise<Texture2D> {
    const webPIndex = schema.source;
    const { sampler, source: fallbackIndex = 0, name: textureName } = textureInfo;
    let supportWebP = false;
    if(this._supportWebP) {
      supportWebP = await this._supportWebP;
    }
    const texture = GLTFTextureParser._parseTexture(
      context,
      supportWebP ? webPIndex : fallbackIndex,
      textureIndex,
      sampler,
      textureName,
      isSRGBColorSpace
    );

    return texture;
  }
}
