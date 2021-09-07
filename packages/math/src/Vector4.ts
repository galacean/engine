import { IClone } from "./IClone";
import { MathUtil } from "./MathUtil";
import { Matrix } from "./Matrix";
import { Quaternion } from "./Quaternion";

/**
 * Describes a 4D-vector.
 */
export class Vector4 implements IClone {
  /** @internal */
  static readonly _zero = new Vector4(0.0, 0.0, 0.0, 0.0);
  /** @internal */
  static readonly _one = new Vector4(1.0, 1.0, 1.0, 1.0);

  /**
   * Determines the sum of two vectors.
   * @param left - The first vector to add
   * @param right - The second vector to add
   * @param out - The sum of two vectors
   */
  static add(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = left.x + right.x;
    out.y = left.y + right.y;
    out.z = left.z + right.z;
    out.w = left.w + right.w;
  }

  /**
   * Determines the difference between two vectors.
   * @param left - The first vector to subtract
   * @param right - The second vector to subtract
   * @param out - The difference between two vectors
   */
  static subtract(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = left.x - right.x;
    out.y = left.y - right.y;
    out.z = left.z - right.z;
    out.w = left.w - right.w;
  }

  /**
   * Determines the product of two vectors.
   * @param left - The first vector to multiply
   * @param right - The second vector to multiply
   * @param out - The product of two vectors
   */
  static multiply(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = left.x * right.x;
    out.y = left.y * right.y;
    out.z = left.z * right.z;
    out.w = left.w * right.w;
  }

  /**
   * Determines the divisor of two vectors.
   * @param left - The first vector to divide
   * @param right - The second vector to divide
   * @param out - The divisor of two vectors
   */
  static divide(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = left.x / right.x;
    out.y = left.y / right.y;
    out.z = left.z / right.z;
    out.w = left.w / right.w;
  }

  /**
   * Determines the dot product of two vectors.
   * @param left - The first vector to dot
   * @param right - The second vector to dot
   * @returns The dot product of two vectors
   */
  static dot(left: Vector4, right: Vector4): number {
    return left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w;
  }

  /**
   * Determines the distance of two vectors.
   * @param a - The first vector
   * @param b - The second vector
   * @returns The distance of two vectors
   */
  static distance(a: Vector4, b: Vector4): number {
    const x = b.x - a.x;
    const y = b.y - a.y;
    const z = b.z - a.z;
    const w = b.w - a.w;
    return Math.sqrt(x * x + y * y + z * z + w * w);
  }

  /**
   * Determines the squared distance of two vectors.
   * @param a - The first vector
   * @param b - The second vector
   * @returns The squared distance of two vectors
   */
  static distanceSquared(a: Vector4, b: Vector4): number {
    const x = b.x - a.x;
    const y = b.y - a.y;
    const z = b.z - a.z;
    const w = b.w - a.w;
    return x * x + y * y + z * z + w * w;
  }

  /**
   * Determines whether the specified vectors are equals.
   * @param left - The first vector to compare
   * @param right - The second vector to compare
   * @returns True if the specified vectors are equals, false otherwise
   */
  static equals(left: Vector4, right: Vector4): boolean {
    return (
      MathUtil.equals(left.x, right.x) &&
      MathUtil.equals(left.y, right.y) &&
      MathUtil.equals(left.z, right.z) &&
      MathUtil.equals(left.w, right.w)
    );
  }

  /**
   * Performs a linear interpolation between two vectors.
   * @param start - The first vector
   * @param end - The second vector
   * @param t - The blend amount where 0 returns start and 1 end
   * @param out - The result of linear blending between two vectors
   */
  static lerp(start: Vector4, end: Vector4, t: number, out: Vector4): void {
    const { x, y, z, w } = start;
    out.x = x + (end.x - x) * t;
    out.y = y + (end.y - y) * t;
    out.z = z + (end.z - z) * t;
    out.w = w + (end.w - w) * t;
  }

  /**
   * Calculate a vector containing the largest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the largest components of the specified vectors
   */
  static max(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = Math.max(left.x, right.x);
    out.y = Math.max(left.y, right.y);
    out.z = Math.max(left.z, right.z);
    out.w = Math.max(left.w, right.w);
  }

  /**
   * Calculate a vector containing the smallest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the smallest components of the specified vectors
   */
  static min(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = Math.min(left.x, right.x);
    out.y = Math.min(left.y, right.y);
    out.z = Math.min(left.z, right.z);
    out.w = Math.min(left.w, right.w);
  }

  /**
   * Reverses the direction of a given vector.
   * @param a - The vector to negate
   * @param out - The vector facing in the opposite direction
   */
  static negate(a: Vector4, out: Vector4): void {
    out.x = -a.x;
    out.y = -a.y;
    out.z = -a.z;
    out.w = -a.w;
  }

  /**
   * Converts the vector into a unit vector.
   * @param a - The vector to normalize
   * @param out - The normalized vector
   */
  static normalize(a: Vector4, out: Vector4): void {
    const { x, y, z, w } = a;
    let len: number = Math.sqrt(x * x + y * y + z * z + w * w);
    if (len > MathUtil.zeroTolerance) {
      len = 1 / len;
      out.x = x * len;
      out.y = y * len;
      out.z = z * len;
      out.w = w * len;
    }
  }

