import { IClone } from "@oasis-engine/design";
import { MathUtil } from "./MathUtil";
import { Matrix } from "./Matrix";
import { Quaternion } from "./Quaternion";
import { Vector4 } from "./Vector4";

/**
 * Describes a 3D-vector.
 */
export class Vector3 implements IClone {
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
    out.x = left.x + right.x;
    out.y = left.y + right.y;
    out.z = left.z + right.z;
  }

  /**
   * Determines the difference between two vectors.
   * @param left - The first vector to subtract
   * @param right - The second vector to subtract
   * @param out - The difference between two vectors
   */
  static subtract(left: Vector3, right: Vector3, out: Vector3): void {
    out.x = left.x - right.x;
    out.y = left.y - right.y;
    out.z = left.z - right.z;
  }

  /**
   * Determines the product of two vectors.
   * @param left - The first vector to multiply
   * @param right - The second vector to multiply
   * @param out - The product of two vectors
   */
  static multiply(left: Vector3, right: Vector3, out: Vector3): void {
    out.x = left.x * right.x;
    out.y = left.y * right.y;
    out.z = left.z * right.z;
  }

  /**
   * Determines the divisor of two vectors.
   * @param left - The first vector to divide
   * @param right - The second vector to divide
   * @param out - The divisor of two vectors
   */
  static divide(left: Vector3, right: Vector3, out: Vector3): void {
    out.x = left.x / right.x;
    out.y = left.y / right.y;
    out.z = left.z / right.z;
  }

  /**
   * Determines the dot product of two vectors.
   * @param left - The first vector to dot
   * @param right - The second vector to dot
   * @returns The dot product of two vectors
   */
  static dot(left: Vector3, right: Vector3): number {
    return left.x * right.x + left.y * right.y + left.z * right.z;
  }

  /**
   * Determines the cross product of two vectors.
   * @param left - The first vector to cross
   * @param right - The second vector to cross
   * @param out - The cross product of two vectors
   */
  static cross(left: Vector3, right: Vector3, out: Vector3): void {
    const ax = left.x;
    const ay = left.y;
    const az = left.z;
    const bx = right.x;
    const by = right.y;
    const bz = right.z;

    out.x = ay * bz - az * by;
    out.y = az * bx - ax * bz;
    out.z = ax * by - ay * bx;
  }

  /**
   * Determines the distance of two vectors.
   * @param a - The first vector
   * @param b - The second vector
   * @returns The distance of two vectors
   */
  static distance(a: Vector3, b: Vector3): number {
    const x = b.x - a.x;
    const y = b.y - a.y;
    const z = b.z - a.z;
    return Math.sqrt(x * x + y * y + z * z);
  }

  /**
   * Determines the squared distance of two vectors.
   * @param a - The first vector
   * @param b - The second vector
   * @returns The squared distance of two vectors
   */
  static distanceSquared(a: Vector3, b: Vector3): number {
    const x = b.x - a.x;
    const y = b.y - a.y;
    const z = b.z - a.z;
    return x * x + y * y + z * z;
  }

  /**
   * Determines whether the specified vectors are equals.
   * @param left - The first vector to compare
   * @param right - The second vector to compare
   * @returns True if the specified vectors are equals, false otherwise
   */
  static equals(left: Vector3, right: Vector3): boolean {
    return MathUtil.equals(left.x, right.x) && MathUtil.equals(left.y, right.y) && MathUtil.equals(left.z, right.z);
  }

  /**
   * Performs a linear interpolation between two vectors.
   * @param start - The first vector
   * @param end - The second vector
   * @param t - The blend amount where 0 returns start and 1 end
   * @param out - The result of linear blending between two vectors
   */
  static lerp(start: Vector3, end: Vector3, t: number, out: Vector3): void {
    const { x, y, z } = start;
    out.x = x + (end.x - x) * t;
    out.y = y + (end.y - y) * t;
    out.z = z + (end.z - z) * t;
  }

  /**
   * Calculate a vector containing the largest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the largest components of the specified vectors
   */
  static max(left: Vector3, right: Vector3, out: Vector3): void {
    out.x = Math.max(left.x, right.x);
    out.y = Math.max(left.y, right.y);
    out.z = Math.max(left.z, right.z);
  }

  /**
   * Calculate a vector containing the smallest components of the specified vectors.
   * @param left - The first vector
   * @param right - The second vector
   * @param out - The vector containing the smallest components of the specified vectors
   */
  static min(left: Vector3, right: Vector3, out: Vector3): void {
    out.x = Math.min(left.x, right.x);
    out.y = Math.min(left.y, right.y);
    out.z = Math.min(left.z, right.z);
  }

  /**
   * Reverses the direction of a given vector.
   * @param a - The vector to negate
   * @param out - The vector facing in the opposite direction
   */
  static negate(a: Vector3, out: Vector3): void {
    out.x = -a.x;
    out.y = -a.y;
    out.z = -a.z;
  }

  /**
   * Converts the vector into a unit vector.
   * @param a - The vector to normalize
   * @param out - The normalized vector
   */
  static normalize(a: Vector3, out: Vector3): void {
    const { x, y, z } = a;
    let len: number = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      // TODO
      len = 1 / len;
      out.x = x * len;
      out.y = y * len;
      out.z = z * len;
    }
  }

  /**
   * Scale a vector by the given value.
   * @param a - The vector to scale
   * @param s - The amount by which to scale the vector
   * @param out - The scaled vector
   */
  static scale(a: Vector3, s: number, out: Vector3): void {
    out.x = a.x * s;
    out.y = a.y * s;
    out.z = a.z * s;
  }

  /**
   * Performs a normal transformation using the given 4x4 matrix.
   * @remarks
   * A normal transform performs the transformation with the assumption that the w component
   * is zero. This causes the fourth row and fourth collumn of the matrix to be unused. The
   * end result is a vector that is not translated, but all other transformation properties
   * apply. This is often prefered for normal vectors as normals purely represent direction
   * rather than location because normal vectors should not be translated.
   * @param v - The normal vector to transform
   * @param m - The transform matrix
   * @param out - The transformed normal
   */
  static transformNormal(v: Vector3, m: Matrix, out: Vector3): void {
    const { x, y, z } = v;
    const e = m.elements;
    out.x = x * e[0] + y * e[4] + z * e[8];
    out.y = x * e[1] + y * e[5] + z * e[9];
    out.z = x * e[2] + y * e[6] + z * e[10];
  }

  /**
   * Performs a transformation using the given 4x4 matrix.
   * @param v - The vector to transform
   * @param m - The transform matrix
   * @param out - The transformed vector3
   */
  static transformToVec3(v: Vector3, m: Matrix, out: Vector3): void {
    const { x, y, z } = v;
    const e = m.elements;

    out.x = x * e[0] + y * e[4] + z * e[8] + e[12];
    out.y = x * e[1] + y * e[5] + z * e[9] + e[13];
    out.z = x * e[2] + y * e[6] + z * e[10] + e[14];
  }

  /**
   * Performs a transformation from vector3 to vector4 using the given 4x4 matrix.
   * @param v - The vector to transform
   * @param m - The transform matrix
   * @param out - The transformed vector4
   */
  static transformToVec4(v: Vector3, m: Matrix, out: Vector4): void {
    const { x, y, z } = v;
    const e = m.elements;

    out.x = x * e[0] + y * e[4] + z * e[8] + e[12];
    out.y = x * e[1] + y * e[5] + z * e[9] + e[13];
    out.z = x * e[2] + y * e[6] + z * e[10] + e[14];
    out.w = x * e[3] + y * e[7] + z * e[11] + e[15];
  }

  /**
   * Performs a coordinate transformation using the given 4x4 matrix.
   *
   * @remarks
   * A coordinate transform performs the transformation with the assumption that the w component
   * is one. The four dimensional vector obtained from the transformation operation has each
   * component in the vector divided by the w component. This forces the wcomponent to be one and
   * therefore makes the vector homogeneous. The homogeneous vector is often prefered when working
   * with coordinates as the w component can safely be ignored.
   * @param v - The coordinate vector to transform
   * @param m - The transform matrix
   * @param out - The transformed coordinates
   */
  static transformCoordinate(v: Vector3, m: Matrix, out: Vector3): void {
    const { x, y, z } = v;
    const e = m.elements;
    let w = x * e[3] + y * e[7] + z * e[11] + e[15];
    w = 1.0 / w;

    out.x = (x * e[0] + y * e[4] + z * e[8] + e[12]) * w;
    out.y = (x * e[1] + y * e[5] + z * e[9] + e[13]) * w;
    out.z = (x * e[2] + y * e[6] + z * e[10] + e[14]) * w;
  }

  /**
   * Performs a transformation using the given quaternion.
   * @param v - The vector to transform
   * @param quaternion - The transform quaternion
   * @param out - The transformed vector
   */
  static transformByQuat(v: Vector3, quaternion: Quaternion, out: Vector3): void {
    const { x, y, z } = v;
    const { x: qx, y: qy, z: qz, w: qw } = quaternion;

    // calculate quat * vec
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat
    out.x = ix * qw - iw * qx - iy * qz + iz * qy;
    out.y = iy * qw - iw * qy - iz * qx + ix * qz;
    out.z = iz * qw - iw * qz - ix * qy + iy * qx;
  }

  /** The x component of the vector.*/
  x: number;
  /** The y component of the vector.*/
  y: number;
  /** The z component of the vector.*/
  z: number;

  /**
   * Constructor of Vector3.
   * @param x - The x component of the vector, default 0
   * @param y - The y component of the vector, default 0
   * @param z - The z component of the vector, default 0
   */
  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * Set the value of this vector.
   * @param x - The x component of the vector
   * @param y - The y component of the vector
   * @param z - The z component of the vector
   * @returns This vector
   */
  setValue(x: number, y: number, z: number): Vector3 {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  /**
   * Set the value of this vector by an array.
   * @param array - The array
   * @param offset - The start offset of the array
   * @returns This vector
   */
  setValueByArray(array: ArrayLike<number>, offset: number = 0): Vector3 {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    return this;
  }

  /**
   * Determines the sum of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  add(right: Vector3): Vector3 {
    this.x += right.x;
    this.y += right.y;
    this.z += right.z;
    return this;
  }

  /**
   * Determines the difference of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  subtract(right: Vector3): Vector3 {
    this.x -= right.x;
    this.y -= right.y;
    this.z -= right.z;
    return this;
  }

  /**
   * Determines the product of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  multiply(right: Vector3): Vector3 {
    this.x *= right.x;
    this.y *= right.y;
    this.z *= right.z;
    return this;
  }

  /**
   * Determines the divisor of this vector and the specified vector.
   * @param right - The specified vector
   * @returns This vector
   */
  divide(right: Vector3): Vector3 {
    this.x /= right.x;
    this.y /= right.y;
    this.z /= right.z;
    return this;
  }

  /**
   * Calculate the length of this vector.
   * @returns The length of this vector
   */
  length(): number {
    const { x, y, z } = this;
    return Math.sqrt(x * x + y * y + z * z);
  }

  /**
   * Calculate the squared length of this vector.
   * @returns The squared length of this vector
   */
  lengthSquared(): number {
    const { x, y, z } = this;
    return x * x + y * y + z * z;
  }

  /**
   * Reverses the direction of this vector.
   * @returns This vector
   */
  negate(): Vector3 {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
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
    this.x *= s;
    this.y *= s;
    this.z *= s;
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
  }

  /**
   * Creates a clone of this vector.
   * @returns A clone of this vector
   */
  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  /**
   * Clones this vector to the specified vector.
   * @param out - The specified vector
   * @returns The specified vector
   */
  cloneTo(out: Vector3): Vector3 {
    out.x = this.x;
    out.y = this.y;
    out.z = this.z;
    return out;
  }

  /**
   * This vector performs a normal transformation using the given 4x4 matrix.
   * @remarks
   * A normal transform performs the transformation with the assumption that the w component
   * is zero. This causes the fourth row and fourth collumn of the matrix to be unused. The
   * end result is a vector that is not translated, but all other transformation properties
   * apply. This is often prefered for normal vectors as normals purely represent direction
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
   * component in the vector divided by the w component. This forces the wcomponent to be one and
   * therefore makes the vector homogeneous. The homogeneous vector is often prefered when working
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
   * @param out - This vector
   */
  transformByQuat(quaternion: Quaternion): Vector3 {
    Vector3.transformByQuat(this, quaternion, this);
    return this;
  }
}
