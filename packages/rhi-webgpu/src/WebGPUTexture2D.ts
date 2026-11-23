import { IPlatformTexture2D, Texture2D } from "@galacean/engine-core";
import { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";
import { WebGPUTexture } from "./WebGPUTexture";

/**
 * WebGPU two-dimensional texture.
 * @internal
 */
export class WebGPUTexture2D extends WebGPUTexture implements IPlatformTexture2D {
  constructor(device: WebGPUGraphicDevice, texture: Texture2D) {
    super(device, texture, "2d", "2d", 1);
  }

  setPixelBuffer(
    colorBuffer: ArrayBufferView,
    mipLevel: number,
    x: number,
    y: number,
    width?: number,
    height?: number
  ): void {
    width ??= Math.max(1, this._texture.width >> mipLevel) - x;
    height ??= Math.max(1, this._texture.height >> mipLevel) - y;

    this._writeTexture(colorBuffer, mipLevel, { x, y, z: 0 }, width, height, 1);
  }

  setImageSource(
    imageSource: TexImageSource,
    mipLevel: number,
    flipY: boolean,
    premultiplyAlpha: boolean,
    x: number,
    y: number
  ): void {
    this._copyExternalImage(imageSource, mipLevel, { x, y, z: 0 }, flipY, premultiplyAlpha);
  }

  getPixelBuffer(x: number, y: number, width: number, height: number, mipLevel: number, out: ArrayBufferView): void {
    this._readCachedPixels(0, x, y, width, height, mipLevel, out);
  }

  getPixelBufferAsync(
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): Promise<void> {
    return this._readPixels(0, x, y, width, height, mipLevel, out);
  }
}
