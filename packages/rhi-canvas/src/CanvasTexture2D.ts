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
  ): void {}

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
    this._canvasTexture = imageSource;
  }

  /**
   * {@inheritDoc IPlatformTexture2D.getPixelBuffer }
   */
  getPixelBuffer(x: number, y: number, width: number, height: number, mipLevel: number, out: ArrayBufferView): void {}
}
