import { UpdateFlagManager } from "./UpdateFlagManager";

/**
 * The canvas the engine renders to; owns the render-buffer resolution.
 */
export abstract class Canvas {
  /* @internal */
  _sizeUpdateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  private _width: number = 0;
  private _height: number = 0;

  /**
   * The render buffer width of the canvas, in pixels.
   */
  get width(): number {
    return this._width;
  }

  /**
   * The render buffer height of the canvas, in pixels.
   */
  get height(): number {
    return this._height;
  }

  /**
   * Lock the render buffer to an explicit resolution and stop following the display size.
   * @param width - Render buffer width in pixels
   * @param height - Render buffer height in pixels
   *
   * @throws
   * Throw an error if width or height is not a positive finite number.
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
   * @param scale - Multiplier applied to the device pixel ratio (1 = native sharpness, 0.7 = save GPU, 2 = supersample), defaults to `1`
   *
   * @throws
   * Throw an error if scale is not a positive finite number.
   */
  abstract setAutoResolution(scale?: number): void;

  protected _setSize(width: number, height: number): void {
    if (this._width !== width || this._height !== height) {
      this._width = width;
      this._height = height;
      this._onSizeChanged(width, height);
      this._sizeUpdateFlagManager.dispatch();
    }
  }

  abstract _pumpPendingResize(): void;

  abstract _destroy(): void;

  protected _exitAutoResize(): void {}

  protected abstract _onSizeChanged(width: number, height: number): void;
}
