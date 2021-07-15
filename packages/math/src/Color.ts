import { IClone } from "@oasis-engine/design";
import { MathUtil } from "./MathUtil";

/**
 * Describes a color in the from of RGBA (in order: R, G, B, A).
 */
export class Color implements IClone {
  /**
   * Modify a value from the gamma space to the linear space.
   * @param value - The value in gamma space
   * @returns The value in linear space
   */
  static gammaToLinearSpace(value: number): number {
    // https://www.khronos.org/registry/OpenGL/extensions/EXT/EXT_framebuffer_sRGB.txt
    // https://www.khronos.org/registry/OpenGL/extensions/EXT/EXT_texture_sRGB_decode.txt

    if (value <= 0.0) return 0.0;
    else if (value <= 0.04045) return value / 12.92;
    else if (value < 1.0) return Math.pow((value + 0.055) / 1.055, 2.4);
    else return Math.pow(value, 2.4);
  }

  /**
   * Modify a value from the linear space to the gamma space.
   * @param value - The value in linear space
   * @returns The value in gamma space
   */
  static linearToGammaSpace(value: number): number {
    // https://www.khronos.org/registry/OpenGL/extensions/EXT/EXT_framebuffer_sRGB.txt
    // https://www.khronos.org/registry/OpenGL/extensions/EXT/EXT_texture_sRGB_decode.txt

    if (value <= 0.0) return 0.0;
    else if (value < 0.0031308) return 12.92 * value;
    else if (value < 1.0) return 1.055 * Math.pow(value, 0.41666) - 0.055;
    else return Math.pow(value, 0.41666);
  }

  /**
   * Determines whether the specified colors are equals.
   * @param left - The first color to compare
   * @param right - The second color to compare
   * @returns True if the specified colors are equals, false otherwise
   */
  static equals(left: Color, right: Color): boolean {
    return (
      MathUtil.equals(left.r, right.r) &&
      MathUtil.equals(left.g, right.g) &&
      MathUtil.equals(left.b, right.b) &&
      MathUtil.equals(left.a, right.a)
    );
  }

  /**
   * Determines the sum of two colors.
   * @param left - The first color to add
   * @param right - The second color to add
   * @param out - The sum of two colors
   */
  static add(left: Color, right: Color, out: Color): Color {
    out.r = left.r + right.r;
    out.g = left.g + right.g;
    out.b = left.b + right.b;
    out.a = left.a + right.a;

    return out;
  }

  /**
   * Scale a color by the given value.
   * @param left - The color to scale
   * @param scale - The amount by which to scale the color
   * @param out - The scaled color
   */
  static scale(left: Color, s: number, out: Color): Color {
    out.r = left.r * s;
    out.g = left.g * s;
    out.b = left.b * s;
    out.a = left.a * s;

    return out;
  }

  /** The red component of the color, 0~1. */
  public r: number;
  /** The green component of the color, 0~1. */
  public g: number;
  /** The blue component of the color, 0~1. */
  public b: number;
  /** The alpha component of the color, 0~1. */
  public a: number;

  /**
   * Constructor of Color.
   * @param r - The red component of the color
   * @param g - The green component of the color
   * @param b - The blue component of the color
   * @param a - The alpha component of the color
   */
  constructor(r: number = 1, g: number = 1, b: number = 1, a: number = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }

  /**
   * Set the value of this color.
   * @param r - The red component of the color
   * @param g - The green component of the color
   * @param b - The blue component of the color
   * @param a - The alpha component of the color
   * @returns This color.
   */
  setValue(r: number, g: number, b: number, a: number): Color {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
    return this;
  }

  /**
   * Determines the sum of this color and the specified color.
   * @param color - The specified color
   * @returns This color
   */
  add(color: Color): Color {
    this.r += color.r;
    this.g += color.g;
    this.b += color.b;
    this.a += color.a;

    return this;
  }

  /**
   * Scale this color by the given value.
   * @param s - The amount by which to scale the color
   * @returns This color
   */
  scale(s: number): Color {
    this.r *= s;
    this.g *= s;
    this.b *= s;
    this.a *= s;

    return this;
  }

  /**
   * Creates a clone of this color.
   * @returns A clone of this color
   */
  clone(): Color {
    const ret = new Color(this.r, this.g, this.b, this.a);
    return ret;
  }

  /**
   * Clones this color to the specified color.
   * @param out - The specified color
   * @returns The specified color
   */
  cloneTo(out: Color): Color {
    out.r = this.r;
    out.g = this.g;
    out.b = this.b;
    out.a = this.a;
    return out;
  }

  /**
   * Modify components (r, g, b) of this color from gamma space to linear space.
   * @param out - The color in linear space
   * @returns The color in linear space
   */
  toLinear(out: Color): Color {
    out.r = Color.gammaToLinearSpace(this.r);
    out.g = Color.gammaToLinearSpace(this.g);
    out.b = Color.gammaToLinearSpace(this.b);
    return out;
  }

  /**
   * Modify components (r, g, b) of this color from linear space to gamma space.
   * @param out - The color in gamma space
   * @returns The color in gamma space
   */
  toGamma(out: Color): Color {
    out.r = Color.linearToGammaSpace(this.r);
    out.g = Color.linearToGammaSpace(this.g);
    out.b = Color.linearToGammaSpace(this.b);
    return out;
  }
}
