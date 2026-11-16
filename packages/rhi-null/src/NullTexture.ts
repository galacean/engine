import type {
  IPlatformTexture,
  IPlatformTexture2D,
  IPlatformTexture2DArray,
  IPlatformTextureCube,
  TextureFilterMode,
  TextureWrapMode,
  TextureDepthCompareFunction
} from "@galacean/engine-core";

/** Texture metadata without rasterized pixels. */
class NullTexture implements IPlatformTexture {
  wrapModeU: TextureWrapMode;
  wrapModeV: TextureWrapMode;
  filterMode: TextureFilterMode;
  anisoLevel: number;
  depthCompareFunction: TextureDepthCompareFunction;

  destroy(): void {}
  generateMipmaps(): void {}
  setUseDepthCompareMode(): void {}
  getPixelBuffer(): never {
    throw new Error("Pixel readback requires a graphics device.");
  }
}

export class NullTexture2D extends NullTexture implements IPlatformTexture2D {
  setPixelBuffer(): void {}
  setImageSource(): void {}
}

export class NullTexture2DArray extends NullTexture implements IPlatformTexture2DArray {
  setPixelBuffer(): void {}
  setImageSource(): void {}
}

export class NullTextureCube extends NullTexture implements IPlatformTextureCube {
  setPixelBuffer(): void {}
  setImageSource(): void {}
}
