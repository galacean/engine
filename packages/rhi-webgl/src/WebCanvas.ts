import { Canvas } from "@alipay/o3-core";
import { Vector2 } from "@alipay/o3-math";
/**
 * Web端使用的画布,可以支持HTMLCanvasElement和OffscreenCanvas。
 */
export class WebCanvas implements Canvas {
  _webCanvas: HTMLCanvasElement | OffscreenCanvas;

  private _width: number;
  private _height: number;
  private _scale: Vector2 = new Vector2();

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
    return this._webCanvas.height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._webCanvas.height = value;
      this._height = value;
    }
  }

  /**
   * 画布的缩放比例,值为显示宽高/渲染分辨率宽高。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  get scale(): Vector2 {
    const webCanvas = this._webCanvas;
    if (webCanvas instanceof HTMLCanvasElement) {
      this._scale.setValue(
        (webCanvas.clientWidth * devicePixelRatio) / webCanvas.width,
        (webCanvas.clientHeight * devicePixelRatio) / webCanvas.height
      );
    }
    return this._scale;
  }

  set scale(value: Vector2) {
    const webCanvas = this._webCanvas;
    if (webCanvas instanceof HTMLCanvasElement) {
      webCanvas.style.transformOrigin = `left top`;
      webCanvas.style.transform = `scale(${value.x}, ${value.y})`;
    }
  }

  /**
   * 根据 canvas 的 clientWidth 和 clientHeight 重置画布渲染尺寸。
   * @param pixelRatio 像素比例，若不传初次设置为设备像素比。
   */
  resizeByClientSize(pixelRatio: number = window.devicePixelRatio): void {
    const webCanvas = this._webCanvas;
    if (webCanvas instanceof HTMLCanvasElement) {
      const width = webCanvas.clientWidth;
      const height = webCanvas.clientHeight;
      webCanvas.width = width * pixelRatio;
      webCanvas.height = height * pixelRatio;
    }
  }

  /**
   * 创建Web画布。
   * @param webCanvas 画布。
   */
  constructor(webCanvas: HTMLCanvasElement | OffscreenCanvas) {
    const width = webCanvas.width;
    const height = webCanvas.height;
    this._webCanvas = webCanvas;
    this._width = width;
    this._height = height;
  }

  /**
   * 设置缩放
   * @param x - 沿 X 轴的缩放。
   * @param y - 沿 Y 轴的缩放。
   */
  setScale(x: number, y: number): void {
    this._scale.setValue(x, y);
    this.scale = this._scale;
  }
}
