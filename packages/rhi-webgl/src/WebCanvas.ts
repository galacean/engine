import { Canvas } from "@alipay/o3-core";
/**
 * Web端使用的画布,可以支持HTMLCanvasElement和OffscreenCanvas。
 */
export class WebCanvas implements Canvas {
  _webCanvas: HTMLCanvasElement | OffscreenCanvas;

  private _width: number;
  private _height: number;

  /**
   * @inheritdoc
   */
  get width(): number {
    return this._width;
  }

  set width(value: number) {
    if (this._width !== value) {
      this._webCanvas.width = value;
      this._width = value;
    }
  }

  /**
   * @inheritdoc
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._webCanvas.height = value;
      this._height = value;
    }
  }

  /**
   * 根据 canvas 的 clientWidth 和 clientHeight 重置画布渲染尺寸。
   * @param pixelRatio 像素比例，若不传初次设置为设备像素比。
   */
  resetToClientSize(pixelRatio: number = window.devicePixelRatio): void {
    const webCanvas = this._webCanvas;
    if (webCanvas instanceof HTMLCanvasElement) {
      webCanvas.width = webCanvas.clientWidth * pixelRatio;
      webCanvas.height = webCanvas.clientHeight * pixelRatio;
    }
  }

  /**
   * 创建Web画布。
   * @param webCanvas 画布。
   * @param pixelRatio 像素比，不传默认为浏览器默认值
   */
  constructor(webCanvas: HTMLCanvasElement | OffscreenCanvas, pixelRatio: number = window.devicePixelRatio) {
    this._width = webCanvas.width * pixelRatio;
    this._height = webCanvas.height * pixelRatio;
    this._webCanvas = webCanvas;
  }
}
