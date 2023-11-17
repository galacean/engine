import { UpdateFlagManager } from "./UpdateFlagManager";

/**
 * Canvas.
 */
export abstract class Canvas {
  /* @internal */
  _sizeUpdateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  private _width: number;
  private _height: number;

  /**
   * The width of the canvas.
   */
  get width(): number {
    return this._width;
  }

  set width(value: number) {
    if (this._width !== value) {
      this._width = value;
      this._sizeUpdateFlagManager.dispatch();
      this._onSizeChanged(value, this._height);
    }
  }

  /**
   *The height of the canvas.
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this._sizeUpdateFlagManager.dispatch();
      this._onSizeChanged(this._width, value);
    }
  }

  protected abstract _onSizeChanged(width: number, height: number): void;
}
