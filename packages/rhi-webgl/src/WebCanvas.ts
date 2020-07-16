import { Canvas } from "@alipay/o3-core";
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
   * 创建Web画布。
   * @param webCanvas 画布。
   */
  constructor(webCanvas: HTMLCanvasElement | OffscreenCanvas) {
    if (webCanvas instanceof HTMLCanvasElement) {
      webCanvas.width = webCanvas.clientWidth;
      webCanvas.height = webCanvas.clientHeight;
    }
    this._width = webCanvas.width;
    this._height = webCanvas.height;
    this._webCanvas = webCanvas;
  }

  /**
   * @inheritdoc
   */
  setResolution(width: number, height: number): void {
    if (this._width !== width || this._height !== height) {
      this._webCanvas.width = width;
      this._webCanvas.height = height;
      this._width = width;
      this._height = height;
    }
  }
}
