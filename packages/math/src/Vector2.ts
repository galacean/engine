import { IClone } from "@oasis-engine/design";
import { MathUtil } from "./MathUtil";

/**
 * Describes a 2D-vector.
 */
export class Vector2 implements IClone {
  /** @internal zero.*/
  static readonly _zero = new Vector2(0.0, 0.0);
  /** @internal one.*/
  static readonly _one = new Vector2(1.0, 1.0);

  /**
   * Determines the sum of two vectors.
   * @param left - The first vector to add
   * @param right - The second vector to add
   * @param out - The sum of two vectors
   */
  static add(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = left.x + right.x;
    out.y = left.y + right.y;
  }

  /**
   * Determines the difference between two vectors.
   * @param left - The first vector to subtract
   * @param right - The second vector to subtract
   * @param out - The difference between two vectors
   */
  static subtract(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = left.x - right.x;
    out.y = left.y - right.y;
  }

  /**
   * Determines the product of two vectors.
   * @param left - The first vector to multiply
   * @param right - The second vector to multiply
   * @param out - The product of two vectors
   */
  static multiply(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = left.x * right.x;
    out.y = left.y * right.y;
  }

  /**
   * Determines the divisor of two vectors.
   * @param left - The first vector to divide
   * @param right - The second vector to divide
   * @param out - The divisor of two vectors
   */
  static divide(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = left.x / right.x;
    out.y = left.y / right.y;
  }

  /**
   * Determines the dot product of two vectors.
   * @param left - The first vector to dot
   * @param right - The second vector to dot
   * @returns The dot product of two vectors
   */
  static dot(left: Vector2, right: Vector2): number {
    return left.x * right.x + left.y * right.y;
  }

  /**
   * Determines the distance of two vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @returns The distance of two vectors
   */
  static distance(left: Vector2, right: Vector2): number {
    const x = right.x - left.x;
    const y = right.y - left.y;
    return Math.sqrt(x * x + y * y);
  }

  /**
   * Determines the squared distance of two vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @returns The squared distance of two vectors
   */
  static distanceSquared(left: Vector2, right: Vector2): number {
    const x = right.x - left.x;
    const y = right.y - left.y;
    return x * x + y * y;
  }

  /**
   * Determines whether the specified vectors are equals.
   * @param left - The first vector to compare
   * @param right - The second vector to compare
   * @returns True if the specified vectors are equals, false otherwise
   */
  static equals(left: Vector2, right: Vector2): boolean {
    return MathUtil.equals(left.x, right.x) && MathUtil.equals(left.y, right.y);
  }

  /**
   * Performs a linear interpolation between two vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param t - The blend amount where 0 returns left and 1 right
   * @param out - The result of linear blending between two vectors
   */
  static lerp(left: Vector2, right: Vector2, t: number, out: Vector2): void {
    const { x, y } = left;
    out.x = x + (right.x - x) * t;
    out.y = y + (right.y - y) * t;
  }

  /**
   * Calculate a vector containing the largest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the largest components of the specified vectors
   */
  static max(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = Math.max(left.x, right.x);
    out.y = Math.max(left.y, right.y);
  }

  /**
   * Calculate a vector containing the smallest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the smallest components of the specified vectors
   */
  static min(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = Math.min(left.x, right.x);
    out.y = Math.min(left.y, right.y);
  }

  /**
   * Reverses the direction of a given vector.
   * @param left - The vector to negate
   * @param out - The vector facing in the opposite direction
   */
  static negate(left: Vector2, out: Vector2): void {
    out.x = -left.x;
    out.y = -left.y;
  }

  /**
   * Converts the vector into a unit vector.
   * @param left - The vector to normalize
   * @param out - The normalized vector
   */
  static normalize(left: Vector2, out: Vector2): void {
    const { x, y } = left;
    let len: number = Math.sqrt(x * x + y * y);
    if (len > MathUtil.zeroTolerance) {
      len = 1 / len;
      out.x = x * len;
      out.y = y * len;
    }
  }

  /**
   * Scale a vector by the given value.
   * @param left - The vector to scale
   * @param scale - The amount by which to scale the vector
   * @param out - The scaled vector
   */
  static scale(left: Vector2, s: number, out: Vector2): void {
    out.x = left.x * s;
    out.y = left.y * s;
  }

  /** The x component of the vector. */
  x: number;
  /** The y component of the vector. */
  y: number;

  /**
   * Constructor of Vector2.
   * @param x - The x component of the vector, default 0
   * @param y - The y component of the vector, default 0
   */
  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Set the value of this vector.
   * @param x - The x component of the vector
   * @param y - The y component of the vector
   * @returns This vector
   */
  setValue(x: number, y: number): Vector2 {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Set the value of this vector by an array.
   * @param array - The array
   * @param offset - The start offset of the array
   * @returns This vector
   */
  setValueByArray(array: ArrayLike<number>, offset: number = 0): Vector2 {
    this.x = array[offset];
    this.y = array[offset + 1];
    return this;
  }

  /**
   * Determines the sum of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  add(right: Vector2): Vector2 {
    this.x += right.x;
    this.y += right.y;
    return this;
  }

  /**
   * Determines the difference of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  subtract(right: Vector2): Vector2 {
    this.x -= right.x;
    this.y -= right.y;
    return this;
  }

  /**
   * Determines the product of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  multiply(right: Vector2): Vector2 {
    this.x *= right.x;
    this.y *= right.y;
    return this;
  }

  /**
   * Determines the divisor of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  divide(right: Vector2): Vector2 {
    this.x /= right.x;
    this.y /= right.y;
    return this;
  }

  /**
   * Calculate the length of this vector.
   * @returns The length of this vector
   */
  length(): number {
    const { x, y } = this;
    return Math.sqrt(x * x + y * y);
  }

  /**
   * Calculate the squared length of this vector.
   * @returns The squared length of this vector
   */
  lengthSquared(): number {
    const { x, y } = this;
    return x * x + y * y;
  }

  /**
   * Reverses the direction of this vector.
   * @returns This vector
   */
  negate(): Vector2 {
    this.x = -this.x;
    this.y = -this.y;
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
    this.x *= s;
    this.y *= s;
    return this;
  }

  /**
   * Clone the value of this vector to an array.
   * @param out - The array
   * @param outOffset - The start offset of the array
   */
  toArray(out: number[] | Float32Array | Float64Array, outOffset: number = 0) {
    out[outOffset] = this.x;
    out[outOffset + 1] = this.y;
  }

  /**
   * Creates a clone of this vector.
   * @returns A clone of this vector
   */
  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  /**
   * Clones this vector to the specified vector.
   * @param out - The specified vector
   * @returns The specified vector
   */
  cloneTo(out: Vector2): Vector2 {
    out.x = this.x;
    out.y = this.y;
    return out;
  }
}
