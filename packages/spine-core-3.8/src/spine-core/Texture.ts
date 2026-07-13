import { Engine, Texture2D } from "@galacean/engine";

export abstract class Texture {
  protected _texture: Texture2D;

  constructor(texture: Texture2D) {
    this._texture = texture;
  }

  get width(): number {
    return this._texture.width;
  }

  get height(): number {
    return this._texture.height;
  }

  get texture(): Texture2D {
    return this._texture;
  }

  abstract setFilters(minFilter: TextureFilter, magFilter: TextureFilter): void;
  abstract setWraps(uWrap: TextureWrap, vWrap: TextureWrap): void;
  abstract dispose(): void;

  public static filterFromString(text: string): TextureFilter {
    switch (text.toLowerCase()) {
      case "nearest":
        return TextureFilter.Nearest;
      case "linear":
        return TextureFilter.Linear;
      case "mipmap":
        return TextureFilter.MipMap;
      case "mipmapnearestnearest":
        return TextureFilter.MipMapNearestNearest;
      case "mipmaplinearnearest":
        return TextureFilter.MipMapLinearNearest;
      case "mipmapnearestlinear":
        return TextureFilter.MipMapNearestLinear;
      case "mipmaplinearlinear":
        return TextureFilter.MipMapLinearLinear;
      default:
        throw new Error(`Unknown texture filter ${text}`);
    }
  }

  public static wrapFromString(text: string): TextureWrap {
    switch (text.toLowerCase()) {
      case "mirroredtepeat":
        return TextureWrap.MirroredRepeat;
      case "clamptoedge":
        return TextureWrap.ClampToEdge;
      case "repeat":
        return TextureWrap.Repeat;
      default:
        throw new Error(`Unknown texture wrap ${text}`);
    }
  }
}

export enum TextureFilter {
  Nearest = 9728, // WebGLRenderingContext.NEAREST
  Linear = 9729, // WebGLRenderingContext.LINEAR
  MipMap = 9987, // WebGLRenderingContext.LINEAR_MIPMAP_LINEAR
  MipMapNearestNearest = 9984, // WebGLRenderingContext.NEAREST_MIPMAP_NEAREST
  MipMapLinearNearest = 9985, // WebGLRenderingContext.LINEAR_MIPMAP_NEAREST
  MipMapNearestLinear = 9986, // WebGLRenderingContext.NEAREST_MIPMAP_LINEAR
  MipMapLinearLinear = 9987 // WebGLRenderingContext.LINEAR_MIPMAP_LINEAR
}

export enum TextureWrap {
  MirroredRepeat = 33648, // WebGLRenderingContext.MIRRORED_REPEAT
  ClampToEdge = 33071, // WebGLRenderingContext.CLAMP_TO_EDGE
  Repeat = 10497 // WebGLRenderingContext.REPEAT
}

export class TextureRegion {
  renderObject: any;
  u = 0;
  v = 0;
  u2 = 0;
  v2 = 0;
  width = 0;
  height = 0;
  rotate = false;
  offsetX = 0;
  offsetY = 0;
  originalWidth = 0;
  originalHeight = 0;
}

export class FakeTexture extends Texture {
  setFilters(minFilter: TextureFilter, magFilter: TextureFilter) {}
  setWraps(uWrap: TextureWrap, vWrap: TextureWrap) {}
  dispose() {}
}
