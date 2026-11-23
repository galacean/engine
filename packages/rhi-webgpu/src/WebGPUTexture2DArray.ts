import { IPlatformTexture2DArray, Texture2DArray } from "@galacean/engine-core";
import { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";
import { WebGPUTexture } from "./WebGPUTexture";

/**
 * WebGPU two-dimensional texture array.
 * @internal
 */
export class WebGPUTexture2DArray extends WebGPUTexture implements IPlatformTexture2DArray {
  constructor(device: WebGPUGraphicDevice, texture: Texture2DArray) {
    super(device, texture, "2d", "2d-array", texture.length);
  }

  setPixelBuffer(
    offsetIndex: number,
    colorBuffer: ArrayBufferView,
    mipLevel: number,
    x: number,
    y: number,
    width?: number,
    height?: number,
    length?: number
  ): void {
    width ??= Math.max(1, this._texture.width >> mipLevel) - x;
    height ??= Math.max(1, this._texture.height >> mipLevel) - y;
    length ??= this._layerCount - offsetIndex;
    this._writeTexture(colorBuffer, mipLevel, { x, y, z: offsetIndex }, width, height, length);
  }

  setImageSource(
    index: number,
    imageSource: TexImageSource,
    mipLevel: number,
    flipY: boolean,
    premultiplyAlpha: boolean,
    x: number,
    y: number
  ): void {
    this._copyExternalImage(imageSource, mipLevel, { x, y, z: index }, flipY, premultiplyAlpha);
  }

  getPixelBuffer(
    layer: number,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): void {
    this._readCachedPixels(layer, x, y, width, height, mipLevel, out);
  }

  getPixelBufferAsync(
    layer: number,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): Promise<void> {
    return this._readPixels(layer, x, y, width, height, mipLevel, out);
  }
}
