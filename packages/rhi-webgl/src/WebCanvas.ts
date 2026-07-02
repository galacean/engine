import { Canvas } from "@galacean/engine-core";
import { Vector2 } from "@galacean/engine-math";

type OffscreenCanvas = any;

/**
 * The canvas used on the web, which can support HTMLCanvasElement and OffscreenCanvas.
 */
export class WebCanvas extends Canvas {
  _webCanvas: HTMLCanvasElement | OffscreenCanvas;

  private _scale: Vector2 = new Vector2();

  private _resizeObserver?: ResizeObserver;
  private _autoResolutionScale: number = 1;
  private _pendingResize: boolean = false;

  /**
   * The scale of canvas, the value is visible width/height divide the render width/height.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get scale(): Vector2 {
    const webCanvas = this._webCanvas;
    if (!this.isOffscreenCanvas()) {
      this._scale.set(
        (webCanvas.clientWidth * devicePixelRatio) / webCanvas.width,
        (webCanvas.clientHeight * devicePixelRatio) / webCanvas.height
      );
    }
    return this._scale;
  }

  set scale(value: Vector2) {
    const webCanvas = this._webCanvas;
    if (!this.isOffscreenCanvas()) {
      webCanvas.style.transformOrigin = `left top`;
      webCanvas.style.transform = `scale(${value.x}, ${value.y})`;
    }
  }

  /**
   * Whether the underlying canvas is an OffscreenCanvas.
   * @returns Whether it is an OffscreenCanvas
   */
  isOffscreenCanvas(): boolean {
    return typeof OffscreenCanvas !== "undefined" && this._webCanvas instanceof OffscreenCanvas;
  }

  override setAutoResolution(scale: number = 1): void {
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error(`WebCanvas.setAutoResolution: invalid scale ${scale}`);
    }

    // TODO: OffscreenCanvas has no display size; warn once.
    if (this.isOffscreenCanvas()) return;

    this._autoResolutionScale = scale;

    if (!this._resizeObserver) {
      // Flag only; applied in `_pumpPendingResize`.
      this._resizeObserver = new ResizeObserver(() => (this._pendingResize = true));
      this._resizeObserver.observe(this._webCanvas);
    }

    this._pendingResize = true;
  }

  /**
   * Create a web canvas.
   * @param webCanvas - Web native canvas
   */
  constructor(webCanvas: HTMLCanvasElement | OffscreenCanvas) {
    super();
    this._webCanvas = webCanvas;
    this._setSize(webCanvas.width, webCanvas.height);
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

  override _pumpPendingResize(): void {
    if (!this._pendingResize) return;

    const webCanvas = this._webCanvas;
    // Skip while the canvas has no layout size yet (e.g. not mounted); keep the flag so a later
    // frame's pump retries once layout exists — an unmounted canvas never becomes a 0x0 buffer.
    if (webCanvas.clientWidth === 0 || webCanvas.clientHeight === 0) return;

    this._pendingResize = false;
    const pixelRatio = window.devicePixelRatio * this._autoResolutionScale;
    // Round so the cached size matches the integer buffer; TODO: use `devicePixelContentBoxSize`.
    this._setSize(Math.round(webCanvas.clientWidth * pixelRatio), Math.round(webCanvas.clientHeight * pixelRatio));
  }

  override _destroy(): void {
    this._exitAutoResize();
  }

  protected override _exitAutoResize(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }
    this._pendingResize = false;
  }

  protected override _onSizeChanged(width: number, height: number): void {
    const webCanvas = this._webCanvas;
    webCanvas.width = width;
    webCanvas.height = height;
  }
}
