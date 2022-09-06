import { IPlatformTexture2D, Texture2D } from "@oasis-engine/core";
import { CanvasRenderer } from "./CanvasRenderer";
import { CanvasTexture } from "./CanvasTexture";

export class CanvasTexture2D extends CanvasTexture implements IPlatformTexture2D {
  constructor(rhi: CanvasRenderer, texture2D: Texture2D) {
    super(rhi, texture2D);
  }

  /**
   * {@inheritDoc IPlatformTexture2D.setPixelBuffer}
   */
  setPixelBuffer(
    colorBuffer: ArrayBufferView,
    mipLevel: number = 0,
    x: number,
    y: number,
    width?: number,
    height?: number
  ): void {
    const imageData = new ImageData(width, height);
    const { data } = imageData;
    const len = colorBuffer.byteLength;
    for (let i = 0; i < len; ++i) {
      data[i] = colorBuffer[i];
    }
    this._ctx.putImageData(imageData, x, y);
  }

  /**
   * {@inheritDoc IPlatformTexture2D.setImageSource}
   */
  setImageSource(
    imageSource: TexImageSource,
    mipLevel: number,
    flipY: boolean,
    premultiplyAlpha: boolean,
    x: number,
    y: number
  ): void {
    // @ts-ignore
    this._ctx.drawImage(imageSource, x || 0, y || 0);
  }

  /**
   * {@inheritDoc IPlatformTexture2D.getPixelBuffer }
   */
  getPixelBuffer(x: number, y: number, width: number, height: number, mipLevel: number, out: ArrayBufferView): void {}
}
