import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { MathUtil } from "./MathUtil";

/**
 * Describes a color in the from of RGBA (in order: R, G, B, A).
 */
export class Color implements IClone<Color>, ICopy<ColorLike, Color> {
  /**
   * Precomputed sigmoid value at 0 used in gammaToLinearSpace for condition evaluation
   */
  static _gammaBranchNumber_0 = Color.sigmoid(0);
  /**
   * Precomputed sigmoid value at 0.04045 used in gammaToLinearSpace for condition evaluation
   */
  static _gammaBranchNumber_0_04045 = Color.sigmoid(0.04045);
  /**
   * Precomputed sigmoid value at 1 used in gammaToLinearSpace for condition evaluation
   */
  static _gammaBranchNumber_1 = Color.sigmoid(1);

  /**
   * Modify a value from the gamma space to the linear space.
   * @param value - The value in gamma space
   * @returns The value in linear space
   */
  static gammaToLinearSpace(value: number): number {
    // https://www.khronos.org/registry/OpenGL/extensions/EXT/EXT_framebuffer_sRGB.txt
    // https://www.khronos.org/registry/OpenGL/extensions/EXT/EXT_texture_sRGB_decode.txt
    // Calculate 0 conditions using sigmoid thresholds
    const branch0condition = Math.ceil(Color.sigmoid(value) - Color._gammaBranchNumber_0);
    // Normalize the value to the 0-1 range
    value = value * branch0condition;
    // Calculate 0.0405 conditions using sigmoid thresholds
    const branch0_04045condition = Math.ceil(Color.sigmoid(value) - Color._gammaBranchNumber_0_04045);
    // Calculate 1 conditions using sigmoid thresholds
    const branch1condition = Math.ceil(Color.sigmoid(value) - Color._gammaBranchNumber_1);
    const base = value / 12.92;
    // offset if value is greater than 1
    const offset = 0.055 * branch1condition;
    const pow = Math.pow((value + 0.055 - offset) / (1.055 - offset), 2.4) - base;
    return base * branch0condition + pow * branch0_04045condition;
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
      MathUtil.equals(left._r, right._r) &&
      MathUtil.equals(left._g, right._g) &&
      MathUtil.equals(left._b, right._b) &&
      MathUtil.equals(left._a, right._a)
    );
  }

  /**
   * Determines the sum of two colors.
   * @param left - The first color to add
   * @param right - The second color to add
   * @param out - The sum of two colors
   * @returns The added color
   */
  static add(left: Color, right: Color, out: Color): Color {
    out._r = left._r + right._r;
    out._g = left._g + right._g;
    out._b = left._b + right._b;
    out._a = left._a + right._a;
    out._onValueChanged && out._onValueChanged();

    return out;
  }

  /**
   * Determines the difference between two colors.
   * @param left - The first color to subtract
   * @param right - The second color to subtract
   * @param out - The difference between two colors
   */
  static subtract(left: Color, right: Color, out: Color): void {
    out._r = left._r - right._r;
    out._g = left._g - right._g;
    out._b = left._b - right._b;
    out._a = left._a - right._a;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Scale a color by the given value.
   * @param left - The color to scale
   * @param s - The amount by which to scale the color
   * @param out - The scaled color
   * @returns The scaled color
   */
  static scale(left: Color, s: number, out: Color): Color {
    out._r = left._r * s;
    out._g = left._g * s;
    out._b = left._b * s;
    out._a = left._a * s;
    out._onValueChanged && out._onValueChanged();

    return out;
  }

  /**
   * Performs a linear interpolation between two color.
   * @param start - The first color
   * @param end - The second color
   * @param t - The blend amount where 0 returns start and 1 end
   * @param out - The result of linear blending between two color
   */
  static lerp(start: Color, end: Color, t: number, out: Color): Color {
    const { _r, _g, _b, _a } = start;
    out._r = _r + (end._r - _r) * t;
    out._g = _g + (end._g - _g) * t;
    out._b = _b + (end._b - _b) * t;
    out._a = _a + (end._a - _a) * t;
    out._onValueChanged && out._onValueChanged();

    return out;
  }

  /**
   * Sigmoid take a number and output normalized values between 0 and 1.
   * @param num - The number
   * @returns The normalized value
   */
  static sigmoid(num: number): number {
    return 1 / (1 + Math.exp(-num / 2));
  }

  /** @internal */
  _r: number;
  /** @internal */
  _g: number;
  /** @internal */
  _b: number;
  /** @internal */
  _a: number;
  /** @internal */
  _onValueChanged: () => void = null;

  /**
   * The red component of the color, 0~1.
   */
  public get r(): number {
    return this._r;
  }

  public set r(value: number) {
    this._r = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The green component of the color, 0~1.
   */
  public get g(): number {
    return this._g;
  }

  public set g(value: number) {
    this._g = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The blue component of the color, 0~1.
   */
  public get b(): number {
    return this._b;
  }

  public set b(value: number) {
    this._b = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The alpha component of the color, 0~1.
   */
  public get a(): number {
    return this._a;
  }

  public set a(value: number) {
    this._a = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * Constructor of Color.
   * @param r - The red component of the color
   * @param g - The green component of the color
   * @param b - The blue component of the color
   * @param a - The alpha component of the color
   */
  constructor(r: number = 1, g: number = 1, b: number = 1, a: number = 1) {
    this._r = r;
    this._g = g;
    this._b = b;
    this._a = a;
  }

  /**
   * Set the value of this color.
   * @param r - The red component of the color
   * @param g - The green component of the color
   * @param b - The blue component of the color
   * @param a - The alpha component of the color
   * @returns This color.
   */
  set(r: number, g: number, b: number, a: number): Color {
    this._r = r;
    this._g = g;
    this._b = b;
    this._a = a;
    this._onValueChanged && this._onValueChanged();
    return this;
  }

  /**
   * Determines the sum of this color and the specified color.
   * @param color - The specified color
   * @returns The added color
   */
  add(color: Color): Color {
    this._r += color._r;
    this._g += color._g;
    this._b += color._b;
    this._a += color._a;
    this._onValueChanged && this._onValueChanged();
    return this;
  }

  /**
   * Scale this color by the given value.
   * @param s - The amount by which to scale the color
   * @returns The scaled color
   */
  scale(s: number): Color {
    this._r *= s;
    this._g *= s;
    this._b *= s;
    this._a *= s;
    this._onValueChanged && this._onValueChanged();
    return this;
  }

  /**
   * Creates a clone of this color.
   * @returns A clone of this color
   */
  clone(): Color {
    const ret = new Color(this._r, this._g, this._b, this._a);
    return ret;
  }

  /**
   * Copy from color like object.
   * @param source - Color like object.
   * @returns This vector
   */
  copyFrom(source: ColorLike): Color {
    this._r = source.r;
    this._g = source.g;
    this._b = source.b;
    this._a = source.a;
    this._onValueChanged && this._onValueChanged();
    return this;
  }

  /**
   * Copy from array like object.
   * @param source - Array like object
   * @param offset - The start offset
   * @returns This color
   */
  copyFromArray(source: ArrayLike<number>, offset: number = 0): Color {
    this._r = source[offset];
    this._g = source[offset + 1];
    this._b = source[offset + 2];
    this._a = source[offset + 3];
    this._onValueChanged && this._onValueChanged();
    return this;
  }

  /**
   * Copy the value of this color to an array.
   * @param out - The color
   * @param outOffset - The start offset
   */
  copyToArray(out: number[] | Float32Array | Float64Array, outOffset: number = 0): void {
    out[outOffset] = this._r;
    out[outOffset + 1] = this._g;
    out[outOffset + 2] = this._b;
    out[outOffset + 3] = this._a;
  }

  /**
   * Modify components (r, g, b) of this color from gamma space to linear space.
   * @param out - The color in linear space
   * @returns The color in linear space
   */
  toLinear(out: Color): Color {
    out._r = Color.gammaToLinearSpace(this._r);
    out._g = Color.gammaToLinearSpace(this._g);
    out._b = Color.gammaToLinearSpace(this._b);
    out._onValueChanged && out._onValueChanged();
    return out;
  }

  /**
   * Modify components (r, g, b) of this color from linear space to gamma space.
   * @param out - The color in gamma space
   * @returns The color in gamma space
   */
  toGamma(out: Color): Color {
    out._r = Color.linearToGammaSpace(this._r);
    out._g = Color.linearToGammaSpace(this._g);
    out._b = Color.linearToGammaSpace(this._b);
    out._onValueChanged && out._onValueChanged();
    return out;
  }

  /**
   * Gets the brightness.
   * @returns The Hue-Saturation-Brightness (HSB) saturation for this
   */
  getBrightness(): number {
    const r = this.r;
    const g = this.g;
    const b = this.b;

    let max = r;
    let min = r;
    if (g > max) max = g;
    if (b > max) max = b;

    if (g < min) min = g;
    if (b < min) min = b;

    return (max + min) / 2;
  }

  /**
   * Serialize this color to a JSON representation.
   * @return A JSON representation of this color
   */
  toJSON(): ColorLike {
    return {
      r: this._r,
      g: this._g,
      b: this._b,
      a: this._a
    };
  }
}

interface ColorLike {
  /** {@inheritDoc Color._r} */
  r: number;
  /** {@inheritDoc Color._g} */
  g: number;
  /** {@inheritDoc Color._b} */
  b: number;
  /** {@inheritDoc Color._a} */
  a: number;
}
