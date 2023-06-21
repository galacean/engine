import { IClone } from "./IClone";
import { ICopy } from "./ICopy";

// A 2d rectangle defined by x and y position, width and height.
export class Rect implements IClone<Rect>, ICopy<Rect, Rect> {
  /**
   * Determines the sum of two rectangles.
   * @param left - The first rectangle to add
   * @param right - The second rectangle to add
   * @param out - The sum of two rectangles
   */
  static add(left: Rect, right: Rect, out: Rect): void {
    out._x = left._x + right._x;
    out._y = left._y + right._y;
    out._width = left._width + right._width;
    out._height = left._height + right._height;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Performs a linear interpolation between two rectangles.
   * @param start - The start rectangle
   * @param end - The end rectangle
   * @param t - The blend amount where 0 returns start and 1 end
   * @param out - The result of linear blending between two rectangles
   */
  static lerp(start: Rect, end: Rect, t: number, out: Rect): void {
    const { _x, _y, _width, _height } = start;
    out._x = _x + (end._x - _x) * t;
    out._y = _y + (end._y - _y) * t;
    out._width = _width + (end._width - _width) * t;
    out._height = _height + (end._height - _height) * t;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Scale a rectangle by the given value.
   * @param a - The rectangle to scale
   * @param s - The amount by which to scale the rectangle
   * @param out - The scaled rectangle
   */
  static scale(a: Rect, s: number, out: Rect): void {
    out._x = a._x * s;
    out._y = a._y * s;
    out._width = a._width * s;
    out._height = a._height * s;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the difference between two rectangles.
   * @param left - The first rectangle to subtract
   * @param right - The second rectangle to subtract
   * @param out - The difference between two rectangles
   */
  static subtract(left: Rect, right: Rect, out: Rect): void {
    out._x = left._x - right._x;
    out._y = left._y - right._y;
    out._width = left._width - right._width;
    out._height = left._height - right._height;
    out._onValueChanged && out._onValueChanged();
  }

  /** @internal */
  _x: number;
  /** @internal */
  _y: number;
  /** @internal */
  _width: number;
  /** @internal */
  _height: number;
  /** @internal */
  _onValueChanged: () => void = null;

  /**
   *  The x coordinate of the rectangle.
   */
  get x(): number {
    return this._x;
  }

  set x(value: number) {
    this._x = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   *  The y coordinate of the rectangle.
   */
  get y(): number {
    return this._y;
  }

  set y(value: number) {
    this._y = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The width of the rectangle, measured from the x position.
   */
  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The height of the rectangle, measured from the y position.
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this._height = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * Constructor of Rect.
   * @param x - The x coordinate of the rectangle, default 0
   * @param y - The y coordinate of the rectangle, default 0
   * @param width - The width of the rectangle, measured from the x position, default 0
   * @param height - The height of the rectangle, measured from the y position, default 0
   */
  constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
    this._x = x;
    this._y = y;
    this._width = width;
    this._height = height;
  }

  /**
   * Set the value of this rectangle.
   * @param x - The x coordinate of the rectangle
   * @param y - The y coordinate of the rectangle
   * @param width - The width of the rectangle, measured from the x position
   * @param height - The height of the rectangle, measured from the y position
   * @returns This rectangle
   */
  set(x: number, y: number, width: number, height: number): Rect {
    this._x = x;
    this._y = y;
    this._width = width;
    this._height = height;
    this._onValueChanged && this._onValueChanged();
    return this;
  }

  /**
   * Creates a clone of this rect.
   * @returns A clone of this rect
   */
  clone(): Rect {
    return new Rect(this.x, this.y, this.width, this.height);
  }

  /**
   * Copy this rect from the specified rect.
   * @param source - The specified rect
   * @returns This rect
   */
  copyFrom(source: Rect): Rect {
    this._x = source.x;
    this._y = source.y;
    this._width = source.width;
    this._height = source.height;
    this._onValueChanged && this._onValueChanged();
    return this;
  }
}
