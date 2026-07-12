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

  /** @inheritdoc */
  override setAutoResolution(scale: number = 1): void {
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error(`WebCanvas.setAutoResolution: invalid scale ${scale}`);
    }

    // OffscreenCanvas has no display size to follow
    if (this._isOffscreenCanvas()) return;

    this._autoResolutionScale = scale;

    if (this._resizeObserver) {
      // Already observing: reapply the new scale to the last measured size
      this._pendingResize = true;
    } else if (typeof ResizeObserver !== "undefined") {
      // observe() fires an initial entry, which sets the pending size (with exact device pixels when supported)
      this._resizeObserver = new ResizeObserver((entries) => {
        const box = entries[entries.length - 1].devicePixelContentBoxSize?.[0];
        this._pendingDevicePixelWidth = box ? box.inlineSize : 0;
        this._pendingDevicePixelHeight = box ? box.blockSize : 0;
        this._pendingResize = true;
      });
      try {
        this._resizeObserver.observe(this._webCanvas, { box: "device-pixel-content-box" });
      } catch {
        this._resizeObserver.observe(this._webCanvas);
      }
    } else {
      // Fallback: ResizeObserver is not available (e.g. mini-programs, iOS Safari < 13.4).
      // Use a one-time clientWidth × devicePixelRatio × scale sizing instead.
      console.warn(
        "ResizeObserver is not supported in this environment. Falling back to one-time clientWidth × devicePixelRatio × scale sizing"
      );
      const webCanvas = this._webCanvas;
      if (webCanvas.clientWidth > 0 && webCanvas.clientHeight > 0) {
        const pixelRatio = window.devicePixelRatio * scale;
        this._setSize(Math.round(webCanvas.clientWidth * pixelRatio), Math.round(webCanvas.clientHeight * pixelRatio));
      }
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

  /** @internal */
  _isOffscreenCanvas(): boolean {
    return typeof OffscreenCanvas !== "undefined" && this._webCanvas instanceof OffscreenCanvas;
  }

  /** @internal */
  _pumpPendingResize(): void {
    if (!this._pendingResize) return;

    const webCanvas = this._webCanvas;
    if (webCanvas.clientWidth === 0 || webCanvas.clientHeight === 0) return;

    this._pendingResize = false;
    const scale = this._autoResolutionScale;
    // Record display size before applying buffer size to detect layout feedback loop.
    // When the canvas has no CSS width/height, setting the width attribute changes
    // its intrinsic layout size, which causes the buffer size to inflate endlessly.
    const prevClientWidth = webCanvas.clientWidth;
    const prevClientHeight = webCanvas.clientHeight;

    if (this._pendingDevicePixelWidth > 0 && this._pendingDevicePixelHeight > 0) {
      // Exact device pixels already include the device pixel ratio, so only apply the scale
      this._setSize(
        Math.round(this._pendingDevicePixelWidth * scale),
        Math.round(this._pendingDevicePixelHeight * scale)
      );
    } else {
      // Fallback where `devicePixelContentBoxSize` is unavailable (Safari): clientWidth is CSS pixels
      const pixelRatio = window.devicePixelRatio * scale;
      this._setSize(Math.round(webCanvas.clientWidth * pixelRatio), Math.round(webCanvas.clientHeight * pixelRatio));
    }

    // Detect layout feedback loop: if setting the buffer size changed the display size,
    // the canvas has no CSS constraints and layout is following the buffer attributes.
    // Exit auto-resize and keep the current size to prevent unbounded growth.
    if (webCanvas.clientWidth !== prevClientWidth || webCanvas.clientHeight !== prevClientHeight) {
      console.warn(
        "Canvas layout feedback loop detected: the canvas element has no CSS width/height set, " +
          "so changing the buffer size affects the display size. " +
          "Please set CSS width/height on the canvas element to constrain its display size. " +
          "Auto-resolution has been disabled; call setResolution() or setAutoResolution() after applying CSS dimensions."
      );
      this._exitAutoResize();
    }
  }

  /** @internal */
  _destroy(): void {
    this._exitAutoResize();
  }

  protected override _exitAutoResize(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }
    this._pendingResize = false;
    this._pendingDevicePixelWidth = 0;
    this._pendingDevicePixelHeight = 0;
  }

  protected override _onSizeChanged(width: number, height: number): void {
    const webCanvas = this._webCanvas;
    webCanvas.width = width;
    webCanvas.height = height;
  }
}
