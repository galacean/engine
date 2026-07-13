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
  private _resolutionDirty: boolean = false;
  private _pendingDevicePixelWidth: number = 0;
  private _pendingDevicePixelHeight: number = 0;

  /**
   * The scale of canvas, the value is visible width/height divide the render width/height.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get scale(): Vector2 {
    const webCanvas = this._webCanvas;
    if (!this._isOffscreenCanvas()) {
      this._scale.set(
        (webCanvas.clientWidth * devicePixelRatio) / webCanvas.width,
        (webCanvas.clientHeight * devicePixelRatio) / webCanvas.height
      );
    }
    return this._scale;
  }

  set scale(value: Vector2) {
    const webCanvas = this._webCanvas;
    if (!this._isOffscreenCanvas()) {
      webCanvas.style.transformOrigin = `left top`;
      webCanvas.style.transform = `scale(${value.x}, ${value.y})`;
    }
  }

  /**
   * @inheritdoc
   *
   * @remarks
   * The canvas must have a CSS-constrained display size; otherwise auto-resolution disables itself.
   */
  override setAutoResolution(scale: number = 1): void {
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error(`WebCanvas.setAutoResolution: invalid scale ${scale}`);
    }

    // OffscreenCanvas has no display size to follow
    if (this._isOffscreenCanvas()) return;

    this._autoResolutionScale = scale;

    if (this._resizeObserver) {
      this._resolutionDirty = true;
    } else if (typeof ResizeObserver !== "undefined") {
      // observe() fires an initial entry, which sets the pending device pixel size
      this._resizeObserver = new ResizeObserver((entries) => {
        const box = entries[entries.length - 1].devicePixelContentBoxSize?.[0];
        this._pendingDevicePixelWidth = box ? box.inlineSize : 0;
        this._pendingDevicePixelHeight = box ? box.blockSize : 0;
        this._resolutionDirty = true;
      });
      // Browsers without device-pixel-content-box ignore the box option and fall back to content-box,
      // in which case devicePixelContentBoxSize is absent and the pump sizes from the client size instead
      this._resizeObserver.observe(this._webCanvas, { box: "device-pixel-content-box" });
    } else {
      // ResizeObserver is unavailable (e.g. mini-programs, iOS Safari < 13.4): size once from the client size
      console.warn(
        "ResizeObserver is not supported in this environment. Falling back to one-time clientWidth × devicePixelRatio × scale sizing"
      );
      this._setSizeByClientSizeFallback(scale);
    }
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

  /**
   * @internal
   */
  _isOffscreenCanvas(): boolean {
    return typeof OffscreenCanvas !== "undefined" && this._webCanvas instanceof OffscreenCanvas;
  }

  /**
   * @internal
   */
  _pumpPendingResolution(): void {
    if (!this._resolutionDirty) return;

    const webCanvas = this._webCanvas;
    if (webCanvas.clientWidth === 0 || webCanvas.clientHeight === 0) return;

    this._resolutionDirty = false;
    const scale = this._autoResolutionScale;
    // Snapshot the display size to detect a layout feedback loop after applying the buffer size below
    const prevClientWidth = webCanvas.clientWidth;
    const prevClientHeight = webCanvas.clientHeight;

    if (this._pendingDevicePixelWidth > 0 && this._pendingDevicePixelHeight > 0) {
      // Device pixels already fold in the device pixel ratio, so only the scale is applied
      this._setSize(
        Math.round(this._pendingDevicePixelWidth * scale),
        Math.round(this._pendingDevicePixelHeight * scale)
      );
    } else {
      this._setSizeByClientSizeFallback(scale);
    }

    // If setting the buffer moved the display size, the canvas has no CSS size constraint and would grow
    // unboundedly; exit auto-resolution instead
    if (webCanvas.clientWidth !== prevClientWidth || webCanvas.clientHeight !== prevClientHeight) {
      console.warn(
        "Auto-resolution disabled: the canvas has no CSS width/height, so sizing the buffer grows its display size. " +
          "Set a CSS width/height on the canvas, then call setResolution() or setAutoResolution()."
      );
      this._exitAutoResolution();
    }
  }

  private _setSizeByClientSizeFallback(scale: number): void {
    const webCanvas = this._webCanvas;
    if (webCanvas.clientWidth <= 0 || webCanvas.clientHeight <= 0) return;
    const pixelRatio = window.devicePixelRatio * scale;
    this._setSize(Math.round(webCanvas.clientWidth * pixelRatio), Math.round(webCanvas.clientHeight * pixelRatio));
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._exitAutoResolution();
  }

  protected override _exitAutoResolution(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }
    this._resolutionDirty = false;
    this._pendingDevicePixelWidth = 0;
    this._pendingDevicePixelHeight = 0;
  }

  protected override _onSizeChanged(width: number, height: number): void {
    const webCanvas = this._webCanvas;
    webCanvas.width = width;
    webCanvas.height = height;
  }
}
