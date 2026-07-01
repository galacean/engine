import { UpdateFlagManager } from "./UpdateFlagManager";

/**
 * Canvas.
 */
export abstract class Canvas {
  /* @internal */
  _sizeUpdateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  private _width: number = 0;
  private _height: number = 0;

  /**
   * The render buffer width of the canvas, in pixels.
   * @remarks Read-only. Use `setResolution` or `setAutoResolution` to change the render resolution.
   */
  get width(): number {
    return this._width;
  }

  /**
   * The render buffer height of the canvas, in pixels.
   * @remarks Read-only. Use `setResolution` or `setAutoResolution` to change the render resolution.
   */
  get height(): number {
    return this._height;
  }

  /**
   * Lock the render buffer to an explicit resolution and stop following the display size.
   * @remarks Resolution is set atomically; width and height always change together in a single frame.
   * @param width - Render buffer width in pixels
   * @param height - Render buffer height in pixels
   */
  setResolution(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error(`Canvas.setResolution: invalid size ${width}x${height}`);
    }

    this._exitAutoResize();
    this._setSize(width, height);
  }

  /**
   * Make the render buffer automatically follow the canvas display size.
   * @param scale - Performance multiplier on the device pixel ratio (1 = clear, 0.7 = save GPU, 2 = supersample), defaults to `1`
   */
  abstract setAutoResolution(scale?: number): void;

  // Sole atomic entry for render-buffer size: width and height change together in one dispatch.
  protected _setSize(width: number, height: number): void {
    if (this._width !== width || this._height !== height) {
      this._width = width;
      this._height = height;
      this._onSizeChanged(width, height);
      this._sizeUpdateFlagManager.dispatch();
    }
  }

  // Applied by the engine each frame, before rendering, so resize lands in the render frame.
  abstract _pumpPendingResize(): void;

  abstract _destroy(): void;

  // Tear down the auto-resize subscription; no-op for platforms without an auto mode.
  protected _exitAutoResize(): void {}

  protected abstract _onSizeChanged(width: number, height: number): void;
}
