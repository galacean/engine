import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { MathUtil } from "./MathUtil";
import { Matrix } from "./Matrix";
import { Quaternion } from "./Quaternion";

/**
 * Describes a 4D-vector.
 */
export class Vector4 implements IClone<Vector4>, ICopy<Vector4Like, Vector4> {
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
    out._x = left._x + right._x;
    out._y = left._y + right._y;
    out._z = left._z + right._z;
    out._w = left._w + right._w;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the difference between two vectors.
   * @param left - The first vector to subtract
   * @param right - The second vector to subtract
   * @param out - The difference between two vectors
   */
  static subtract(left: Vector4, right: Vector4, out: Vector4): void {
    out._x = left._x - right._x;
    out._y = left._y - right._y;
    out._z = left._z - right._z;
    out._w = left._w - right._w;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the product of two vectors.
   * @param left - The first vector to multiply
   * @param right - The second vector to multiply
   * @param out - The product of two vectors
   */
  static multiply(left: Vector4, right: Vector4, out: Vector4): void {
    out._x = left._x * right._x;
    out._y = left._y * right._y;
    out._z = left._z * right._z;
    out._w = left._w * right._w;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the divisor of two vectors.
   * @param left - The first vector to divide
   * @param right - The second vector to divide
   * @param out - The divisor of two vectors
   */
  static divide(left: Vector4, right: Vector4, out: Vector4): void {
    out._x = left._x / right._x;
    out._y = left._y / right._y;
    out._z = left._z / right._z;
    out._w = left._w / right._w;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the dot product of two vectors.
   * @param left - The first vector to dot
   * @param right - The second vector to dot
   * @returns The dot product of two vectors
   */
  static dot(left: Vector4, right: Vector4): number {
    return left._x * right._x + left._y * right._y + left._z * right._z + left._w * right._w;
  }

  /**
   * Determines the distance of two vectors.
   * @param a - The first vector
   * @param b - The second vector
   * @returns The distance of two vectors
   */
  static distance(a: Vector4, b: Vector4): number {
    const x = b._x - a._x;
    const y = b._y - a._y;
    const z = b._z - a._z;
    const w = b._w - a._w;
    return Math.sqrt(x * x + y * y + z * z + w * w);
  }

  /**
   * Determines the squared distance of two vectors.
   * @param a - The first vector
   * @param b - The second vector
   * @returns The squared distance of two vectors
   */
  static distanceSquared(a: Vector4, b: Vector4): number {
    const x = b._x - a._x;
    const y = b._y - a._y;
    const z = b._z - a._z;
    const w = b._w - a._w;
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
      MathUtil.equals(left._x, right._x) &&
      MathUtil.equals(left._y, right._y) &&
      MathUtil.equals(left._z, right._z) &&
      MathUtil.equals(left._w, right._w)
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
    const { _x, _y, _z, _w } = start;
    out._x = _x + (end._x - _x) * t;
    out._y = _y + (end._y - _y) * t;
    out._z = _z + (end._z - _z) * t;
    out._w = _w + (end._w - _w) * t;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a vector containing the largest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the largest components of the specified vectors
   */
  static max(left: Vector4, right: Vector4, out: Vector4): void {
    out._x = Math.max(left._x, right._x);
    out._y = Math.max(left._y, right._y);
    out._z = Math.max(left._z, right._z);
    out._w = Math.max(left._w, right._w);
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a vector containing the smallest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the smallest components of the specified vectors
   */
  static min(left: Vector4, right: Vector4, out: Vector4): void {
    out._x = Math.min(left._x, right._x);
    out._y = Math.min(left._y, right._y);
    out._z = Math.min(left._z, right._z);
    out._w = Math.min(left._w, right._w);
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Reverses the direction of a given vector.
   * @param a - The vector to negate
   * @param out - The vector facing in the opposite direction
   */
  static negate(a: Vector4, out: Vector4): void {
    out._x = -a._x;
    out._y = -a._y;
    out._z = -a._z;
    out._w = -a._w;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Converts the vector into a unit vector.
   * @param a - The vector to normalize
   * @param out - The normalized vector
   */
  static normalize(a: Vector4, out: Vector4): void {
    const { _x, _y, _z, _w } = a;
    let len = Math.sqrt(_x * _x + _y * _y + _z * _z + _w * _w);
    if (len > MathUtil.zeroTolerance) {
      len = 1 / len;
      out._x = _x * len;
      out._y = _y * len;
      out._z = _z * len;
      out._w = _w * len;
      out._onValueChanged && out._onValueChanged();
    }
  }

  /**
   * Scale a vector by the given value.
   * @param a - The vector to scale
   * @param s - The amount by which to scale the vector
   * @param out - The scaled vector
   */
  static scale(a: Vector4, s: number, out: Vector4): void {
    out._x = a._x * s;
    out._y = a._y * s;
    out._z = a._z * s;
    out._w = a._w * s;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Performs a transformation using the given 4x4 matrix.
   * @param v - The vector to transform
   * @param m - The transform matrix
   * @param out - The transformed vector3
   */
  static transform(v: Vector4, m: Matrix, out: Vector4): void {
    const { _x, _y, _z, _w } = v;
    const e = m.elements;
    out._x = _x * e[0] + _y * e[4] + _z * e[8] + _w * e[12];
    out._y = _x * e[1] + _y * e[5] + _z * e[9] + _w * e[13];
    out._z = _x * e[2] + _y * e[6] + _z * e[10] + _w * e[14];
    out._w = _x * e[3] + _y * e[7] + _z * e[11] + _w * e[15];
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Performs a transformation using the given quaternion.
   * @param v - The vector to transform
   * @param q - The transform quaternion
   * @param out - The transformed vector
   */
  static transformByQuat(v: Vector4, q: Quaternion, out: Vector4): void {
    const { _x: x, _y: y, _z: z, _w: w } = v;
    const qx = q._x;
    const qy = q._y;
    const qz = q._z;
    const qw = q._w;

    // calculate quat * vec
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat
    out._x = ix * qw - iw * qx - iy * qz + iz * qy;
    out._y = iy * qw - iw * qy - iz * qx + ix * qz;
    out._z = iz * qw - iw * qz - ix * qy + iy * qx;
    out._w = w;
    out._onValueChanged && out._onValueChanged();
  }

  /** @internal */
  _x: number;
  /** @internal */
  _y: number;
  /** @internal */
  _z: number;
  /** @internal */
  _w: number;
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
   * The z component of the vector.
   */
  public get z(): number {
    return this._z;
  }

  public set z(value: number) {
    this._z = value;
    this._onValueChanged?.();
  }

  /**
   * The w component of the vector.
   */
  public get w(): number {
    return this._w;
  }

  public set w(value: number) {
    this._w = value;
    this._onValueChanged?.();
  }

  /**
   * Constructor of Vector4.
   * @param x - The x component of the vector, default 0
   * @param y - The y component of the vector, default 0
   * @param z - The z component of the vector, default 0
   * @param w - The w component of the vector, default 0
   */
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 0) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
  }

  /**
   * Set the value of this vector.
   * @param x - The x component of the vector
   * @param y - The y component of the vector
   * @param z - The z component of the vector
   * @param w - The w component of the vector
   * @returns This vector
   */
  set(x: number, y: number, z: number, w: number): Vector4 {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the sum of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  add(right: Vector4): Vector4 {
    this._x += right._x;
    this._y += right._y;
    this._z += right._z;
    this._w += right._w;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the difference of this vector and the specified vector.
   * @param right - the specified vector
   * @returns This vector
   */
  subtract(right: Vector4): Vector4 {
    this._x -= right._x;
    this._y -= right._y;
    this._z -= right._z;
    this._w -= right._w;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the product of this vector and the specified vector.
   * @param right - the specified vector
   * @returns This vector
   */
  multiply(right: Vector4): Vector4 {
    this._x *= right._x;
    this._y *= right._y;
    this._z *= right._z;
    this._w *= right._w;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the divisor of this vector and the specified vector.
   * @param right - the specified vector
   * @returns This vector
   */
  divide(right: Vector4): Vector4 {
    this._x /= right._x;
    this._y /= right._y;
    this._z /= right._z;
    this._w /= right._w;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Calculate the length of this vector.
   * @returns The length of this vector
   */
  length(): number {
    const { _x, _y, _z, _w } = this;
    return Math.sqrt(_x * _x + _y * _y + _z * _z + _w * _w);
  }

  /**
   * Calculate the squared length of this vector.
   * @returns The squared length of this vector
   */
  lengthSquared(): number {
    const { _x, _y, _z, _w } = this;
    return _x * _x + _y * _y + _z * _z + _w * _w;
  }

  /**
   * Reverses the direction of this vector.
   * @returns This vector
   */
  negate(): Vector4 {
    this._x = -this._x;
    this._y = -this._y;
    this._z = -this._z;
    this._w = -this._w;
    this._onValueChanged?.();
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
    this._x *= s;
    this._y *= s;
    this._z *= s;
    this._w *= s;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Creates a clone of this vector.
   * @returns A clone of this vector
   */
  clone(): Vector4 {
    let ret = new Vector4(this._x, this._y, this._z, this._w);
    return ret;
  }

  /**
   * Copy from vector3 like object.
   * @param source - Vector3 like object.
   * @returns This vector
   */
  copyFrom(source: Vector4Like): Vector4 {
    this._x = source.x;
    this._y = source.y;
    this._z = source.z;
    this._w = source.w;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Copy to vector4 like object.
   * @param target - Vector4 like object
   * @returns This Vector4 like object
   */
  copyTo(target: Vector4Like): Vector4Like {
    target.x = this._x;
    target.y = this._y;
    target.z = this._z;
    target.w = this._w;
    return target;
  }

  /**
   * Copy the value of this vector by an array.
   * @param array - The array
   * @param offset - The start offset of the array
   * @returns This vector
   */
  copyFromArray(array: ArrayLike<number>, offset: number = 0): Vector4 {
    this._x = array[offset];
    this._y = array[offset + 1];
    this._z = array[offset + 2];
    this._w = array[offset + 3];
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
    out[outOffset + 2] = this._z;
    out[outOffset + 3] = this._w;
  }

  /**
   * Serialize this vector to a JSON representation.
   * @returns A JSON representation of this vector
   */
  toJSON(): Vector4Like {
    return {
      x: this._x,
      y: this._y,
      z: this._z,
      w: this._w
    };
  }
}

interface Vector4Like {
  /** {@inheritDoc Vector4.x} */
  x: number;
  /** {@inheritDoc Vector4.y} */
  y: number;
  /** {@inheritDoc Vector4.z} */
  z: number;
  /** {@inheritDoc Vector4.w} */
  w: number;
}
