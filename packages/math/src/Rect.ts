import { IClone } from "@oasis-engine/design";

// A 2d rectangle defined by x and y position, width and height.
export class Rect implements IClone {
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
   * Creates a clone of this rect.
   * @returns A clone of this rect
   */
  clone(): Rect {
    return new Rect(this.x, this.y, this.width, this.height);
  }

  /**
   * Clones this rect to the specified rect.
   * @param out - The specified rect
   * @returns The specified rect
   */
  cloneTo(out: Rect): Rect {
    out.x = this.x;
    out.y = this.y;
    out.width = this.width;
    out.height = this.height;
    return out;
  }
}
