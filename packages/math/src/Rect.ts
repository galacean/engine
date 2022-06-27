import { IClone } from "./IClone";
import { ICopy } from "./ICopy";

// A 2d rectangle defined by x and y position, width and height.
export class Rect implements IClone<Rect>, ICopy<Rect, Rect> {
  /** The x coordinate of the rectangle. */
  public x: number;
  /** The y coordinate of the rectangle. */
  public y: number;
  /** The width of the rectangle, measured from the x position. */
  public width: number;
  /** The height of the rectangle, measured from the y position. */
  public height: number;

  /**
   * Constructor of Rect.
   * @param x - The x coordinate of the rectangle, default 0
   * @param y - The y coordinate of the rectangle, default 0
   * @param width - The width of the rectangle, measured from the x position, default 0
   * @param height - The height of the rectangle, measured from the y position, default 0
   */
  constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
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
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
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
    this.x = source.x;
    this.y = source.y;
    this.width = source.width;
    this.height = source.height;
    return this;
  }
}