  /**
   * Scale a vector by the given value.
   * @param a - The vector to scale
   * @param s - The amount by which to scale the vector
   * @param out - The scaled vector
   */
  static scale(a: Vector4, s: number, out: Vector4): void {
    out.x = a.x * s;
    out.y = a.y * s;
    out.z = a.z * s;
    out.w = a.w * s;
  }

  /**
   * Performs a transformation using the given 4x4 matrix.
   * @param v - The vector to transform
   * @param m - The transform matrix
   * @param out - The transformed vector3
   */
  static transform(v: Vector4, m: Matrix, out: Vector4): void {
    const { x, y, z, w } = v;
    const e = m.elements;
    out.x = x * e[0] + y * e[4] + z * e[8] + w * e[12];
    out.y = x * e[1] + y * e[5] + z * e[9] + w * e[13];
    out.z = x * e[2] + y * e[6] + z * e[10] + w * e[14];
    out.w = x * e[3] + y * e[7] + z * e[11] + w * e[15];
  }

  /**
   * Performs a transformation using the given quaternion.
   * @param v - The vector to transform
   * @param q - The transform quaternion
   * @param out - The transformed vector
   */
  static transformByQuat(v: Vector4, q: Quaternion, out: Vector4): void {
    const { x, y, z, w } = v;
    const qx = q.x;
    const qy = q.y;
    const qz = q.z;
    const qw = q.w;

    // calculate quat * vec
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat
    out.x = ix * qw - iw * qx - iy * qz + iz * qy;
    out.y = iy * qw - iw * qy - iz * qx + ix * qz;
    out.z = iz * qw - iw * qz - ix * qy + iy * qx;
    out.w = w;
  }

  /** The x component of the vector. */
  x: number;
  /** The y component of the vector. */
  y: number;
  /** The z component of the vector. */
  z: number;
  /** The w component of the vector. */
  w: number;

  /**
   * Constructor of Vector4.
   * @param x - The x component of the vector, default 0
   * @param y - The y component of the vector, default 0
   * @param z - The z component of the vector, default 0
   * @param w - The w component of the vector, default 0
   */
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /**
   * Set the value of this vector.
   * @param x - The x component of the vector
   * @param y - The y component of the vector
   * @param z - The z component of the vector
   * @param w - The w component of the vector
   * @returns This vector
   */
  setValue(x: number, y: number, z: number, w: number): Vector4 {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  /**
   * Set the value of this vector by an array.
   * @param array - The array
   * @param offset - The start offset of the array
   * @returns This vector
   */
  setValueByArray(array: ArrayLike<number>, offset: number = 0): Vector4 {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    this.w = array[offset + 3];
    return this;
  }

  /**
   * Determines the sum of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  add(right: Vector4): Vector4 {
    this.x += right.x;
    this.y += right.y;
    this.z += right.z;
    this.w += right.w;
    return this;
  }

  /**
   * Determines the difference of this vector and the specified vector.
   * @param right - the specified vector
   * @returns This vector
   */
  subtract(right: Vector4): Vector4 {
    this.x -= right.x;
    this.y -= right.y;
    this.z -= right.z;
    this.w -= right.w;
    return this;
  }

  /**
   * Determines the product of this vector and the specified vector.
   * @param right - the specified vector
   * @returns This vector
   */
  multiply(right: Vector4): Vector4 {
    this.x *= right.x;
    this.y *= right.y;
    this.z *= right.z;
    this.w *= right.w;
    return this;
  }

  /**
   * Determines the divisor of this vector and the specified vector.
   * @param right - the specified vector
   * @returns This vector
   */
  divide(right: Vector4): Vector4 {
    this.x /= right.x;
    this.y /= right.y;
    this.z /= right.z;
    this.w /= right.w;
    return this;
  }

  /**
   * Calculate the length of this vector.
   * @returns The length of this vector
   */
  length(): number {
    const { x, y, z, w } = this;
    return Math.sqrt(x * x + y * y + z * z + w * w);
  }

  /**
   * Calculate the squared length of this vector.
   * @returns The squared length of this vector
   */
  lengthSquared(): number {
    const { x, y, z, w } = this;
    return x * x + y * y + z * z + w * w;
  }

  /**
   * Reverses the direction of this vector.
   * @returns This vector
   */
  negate(): Vector4 {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    this.w = -this.w;
    return this;
  }

  /**
   * Converts this vector into a unit vector.
   * @returns This vector
   */
  normalize(): Vector4 {
    Vector4.normalize(this, this);
    return this;
  }

  /**
   * Scale this vector by the given value.
   * @param s - The amount by which to scale the vector
   * @returns This vector
   */
  scale(s: number): Vector4 {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    this.w *= s;
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
    out[outOffset + 2] = this.z;
    out[outOffset + 3] = this.w;
  }

  /**
   * Creates a clone of this vector.
   * @returns A clone of this vector
   */
  clone(): Vector4 {
    let ret = new Vector4(this.x, this.y, this.z, this.w);
    return ret;
  }

  /**
   * Clones this vector to the specified vector.
   * @param out - The specified vector
   * @returns The specified vector
   */
  cloneTo(out: Vector4): Vector4 {
    out.x = this.x;
    out.y = this.y;
    out.z = this.z;
    out.w = this.w;
    return out;
  }
}
