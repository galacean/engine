import { IPlatformTextureCube, TextureCube, TextureCubeFace } from "@galacean/engine-core";
import { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";
import { WebGPUTexture } from "./WebGPUTexture";

/**
 * WebGPU cube texture.
 * @internal
 */
export class WebGPUTextureCube extends WebGPUTexture implements IPlatformTextureCube {
  constructor(device: WebGPUGraphicDevice, texture: TextureCube) {
    super(device, texture, "2d", "cube", 6);
  }

  setPixelBuffer(
    face: TextureCubeFace,
    colorBuffer: ArrayBufferView,
    mipLevel: number,
    x: number,
    y: number,
    width?: number,
    height?: number
  ): void {
    width ??= Math.max(1, this._texture.width >> mipLevel) - x;
    height ??= Math.max(1, this._texture.height >> mipLevel) - y;
    this._writeTexture(colorBuffer, mipLevel, { x, y, z: face }, width, height, 1);
  }

  setImageSource(
    face: TextureCubeFace,
    imageSource: TexImageSource,
    mipLevel: number,
    flipY: boolean,
    premultiplyAlpha: boolean,
    x: number,
    y: number
  ): void {
    this._copyExternalImage(imageSource, mipLevel, { x, y, z: face }, flipY, premultiplyAlpha);
  }

  getPixelBuffer(
    face: number,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): void {
    this._readCachedPixels(face, x, y, width, height, mipLevel, out);
  }

  getPixelBufferAsync(
    face: number,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): Promise<void> {
    return this._readPixels(face, x, y, width, height, mipLevel, out);
  }
}
