import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { MathUtil } from "./MathUtil";

/**
 * Describes a 2D-vector.
 */
export class Vector2 implements IClone<Vector2>, ICopy<Vector2Like, Vector2> {
  /** @internal */
  static readonly _zero = new Vector2(0.0, 0.0);
  /** @internal */
  static readonly _one = new Vector2(1.0, 1.0);

  /**
   * Determines the sum of two vectors.
   * @param left - The first vector to add
   * @param right - The second vector to add
   * @param out - The sum of two vectors
   */
  static add(left: Vector2, right: Vector2, out: Vector2): void {
    out._x = left._x + right._x;
    out._y = left._y + right._y;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the difference between two vectors.
   * @param left - The first vector to subtract
   * @param right - The second vector to subtract
   * @param out - The difference between two vectors
   */
  static subtract(left: Vector2, right: Vector2, out: Vector2): void {
    out._x = left._x - right._x;
    out._y = left._y - right._y;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the product of two vectors.
   * @param left - The first vector to multiply
   * @param right - The second vector to multiply
   * @param out - The product of two vectors
   */
  static multiply(left: Vector2, right: Vector2, out: Vector2): void {
    out._x = left._x * right._x;
    out._y = left._y * right._y;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the divisor of two vectors.
   * @param left - The first vector to divide
   * @param right - The second vector to divide
   * @param out - The divisor of two vectors
   */
  static divide(left: Vector2, right: Vector2, out: Vector2): void {
    out._x = left._x / right._x;
    out._y = left._y / right._y;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the dot product of two vectors.
   * @param left - The first vector to dot
   * @param right - The second vector to dot
   * @returns The dot product of two vectors
   */
  static dot(left: Vector2, right: Vector2): number {
    return left._x * right._x + left._y * right._y;
  }

  /**
   * Determines the distance of two vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @returns The distance of two vectors
   */
  static distance(left: Vector2, right: Vector2): number {
    const x = right._x - left._x;
    const y = right._y - left._y;
    return Math.sqrt(x * x + y * y);
  }

  /**
   * Determines the squared distance of two vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @returns The squared distance of two vectors
   */
  static distanceSquared(left: Vector2, right: Vector2): number {
    const x = right._x - left._x;
    const y = right._y - left._y;
    return x * x + y * y;
  }

  /**
   * Determines whether the specified vectors are equals.
   * @param left - The first vector to compare
   * @param right - The second vector to compare
   * @returns True if the specified vectors are equals, false otherwise
   */
  static equals(left: Vector2, right: Vector2): boolean {
    return MathUtil.equals(left._x, right._x) && MathUtil.equals(left._y, right._y);
  }

  /**
   * Performs a linear interpolation between two vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param t - The blend amount where 0 returns left and 1 right
   * @param out - The result of linear blending between two vectors
   */
  static lerp(left: Vector2, right: Vector2, t: number, out: Vector2): void {
    const { _x, _y } = left;
    out._x = _x + (right._x - _x) * t;
    out._y = _y + (right._y - _y) * t;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a vector containing the largest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the largest components of the specified vectors
   */
  static max(left: Vector2, right: Vector2, out: Vector2): void {
    out._x = Math.max(left._x, right._x);
    out._y = Math.max(left._y, right._y);
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a vector containing the smallest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the smallest components of the specified vectors
   */
  static min(left: Vector2, right: Vector2, out: Vector2): void {
    out._x = Math.min(left._x, right._x);
    out._y = Math.min(left._y, right._y);
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Reverses the direction of a given vector.
   * @param left - The vector to negate
   * @param out - The vector facing in the opposite direction
   */
  static negate(left: Vector2, out: Vector2): void {
    out._x = -left._x;
    out._y = -left._y;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Converts the vector into a unit vector.
   * @param left - The vector to normalize
   * @param out - The normalized vector
   */
  static normalize(left: Vector2, out: Vector2): void {
    const { _x, _y } = left;
    let len = Math.sqrt(_x * _x + _y * _y);
    if (len > MathUtil.zeroTolerance) {
      len = 1 / len;
      out._x = _x * len;
      out._y = _y * len;
      out._onValueChanged && out._onValueChanged();
    }
  }

  /**
   * Scale a vector by the given value.
   * @param left - The vector to scale
   * @param s - The amount by which to scale the vector
   * @param out - The scaled vector
   */
  static scale(left: Vector2, s: number, out: Vector2): void {
    out._x = left._x * s;
    out._y = left._y * s;
    out._onValueChanged && out._onValueChanged();
  }

  /** @internal */
  _x: number;
  /** @internal */
  _y: number;
  /** @internal */
  _onValueChanged: () => void = null;

  /**
   * The x component of the vector.
   */
  public get x(): number {
    return this._x;
  }

  public set x(value: number) {
    this._x = value;
   this._onValueChanged?.();
  }

  /**
   * The y component of the vector.
   */
  public get y(): number {
    return this._y;
  }

  public set y(value: number) {
    this._y = value;
   this._onValueChanged?.();
  }

  /**
   * Constructor of Vector2.
   * @param x - The x component of the vector, default 0
   * @param y - The y component of the vector, default 0
   */
  constructor(x: number = 0, y: number = 0) {
    this._x = x;
    this._y = y;
  }

  /**
   * Set the value of this vector.
   * @param x - The x component of the vector
   * @param y - The y component of the vector
   * @returns This vector
   */
  set(x: number, y: number): Vector2 {
    this._x = x;
    this._y = y;
   this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the sum of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  add(right: Vector2): Vector2 {
    this._x += right._x;
    this._y += right._y;
   this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the difference of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  subtract(right: Vector2): Vector2 {
    this._x -= right._x;
    this._y -= right._y;
   this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the product of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  multiply(right: Vector2): Vector2 {
    this._x *= right._x;
    this._y *= right._y;
   this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the divisor of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  divide(right: Vector2): Vector2 {
    this._x /= right._x;
    this._y /= right._y;
   this._onValueChanged?.();
    return this;
  }

  /**
   * Calculate the length of this vector.
   * @returns The length of this vector
   */
  length(): number {
    const { _x, _y } = this;
    return Math.sqrt(_x * _x + _y * _y);
  }

  /**
   * Calculate the squared length of this vector.
   * @returns The squared length of this vector
   */
  lengthSquared(): number {
    const { _x, _y } = this;
    return _x * _x + _y * _y;
  }

  /**
   * Reverses the direction of this vector.
   * @returns This vector
   */
  negate(): Vector2 {
    this._x = -this._x;
    this._y = -this._y;
   this._onValueChanged?.();
    return this;
  }

  /**
   * Converts this vector into a unit vector.
   * @returns This vector
   */
  normalize(): Vector2 {
    Vector2.normalize(this, this);
    return this;
  }

  /**
   * Scale this vector by the given value.
   * @param s - The amount by which to scale the vector
   * @returns This vector
   */
  scale(s: number): Vector2 {
    this._x *= s;
    this._y *= s;
   this._onValueChanged?.();
    return this;
  }

  /**
   * Creates a clone of this vector.
   * @returns A clone of this vector
   */
  clone(): Vector2 {
    return new Vector2(this._x, this._y);
  }

  /**
   * Copy from vector2 like object.
   * @param source - Vector2 like object
   * @returns This vector
   */
  copyFrom(source: Vector2Like): Vector2 {
    this._x = source.x;
    this._y = source.y;
   this._onValueChanged?.();
    return this;
  }

  /**
   * Copy to vector2 like object.
   * @param target - Vector2 like object
   * @returns This Vector2 like object
   */
  copyTo(target: Vector2Like): Vector2Like {
    target.x = this._x;
    target.y = this._y;
    return target;
  }

  /**
   * Copy the value of this vector from an array.
   * @param array - The array
   * @param offset - The start offset of the array
   * @returns This vector
   */
  copyFromArray(array: ArrayLike<number>, offset: number = 0): Vector2 {
    this._x = array[offset];
    this._y = array[offset + 1];
   this._onValueChanged?.();
    return this;
  }

  /**
   * Copy the value of this vector to an array.
   * @param out - The array
   * @param outOffset - The start offset of the array
   */
  copyToArray(out: number[] | Float32Array | Float64Array, outOffset: number = 0) {
    out[outOffset] = this._x;
    out[outOffset + 1] = this._y;
  }

  /**
   * Serialize this vector to a JSON representation.
   * @returns A JSON representation of this vector
   */
  toJSON(): Vector2Like {
    return {
      x: this._x,
      y: this._y
    };
  }
}

interface Vector2Like {
  /** {@inheritDoc Vector2.x} */
  x: number;
  /** {@inheritDoc Vector2.y} */
  y: number;
}
