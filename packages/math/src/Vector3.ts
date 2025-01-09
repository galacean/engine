import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { MathUtil } from "./MathUtil";
import { Matrix } from "./Matrix";
import { Quaternion } from "./Quaternion";
import { Vector4 } from "./Vector4";

/**
 * Describes a 3D-vector.
 */
export class Vector3 implements IClone<Vector3>, ICopy<Vector3Like, Vector3> {
  /** @internal */
  static readonly _zero = new Vector3(0.0, 0.0, 0.0);
  /** @internal */
  static readonly _one = new Vector3(1.0, 1.0, 1.0);

  /**
   * Determines the sum of two vectors.
   * @param left - The first vector to add
   * @param right - The second vector to add
   * @param out - The sum of two vectors
   */
  static add(left: Vector3, right: Vector3, out: Vector3): void {
    out._x = left._x + right._x;
    out._y = left._y + right._y;
    out._z = left._z + right._z;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the difference between two vectors.
   * @param left - The first vector to subtract
   * @param right - The second vector to subtract
   * @param out - The difference between two vectors
   */
  static subtract(left: Vector3, right: Vector3, out: Vector3): void {
    out._x = left._x - right._x;
    out._y = left._y - right._y;
    out._z = left._z - right._z;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the product of two vectors.
   * @param left - The first vector to multiply
   * @param right - The second vector to multiply
   * @param out - The product of two vectors
   */
  static multiply(left: Vector3, right: Vector3, out: Vector3): void {
    out._x = left._x * right._x;
    out._y = left._y * right._y;
    out._z = left._z * right._z;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the divisor of two vectors.
   * @param left - The first vector to divide
   * @param right - The second vector to divide
   * @param out - The divisor of two vectors
   */
  static divide(left: Vector3, right: Vector3, out: Vector3): void {
    out._x = left._x / right._x;
    out._y = left._y / right._y;
    out._z = left._z / right._z;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the dot product of two vectors.
   * @param left - The first vector to dot
   * @param right - The second vector to dot
   * @returns The dot product of two vectors
   */
  static dot(left: Vector3, right: Vector3): number {
    return left._x * right._x + left._y * right._y + left._z * right._z;
  }

  /**
   * Determines the cross product of two vectors.
   * @param left - The first vector to cross
   * @param right - The second vector to cross
   * @param out - The cross product of two vectors
   */
  static cross(left: Vector3, right: Vector3, out: Vector3): void {
    const ax = left._x;
    const ay = left._y;
    const az = left._z;
    const bx = right._x;
    const by = right._y;
    const bz = right._z;

    out.set(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  }

  /**
   * Determines the distance of two vectors.
   * @param a - The first vector
   * @param b - The second vector
   * @returns The distance of two vectors
   */
  static distance(a: Vector3, b: Vector3): number {
    const x = b._x - a._x;
    const y = b._y - a._y;
    const z = b._z - a._z;
    return Math.sqrt(x * x + y * y + z * z);
  }

  /**
   * Determines the squared distance of two vectors.
   * @param a - The first vector
   * @param b - The second vector
   * @returns The squared distance of two vectors
   */
  static distanceSquared(a: Vector3, b: Vector3): number {
    const x = b._x - a._x;
    const y = b._y - a._y;
    const z = b._z - a._z;
    return x * x + y * y + z * z;
  }

  /**
   * Determines whether the specified vectors are equals.
   * @param left - The first vector to compare
   * @param right - The second vector to compare
   * @returns True if the specified vectors are equals, false otherwise
   */
  static equals(left: Vector3, right: Vector3): boolean {
    return (
      MathUtil.equals(left._x, right._x) && MathUtil.equals(left._y, right._y) && MathUtil.equals(left._z, right._z)
    );
  }

  /**
   * Performs a linear interpolation between two vectors.
   * @param start - The first vector
   * @param end - The second vector
   * @param t - The blend amount where 0 returns start and 1 end
   * @param out - The result of linear blending between two vectors
   */
  static lerp(start: Vector3, end: Vector3, t: number, out: Vector3): void {
    const { _x, _y, _z } = start;
    out._x = _x + (end._x - _x) * t;
    out._y = _y + (end._y - _y) * t;
    out._z = _z + (end._z - _z) * t;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a vector containing the largest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the largest components of the specified vectors
   */
  static max(left: Vector3, right: Vector3, out: Vector3): void {
    out._x = Math.max(left._x, right._x);
    out._y = Math.max(left._y, right._y);
    out._z = Math.max(left._z, right._z);
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a vector containing the smallest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the smallest components of the specified vectors
   */
  static min(left: Vector3, right: Vector3, out: Vector3): void {
    out._x = Math.min(left._x, right._x);
    out._y = Math.min(left._y, right._y);
    out._z = Math.min(left._z, right._z);
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Reverses the direction of a given vector.
   * @param a - The vector to negate
   * @param out - The vector facing in the opposite direction
   */
  static negate(a: Vector3, out: Vector3): void {
    out._x = -a._x;
    out._y = -a._y;
    out._z = -a._z;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Converts the vector into a unit vector.
   * @param a - The vector to normalize
   * @param out - The normalized vector
   */
  static normalize(a: Vector3, out: Vector3): void {
    const { _x, _y, _z } = a;
    let len = Math.sqrt(_x * _x + _y * _y + _z * _z);
    if (len > MathUtil.zeroTolerance) {
      len = 1 / len;
      out.set(_x * len, _y * len, _z * len);
    }
  }

  /**
   * Scale a vector by the given value.
   * @param a - The vector to scale
   * @param s - The amount by which to scale the vector
   * @param out - The scaled vector
   */
  static scale(a: Vector3, s: number, out: Vector3): void {
    out._x = a._x * s;
    out._y = a._y * s;
    out._z = a._z * s;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Performs a normal transformation using the given 4x4 matrix.
   * @remarks
   * A normal transform performs the transformation with the assumption that the w component
   * is zero. This causes the fourth row and fourth column of the matrix to be unused. The
   * end result is a vector that is not translated, but all other transformation properties
   * apply. This is often preferred for normal vectors as normals purely represent direction
   * rather than location because normal vectors should not be translated.
   * @param v - The normal vector to transform
   * @param m - The transform matrix
   * @param out - The transformed normal
   */
  static transformNormal(v: Vector3, m: Matrix, out: Vector3): void {
    const { _x, _y, _z } = v;
    const e = m.elements;
    out._x = _x * e[0] + _y * e[4] + _z * e[8];
    out._y = _x * e[1] + _y * e[5] + _z * e[9];
    out._z = _x * e[2] + _y * e[6] + _z * e[10];
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Performs a transformation using the given 4x4 matrix.
   * @param v - The vector to transform
   * @param m - The transform matrix
   * @param out - The transformed vector3
   */
  static transformToVec3(v: Vector3, m: Matrix, out: Vector3): void {
    const { _x, _y, _z } = v;
    const e = m.elements;

    out._x = _x * e[0] + _y * e[4] + _z * e[8] + e[12];
    out._y = _x * e[1] + _y * e[5] + _z * e[9] + e[13];
    out._z = _x * e[2] + _y * e[6] + _z * e[10] + e[14];
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Performs a transformation from vector3 to vector4 using the given 4x4 matrix.
   * @param v - The vector to transform
   * @param m - The transform matrix
   * @param out - The transformed vector4
   */
  static transformToVec4(v: Vector3, m: Matrix, out: Vector4): void {
    const { _x, _y, _z } = v;
    const e = m.elements;
    out._x = _x * e[0] + _y * e[4] + _z * e[8] + e[12];
    out._y = _x * e[1] + _y * e[5] + _z * e[9] + e[13];
    out._z = _x * e[2] + _y * e[6] + _z * e[10] + e[14];
    out._w = _x * e[3] + _y * e[7] + _z * e[11] + e[15];
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Performs a coordinate transformation using the given 4x4 matrix.
   *
   * @remarks
   * A coordinate transform performs the transformation with the assumption that the w component
   * is one. The four dimensional vector obtained from the transformation operation has each
   * component in the vector divided by the w component. This forces the w-component to be one and
   * therefore makes the vector homogeneous. The homogeneous vector is often preferred when working
   * with coordinates as the w component can safely be ignored.
   * @param v - The coordinate vector to transform
   * @param m - The transform matrix
   * @param out - The transformed coordinates
   */
  static transformCoordinate(v: Vector3, m: Matrix, out: Vector3): void {
    const { _x, _y, _z } = v;
    const e = m.elements;
    let w = _x * e[3] + _y * e[7] + _z * e[11] + e[15];
    w = 1.0 / w;

    out._x = (_x * e[0] + _y * e[4] + _z * e[8] + e[12]) * w;
    out._y = (_x * e[1] + _y * e[5] + _z * e[9] + e[13]) * w;
    out._z = (_x * e[2] + _y * e[6] + _z * e[10] + e[14]) * w;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Performs a transformation using the given quaternion.
   * @param v - The vector to transform
   * @param quaternion - The transform quaternion
   * @param out - The transformed vector
   */
  static transformByQuat(v: Vector3, quaternion: Quaternion, out: Vector3): void {
    const { _x, _y, _z } = v;
    const { _x: qx, _y: qy, _z: qz, _w: qw } = quaternion;

    // calculate quat * vec
    const ix = qw * _x + qy * _z - qz * _y;
    const iy = qw * _y + qz * _x - qx * _z;
    const iz = qw * _z + qx * _y - qy * _x;
    const iw = -qx * _x - qy * _y - qz * _z;

    // calculate result * inverse quat
    out._x = ix * qw - iw * qx - iy * qz + iz * qy;
    out._y = iy * qw - iw * qy - iz * qx + ix * qz;
    out._z = iz * qw - iw * qz - ix * qy + iy * qx;
    out._onValueChanged && out._onValueChanged();
  }

  /** @internal */
  _x: number;
  /** @internal */
  _y: number;
  /** @internal */
  _z: number;
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
   * Constructor of Vector3.
   * @param x - The x component of the vector, default 0
   * @param y - The y component of the vector, default 0
   * @param z - The z component of the vector, default 0
   */
  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this._x = x;
    this._y = y;
    this._z = z;
  }

  /**
   * Set the value of this vector.
   * @param x - The x component of the vector
   * @param y - The y component of the vector
   * @param z - The z component of the vector
   * @returns This vector
   */
  set(x: number, y: number, z: number): Vector3 {
    this._x = x;
    this._y = y;
    this._z = z;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the sum of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  add(right: Vector3): Vector3 {
    this._x += right._x;
    this._y += right._y;
    this._z += right._z;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the difference of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  subtract(right: Vector3): Vector3 {
    this._x -= right._x;
    this._y -= right._y;
    this._z -= right._z;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the product of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  multiply(right: Vector3): Vector3 {
    this._x *= right._x;
    this._y *= right._y;
    this._z *= right._z;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Determines the divisor of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  divide(right: Vector3): Vector3 {
    this._x /= right._x;
    this._y /= right._y;
    this._z /= right._z;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Calculate the length of this vector.
   * @returns The length of this vector
   */
  length(): number {
    const { _x, _y, _z } = this;
    return Math.sqrt(_x * _x + _y * _y + _z * _z);
  }

  /**
   * Calculate the squared length of this vector.
   * @returns The squared length of this vector
   */
  lengthSquared(): number {
    const { _x, _y, _z } = this;
    return _x * _x + _y * _y + _z * _z;
  }

  /**
   * Reverses the direction of this vector.
   * @returns This vector
   */
  negate(): Vector3 {
    this._x = -this._x;
    this._y = -this._y;
    this._z = -this._z;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Converts this vector into a unit vector.
   * @returns This vector
   */
  normalize(): Vector3 {
    Vector3.normalize(this, this);
    return this;
  }

  /**
   * Scale this vector by the given value.
   * @param s - The amount by which to scale the vector
   * @returns This vector
   */
  scale(s: number): Vector3 {
    this._x *= s;
    this._y *= s;
    this._z *= s;
    this._onValueChanged?.();
    return this;
  }

  /**
   * This vector performs a normal transformation using the given 4x4 matrix.
   * @remarks
   * A normal transform performs the transformation with the assumption that the w component
   * is zero. This causes the fourth row and fourth column of the matrix to be unused. The
   * end result is a vector that is not translated, but all other transformation properties
   * apply. This is often preferred for normal vectors as normals purely represent direction
   * rather than location because normal vectors should not be translated.
   * @param m - The transform matrix
   * @returns This vector
   */
  transformNormal(m: Matrix): Vector3 {
    Vector3.transformNormal(this, m, this);
    return this;
  }

  /**
   * This vector performs a transformation using the given 4x4 matrix.
   * @param m - The transform matrix
   * @returns This vector
   */
  transformToVec3(m: Matrix): Vector3 {
    Vector3.transformToVec3(this, m, this);
    return this;
  }

  /**
   * This vector performs a coordinate transformation using the given 4x4 matrix.
   * @remarks
   * A coordinate transform performs the transformation with the assumption that the w component
   * is one. The four dimensional vector obtained from the transformation operation has each
   * component in the vector divided by the w component. This forces the w-component to be one and
   * therefore makes the vector homogeneous. The homogeneous vector is often preferred when working
   * with coordinates as the w component can safely be ignored.
   * @param m - The transform matrix
   * @returns This vector
   */
  transformCoordinate(m: Matrix): Vector3 {
    Vector3.transformCoordinate(this, m, this);
    return this;
  }

  /**
   * This vector performs a transformation using the given quaternion.
   * @param quaternion - The transform quaternion
   * @returns This vector
   */
  transformByQuat(quaternion: Quaternion): Vector3 {
    Vector3.transformByQuat(this, quaternion, this);
    return this;
  }

  /**
   * Creates a clone of this vector.
   * @returns A clone of this vector
   */
  clone(): Vector3 {
    return new Vector3(this._x, this._y, this._z);
  }

  /**
   * Copy from vector3 like object.
   * @param source - Vector3 like object.
   * @returns This vector
   */
  copyFrom(source: Vector3Like): Vector3 {
    this._x = source.x;
    this._y = source.y;
    this._z = source.z;
    this._onValueChanged?.();
    return this;
  }

  /**
   * Copy to vector3 like object.
   * @param target - Vector3 like object
   * @returns This Vector3 like object
   */
  copyTo(target: Vector3Like): Vector3Like {
    target.x = this._x;
    target.y = this._y;
    target.z = this._z;
    return target;
  }

  /**
   * Copy the value of this vector from an array.
   * @param array - The array
   * @param offset - The start offset of the array
   * @returns This vector
   */
  copyFromArray(array: ArrayLike<number>, offset: number = 0): Vector3 {
    this._x = array[offset];
    this._y = array[offset + 1];
    this._z = array[offset + 2];
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
  }

  /**
   * Serialize this vector to a JSON representation.
   * @returns A JSON representation of this vector
   */
  toJSON(): Vector3Like {
    return {
      x: this._x,
      y: this._y,
      z: this._z
    };
  }
}

interface Vector3Like {
  /** {@inheritDoc Vector3.x} */
  x: number;
  /** {@inheritDoc Vector3.y} */
  y: number;
  /** {@inheritDoc Vector3.z} */
  z: number;
}
