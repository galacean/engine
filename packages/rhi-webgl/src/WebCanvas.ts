import { Canvas } from "@galacean/engine-core";
import { Vector2 } from "@galacean/engine-math";

type OffscreenCanvas = any;

/**
 * The canvas used on the web, which can support HTMLCanvasElement and OffscreenCanvas.
 */
export class WebCanvas extends Canvas {
  _webCanvas: HTMLCanvasElement | OffscreenCanvas;

  private _scale: Vector2 = new Vector2();

  /**
   * The scale of canvas, the value is visible width/height divide the render width/height.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get scale(): Vector2 {
    const webCanvas = this._webCanvas;
    if (typeof OffscreenCanvas === "undefined" || !(webCanvas instanceof OffscreenCanvas)) {
      this._scale.set(
        (webCanvas.clientWidth * devicePixelRatio) / webCanvas.width,
        (webCanvas.clientHeight * devicePixelRatio) / webCanvas.height
      );
    }
    return this._scale;
  }

  set scale(value: Vector2) {
    const webCanvas = this._webCanvas;
    if (typeof OffscreenCanvas === "undefined" || !(webCanvas instanceof OffscreenCanvas)) {
      webCanvas.style.transformOrigin = `left top`;
      webCanvas.style.transform = `scale(${value.x}, ${value.y})`;
    }
  }

  /**
   * Resize the rendering size according to the clientWidth and clientHeight of the canvas.
   * @param pixelRatio - Pixel ratio
   */
  resizeByClientSize(pixelRatio: number = window.devicePixelRatio): void {
    const webCanvas = this._webCanvas;
    if (typeof OffscreenCanvas === "undefined" || !(webCanvas instanceof OffscreenCanvas)) {
      this.width = webCanvas.clientWidth * pixelRatio;
      this.height = webCanvas.clientHeight * pixelRatio;
    }
  }

  /**
   * Create a web canvas.
   * @param webCanvas - Web native canvas
   */
  constructor(webCanvas: HTMLCanvasElement | OffscreenCanvas) {
    super();
    const width = webCanvas.width;
    const height = webCanvas.height;
    this._webCanvas = webCanvas;
    this.width = width;
    this.height = height;
  }

  /**
   * Set scale.
   * @param x - Scale along the X axis
   * @param y - Scale along the Y axis
   */
  setScale(x: number, y: number): void {
    this._scale.set(x, y);
    this.scale = this._scale;
  }

  protected override _onWidthChanged(value: number): void {
    this._webCanvas.width = value;
  }

  protected override _onHeightChange(value: number): void {
    this._webCanvas.height = value;
  }
}
