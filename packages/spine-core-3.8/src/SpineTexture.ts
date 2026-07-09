import { Texture, TextureFilter, TextureWrap } from "./spine-core/Texture";
import { Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine";

/**
 * @internal
 */
export class SpineTexture extends Texture {
  constructor(image: Texture2D) {
    super(image);
    image.generateMipmaps();
  }

  // The vendored 3.8 `Texture` base class exposes the Texture2D via a `texture` getter instead of
  // spine-core 4.2's `getImage()`; this alias keeps SpineGenerator's call sites identical across backends.
  getImage(): Texture2D {
    return this._texture;
  }

  setFilters(minFilter: TextureFilter, magFilter: TextureFilter) {
    if (minFilter === TextureFilter.Nearest) {
      this._texture.filterMode = TextureFilterMode.Point;
    } else if (minFilter === TextureFilter.Linear) {
      this._texture.filterMode = TextureFilterMode.Bilinear;
    } else {
      // The remaining min filters are the MipMap* family (mag filters are never MipMap*);
      // mipmaps are generated in the constructor.
      this._texture.filterMode = TextureFilterMode.Trilinear;
    }
  }

  setWraps(uWrap: TextureWrap, vWrap: TextureWrap) {
    this._texture.wrapModeU = this._convertWrapMode(uWrap);
    this._texture.wrapModeV = this._convertWrapMode(vWrap);
  }

  dispose() {}

  private _convertWrapMode(wrap: TextureWrap): TextureWrapMode {
    switch (wrap) {
      case TextureWrap.ClampToEdge:
        return TextureWrapMode.Clamp;
      case TextureWrap.Repeat:
        return TextureWrapMode.Repeat;
      case TextureWrap.MirroredRepeat:
        return TextureWrapMode.Mirror;
      default:
        throw new Error("Unsupported texture wrap mode.");
    }
  }
}
