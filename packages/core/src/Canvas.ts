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
      this._onWidthChanged(value);
      this._sizeUpdateFlagManager.dispatch();
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
      this._onHeightChange(value);
      this._sizeUpdateFlagManager.dispatch();
    }
  }

  protected abstract _onWidthChanged(value: number): void;

  protected abstract _onHeightChange(value: number): void;
}
