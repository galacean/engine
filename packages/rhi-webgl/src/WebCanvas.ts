import { Canvas } from "@alipay/o3-core";
export class WebCanvas implements Canvas {
  _htmlCanvas: HTMLCanvasElement | OffscreenCanvas;

  private _width: number;
  private _height: number;

  /**
   * @inheritdoc
   */
  get width(): number {
    return this._width;
  }

  /**
   * @inheritdoc
   */
  get height(): number {
    return this._height;
  }

  /**
   * 创建Web画布。
   * @param htmlCanvas 画布。
   */
  constructor(htmlCanvas: HTMLCanvasElement | OffscreenCanvas) {
    if (htmlCanvas instanceof HTMLCanvasElement) {
      htmlCanvas.width = htmlCanvas.clientWidth;
      htmlCanvas.height = htmlCanvas.clientHeight;
    }
    this._width = htmlCanvas.width;
    this._height = htmlCanvas.height;
    this._htmlCanvas = htmlCanvas;
  }

  /**
   * @inheritdoc
   */
  setResolution(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._htmlCanvas.width = width;
    this._htmlCanvas.height = height;
  }
}
