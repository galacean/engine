import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { MathUtil } from "./MathUtil";
import { Matrix3x3 } from "./Matrix3x3";
import { Vector3 } from "./Vector3";

/**
 * Represents a four dimensional mathematical quaternion.
 */
export class Quaternion implements IClone<Quaternion>, ICopy<QuaternionLike, Quaternion> {
  /** @internal */
  static readonly _tempVector3 = new Vector3();
  /** @internal */
  static readonly _tempQuat1 = new Quaternion();

  /**
   * Determines the sum of two quaternions.
   * @param left - The first quaternion to add
   * @param right - The second quaternion to add
   * @param out - The sum of two quaternions
   */
  static add(left: Quaternion, right: Quaternion, out: Quaternion): void {
    out._x = left._x + right._x;
    out._y = left._y + right._y;
    out._z = left._z + right._z;
    out._w = left._w + right._w;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the product of two quaternions.
   * @param left - The first quaternion to multiply
   * @param right - The second quaternion to multiply
   * @param out - The product of two quaternions
   */
  static multiply(left: Quaternion, right: Quaternion, out: Quaternion): void {
    const ax = left._x,
      ay = left._y,
      az = left._z,
      aw = left._w;
    const bx = right._x,
      by = right._y,
      bz = right._z,
      bw = right._w;

    out._x = ax * bw + aw * bx + ay * bz - az * by;
    out._y = ay * bw + aw * by + az * bx - ax * bz;
    out._z = az * bw + aw * bz + ax * by - ay * bx;
    out._w = aw * bw - ax * bx - ay * by - az * bz;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate quaternion that contains conjugated version of the specified quaternion.
   * @param a - The specified quaternion
   * @param out - The conjugate version of the specified quaternion
   */
  static conjugate(a: Quaternion, out: Quaternion): void {
    out._x = -a._x;
    out._y = -a._y;
    out._z = -a._z;
    out._w = a._w;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Determines the dot product of two quaternions.
   * @param left - The first quaternion to dot
   * @param right - The second quaternion to dot
   * @returns The dot product of two quaternions
   */
  static dot(left: Quaternion, right: Quaternion): number {
    return left._x * right._x + left._y * right._y + left._z * right._z + left._w * right._w;
  }

  /**
   * Determines whether the specified quaternions are equals.
   * @param left - The first quaternion to compare
   * @param right - The second quaternion to compare
   * @returns True if the specified quaternions are equals, false otherwise
   */
  static equals(left: Quaternion, right: Quaternion): boolean {
    return (
      MathUtil.equals(left._x, right._x) &&
      MathUtil.equals(left._y, right._y) &&
      MathUtil.equals(left._z, right._z) &&
      MathUtil.equals(left._w, right._w)
    );
  }

  /**
   * Calculate a quaternion rotates around an arbitrary axis.
   * @param axis - The axis
   * @param rad - The rotation angle in radians
   * @param out - The quaternion after rotate
   */
  static rotationAxisAngle(axis: Vector3, rad: number, out: Quaternion): void {
    const normalAxis = Quaternion._tempVector3;
    Vector3.normalize(axis, normalAxis);
    rad *= 0.5;
    const s = Math.sin(rad);
    out._x = normalAxis._x * s;
    out._y = normalAxis._y * s;
    out._z = normalAxis._z * s;
    out._w = Math.cos(rad);
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a quaternion rotates around x, y, z axis (pitch/yaw/roll).
   * @param x - The radian of rotation around X (pitch)
   * @param y - The radian of rotation around Y (yaw)
   * @param z - The radian of rotation around Z (roll)
   * @param out - The calculated quaternion
   */
  static rotationEuler(x: number, y: number, z: number, out: Quaternion): void {
    Quaternion.rotationYawPitchRoll(y, x, z, out);
  }

  /**
   * Calculate a quaternion from the specified yaw, pitch and roll angles.
   * @param yaw - Yaw around the y axis in radians
   * @param pitch - Pitch around the x axis in radians
   * @param roll - Roll around the z axis in radians
   * @param out - The calculated quaternion
   */
  static rotationYawPitchRoll(yaw: number, pitch: number, roll: number, out: Quaternion): void {
    const halfRoll = roll * 0.5;
    const halfPitch = pitch * 0.5;
    const halfYaw = yaw * 0.5;

    const sinRoll = Math.sin(halfRoll);
    const cosRoll = Math.cos(halfRoll);
    const sinPitch = Math.sin(halfPitch);
    const cosPitch = Math.cos(halfPitch);
    const sinYaw = Math.sin(halfYaw);
    const cosYaw = Math.cos(halfYaw);

    const cosYawPitch = cosYaw * cosPitch;
    const sinYawPitch = sinYaw * sinPitch;

    out._x = cosYaw * sinPitch * cosRoll + sinYaw * cosPitch * sinRoll;
    out._y = sinYaw * cosPitch * cosRoll - cosYaw * sinPitch * sinRoll;
    out._z = cosYawPitch * sinRoll - sinYawPitch * cosRoll;
    out._w = cosYawPitch * cosRoll + sinYawPitch * sinRoll;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a quaternion from the specified 3x3 matrix.
   * @param m - The specified 3x3 matrix
   * @param out - The calculated quaternion
   */
  static rotationMatrix3x3(m: Matrix3x3, out: Quaternion): void {
    const me = m.elements;
    const m11 = me[0],
      m12 = me[1],
      m13 = me[2];
    const m21 = me[3],
      m22 = me[4],
      m23 = me[5];
    const m31 = me[6],
      m32 = me[7],
      m33 = me[8];
    const scale = m11 + m22 + m33;
    let sqrt, half;

    if (scale > 0) {
      sqrt = Math.sqrt(scale + 1.0);
      out._w = sqrt * 0.5;
      sqrt = 0.5 / sqrt;

      out._x = (m23 - m32) * sqrt;
      out._y = (m31 - m13) * sqrt;
      out._z = (m12 - m21) * sqrt;
    } else if (m11 >= m22 && m11 >= m33) {
      sqrt = Math.sqrt(1.0 + m11 - m22 - m33);
      half = 0.5 / sqrt;

      out._x = 0.5 * sqrt;
      out._y = (m12 + m21) * half;
      out._z = (m13 + m31) * half;
      out._w = (m23 - m32) * half;
    } else if (m22 > m33) {
      sqrt = Math.sqrt(1.0 + m22 - m11 - m33);
      half = 0.5 / sqrt;

      out._x = (m21 + m12) * half;
      out._y = 0.5 * sqrt;
      out._z = (m32 + m23) * half;
      out._w = (m31 - m13) * half;
    } else {
      sqrt = Math.sqrt(1.0 + m33 - m11 - m22);
      half = 0.5 / sqrt;

      out._x = (m13 + m31) * half;
      out._y = (m23 + m32) * half;
      out._z = 0.5 * sqrt;
      out._w = (m12 - m21) * half;
    }
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate the inverse of the specified quaternion.
   * @param a - The quaternion whose inverse is to be calculated
   * @param out - The inverse of the specified quaternion
   */
  static invert(a: Quaternion, out: Quaternion): void {
    const { _x: x, _y: y, _z: z, _w: w } = a;
    const dot = x * x + y * y + z * z + w * w;
    if (dot > MathUtil.zeroTolerance) {
      const invDot = 1.0 / dot;
      out._x = -x * invDot;
      out._y = -y * invDot;
      out._z = -z * invDot;
      out._w = w * invDot;
      out._onValueChanged && out._onValueChanged();
    }
  }

  /**
   * Performs a linear blend between two quaternions.
   * @param start - The first quaternion
   * @param end - The second quaternion
   * @param t - The blend amount where 0 returns start and 1 end
   * @param out - The result of linear blending between two quaternions
   */
  static lerp(start: Quaternion, end: Quaternion, t: number, out: Quaternion): void {
    const inv = 1.0 - t;
    if (Quaternion.dot(start, end) >= 0) {
      out._x = start._x * inv + end._x * t;
      out._y = start._y * inv + end._y * t;
      out._z = start._z * inv + end._z * t;
      out._w = start._w * inv + end._w * t;
    } else {
      out._x = start._x * inv - end._x * t;
      out._y = start._y * inv - end._y * t;
      out._z = start._z * inv - end._z * t;
      out._w = start._w * inv - end._w * t;
    }

    out.normalize();
  }

  /**
   * Performs a spherical linear blend between two quaternions.
   * @param start - The first quaternion
   * @param end - The second quaternion
   * @param amount - The blend amount where 0 returns start and 1 end
   * @param out - The result of spherical linear blending between two quaternions
   */
  static slerp(start: Quaternion, end: Quaternion, amount: number, out: Quaternion): void {
    let opposite: number;
    let inverse: number;
    const dot = Quaternion.dot(start, end);

    if (Math.abs(dot) > 1.0 - MathUtil.zeroTolerance) {
      inverse = 1.0 - amount;
      opposite = amount * Math.sign(dot);
    } else {
      const acos = Math.acos(Math.abs(dot));
      const invSin = 1.0 / Math.sin(acos);

      inverse = Math.sin((1.0 - amount) * acos) * invSin;
      opposite = Math.sin(amount * acos) * invSin * Math.sign(dot);
    }

    out.x = inverse * start.x + opposite * end.x;
    out.y = inverse * start.y + opposite * end.y;
    out.z = inverse * start.z + opposite * end.z;
    out.w = inverse * start.w + opposite * end.w;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Scales the specified quaternion magnitude to unit length.
   * @param a - The specified quaternion
   * @param out - The normalized quaternion
   */
  static normalize(a: Quaternion, out: Quaternion): void {
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
   * Calculate a quaternion rotate around X axis.
   * @param rad - The rotation angle in radians
   * @param out - The calculated quaternion
   */
  static rotationX(rad: number, out: Quaternion): void {
    rad *= 0.5;
    const s = Math.sin(rad);
    const c = Math.cos(rad);

    out._x = s;
    out._y = 0;
    out._z = 0;
    out._w = c;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a quaternion rotate around Y axis.
   * @param rad - The rotation angle in radians
   * @param out - The calculated quaternion
   */
  static rotationY(rad: number, out: Quaternion): void {
    rad *= 0.5;
    const s = Math.sin(rad);
    const c = Math.cos(rad);

    out._x = 0;
    out._y = s;
    out._z = 0;
    out._w = c;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a quaternion rotate around Z axis.
   * @param rad - The rotation angle in radians
   * @param out - The calculated quaternion
   */
  static rotationZ(rad: number, out: Quaternion): void {
    rad *= 0.5;
    const s = Math.sin(rad);
    const c = Math.cos(rad);

    out._x = 0;
    out._y = 0;
    out._z = s;
    out._w = c;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a quaternion that the specified quaternion rotate around X axis.
   * @param quaternion - The specified quaternion
   * @param rad - The rotation angle in radians
   * @param out - The calculated quaternion
   */
  static rotateX(quaternion: Quaternion, rad: number, out: Quaternion): void {
    const { _x, _y, _z, _w } = quaternion;
    rad *= 0.5;
    const bx = Math.sin(rad);
    const bw = Math.cos(rad);

    out._x = _x * bw + _w * bx;
    out._y = _y * bw + _z * bx;
    out._z = _z * bw - _y * bx;
    out._w = _w * bw - _x * bx;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a quaternion that the specified quaternion rotate around Y axis.
   * @param quaternion - The specified quaternion
   * @param rad - The rotation angle in radians
   * @param out - The calculated quaternion
   */
  static rotateY(quaternion: Quaternion, rad: number, out: Quaternion): void {
    const { _x, _y, _z, _w } = quaternion;
    rad *= 0.5;
    const by = Math.sin(rad);
    const bw = Math.cos(rad);

    out._x = _x * bw - _z * by;
    out._y = _y * bw + _w * by;
    out._z = _z * bw + _x * by;
    out._w = _w * bw - _y * by;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Calculate a quaternion that the specified quaternion rotate around Z axis.
   * @param quaternion - The specified quaternion
   * @param rad - The rotation angle in radians
   * @param out - The calculated quaternion
   */
  static rotateZ(quaternion: Quaternion, rad: number, out: Quaternion): void {
    const { _x, _y, _z, _w } = quaternion;
    rad *= 0.5;
    const bz = Math.sin(rad);
    const bw = Math.cos(rad);

    out._x = _x * bw + _y * bz;
    out._y = _y * bw - _x * bz;
    out._z = _z * bw + _w * bz;
    out._w = _w * bw - _z * bz;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Scale a quaternion by a given number.
   * @param a - The quaternion
   * @param s - The given number
   * @param out - The scaled quaternion
   */
  static scale(a: Quaternion, s: number, out: Quaternion): void {
    out._x = a._x * s;
    out._y = a._y * s;
    out._z = a._z * s;
    out._w = a._w * s;
    out._onValueChanged && out._onValueChanged();
  }

  /**
   * Create a quaternion from the specified angle.
   * @param angle - The specified angle
   * @param out - The calculated quaternion
   */
  static fromAngle(angle: Vector3, out: Quaternion): void {
    const angleToRadian = Math.PI / 180;
    Quaternion.rotationYawPitchRoll(angle.y * angleToRadian, angle.x * angleToRadian, angle.z * angleToRadian, out);
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
   * The x component of the quaternion.
   */
  public get x(): number {
    return this._x;
  }

  public set x(value: number) {
    this._x = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The y component of the quaternion.
   */
  public get y(): number {
    return this._y;
  }

  public set y(value: number) {
    this._y = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The z component of the quaternion.
   */
  public get z(): number {
    return this._z;
  }

  public set z(value: number) {
    this._z = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * Indicting whether this instance is normalized.
   */
  public get normalized(): boolean {
    return (
      Math.abs(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w - 1) <
      MathUtil.zeroTolerance
    );
  }

  /**
   * The w component of the quaternion.
   */
  public get w() {
    return this._w;
  }

  public set w(value: number) {
    this._w = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * Constructor of Quaternion.
   * @param x - The x component of the quaternion, default 0
   * @param y - The y component of the quaternion, default 0
   * @param z - The z component of the quaternion, default 0
   * @param w - The w component of the quaternion, default 1
   */
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
  }

  /**
   * Set the value of this quaternion, and return this quaternion.
   * @param x - The x component of the quaternion
   * @param y - The y component of the quaternion
   * @param z - The z component of the quaternion
   * @param w - The w component of the quaternion
   * @returns This quaternion
   */
  set(x: number, y: number, z: number, w: number): Quaternion {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this._onValueChanged && this._onValueChanged();
    return this;
  }

  /**
   * Transforms this quaternion into its conjugated version.
   * @returns This quaternion
   */
  conjugate(): Quaternion {
    this._x *= -1;
    this._y *= -1;
    this._z *= -1;
    this._onValueChanged && this._onValueChanged();
    return this;
  }

  /**
   * Get the rotation axis and rotation angle of the quaternion (unit: radians).
   * @param out - The axis as an output parameter
   * @returns The rotation angle (unit: radians)
   */
  getAxisAngle(out: Vector3): number {
    const { _x, _y, _z } = this;
    const length = _x * _x + _y * _y + _z * _z;

    if (length < MathUtil.zeroTolerance) {
      out._x = 1;
      out._y = 0;
      out._z = 0;

      return 0;
    } else {
      const inv = 1.0 / length;
      out._x = this._x * inv;
      out._y = this._y * inv;
      out._z = this._z * inv;

      return Math.acos(this._w) * 2.0;
    }
  }

  /**
   * Identity this quaternion.
   * @returns This quaternion after identity
   */
  identity(): Quaternion {
    this._x = 0;
    this._y = 0;
    this._z = 0;
    this._w = 1;
    this._onValueChanged && this._onValueChanged();
    return this;
  }

  /**
   * Calculate the length of this quaternion.
   * @returns The length of this quaternion
   */
  length(): number {
    const { _x, _y, _z, _w } = this;
    return Math.sqrt(_x * _x + _y * _y + _z * _z + _w * _w);
  }

  /**
   * Calculates the squared length of this quaternion.
   * @returns The squared length of this quaternion
   */
  lengthSquared(): number {
    const { _x, _y, _z, _w } = this;
    return _x * _x + _y * _y + _z * _z + _w * _w;
  }

  /**
   * Converts this quaternion into a unit quaternion.
   * @returns This quaternion
   */
  normalize(): Quaternion {
    Quaternion.normalize(this, this);
    return this;
  }

  /**
   * Get the euler of this quaternion.
   * @param out - The euler (in radians) as an output parameter
   * @returns Euler x->pitch y->yaw z->roll
   */
  toEuler(out: Vector3): Vector3 {
    this._toYawPitchRoll(out);

    const t = out._x;
    out._x = out._y;
    out._y = t;
    out._onValueChanged && out._onValueChanged();
    return out;
  }

  /**
   * Get the euler of this quaternion.
   * @param out - The euler (in radians) as an output parameter
   * @returns Euler x->yaw y->pitch z->roll
   */
  toYawPitchRoll(out: Vector3): Vector3 {
    this._toYawPitchRoll(out);
    out._onValueChanged && out._onValueChanged();
    return out;
  }

  /**
   * Calculate this quaternion rotate around X axis.
   * @param rad - The rotation angle in radians
   * @returns This quaternion
   */
  rotateX(rad: number): Quaternion {
    Quaternion.rotateX(this, rad, this);
    return this;
  }

  /**
   * Calculate this quaternion rotate around Y axis.
   * @param rad - The rotation angle in radians
   * @returns This quaternion
   */
  rotateY(rad: number): Quaternion {
    Quaternion.rotateY(this, rad, this);
    return this;
  }

  /**
   * Calculate this quaternion rotate around Z axis.
   * @param rad - The rotation angle in radians
   * @returns This quaternion
   */
  rotateZ(rad: number): Quaternion {
    Quaternion.rotateZ(this, rad, this);
    return this;
  }

  /**
   * Calculate this quaternion rotates around an arbitrary axis.
   * @param axis - The axis
   * @param rad - The rotation angle in radians
   * @returns This quaternion
   */
  rotationAxisAngle(axis: Vector3, rad: number): Quaternion {
    Quaternion.rotationAxisAngle(axis, rad, this);
    return this;
  }

  /**
   * Determines the product of this quaternion and the specified quaternion.
   * @param quat - The specified quaternion
   * @returns The product of the two quaternions
   */
  multiply(quat: Quaternion): Quaternion {
    Quaternion.multiply(this, quat, this);
    return this;
  }

  /**
   * Invert this quaternion.
   * @returns This quaternion after invert
   */
  invert(): Quaternion {
    Quaternion.invert(this, this);
    return this;
  }

  /**
   * Determines the dot product of this quaternion and the specified quaternion.
   * @param quat - The specified quaternion
   * @returns The dot product of two quaternions
   */
  dot(quat: Quaternion): number {
    return Quaternion.dot(this, quat);
  }

  /**
   * Performs a linear blend between this quaternion and the specified quaternion.
   * @param quat - The specified quaternion
   * @param t - The blend amount where 0 returns this and 1 quat
   * @returns - The result of linear blending between two quaternions
   */
  lerp(quat: Quaternion, t: number): Quaternion {
    Quaternion.lerp(this, quat, t, this);
    return this;
  }

  /**
   * Calculate this quaternion rotation around an arbitrary axis.
   * @param axis - The axis
   * @param rad - The rotation angle in radians
   * @returns This quaternion
   */
  rotateAxisAngle(axis: Vector3, rad: number): Quaternion {
    Quaternion._tempQuat1.rotationAxisAngle(axis, rad);
    this.multiply(Quaternion._tempQuat1);
    return this;
  }

  /**
   * Creates a clone of this quaternion.
   * @returns A clone of this quaternion
   */
  clone(): Quaternion {
    return new Quaternion(this._x, this._y, this._z, this._w);
  }

  /**
   * Copy this quaternion from the specified quaternion.
   * @param source - The specified quaternion
   * @returns This quaternion
   */
  copyFrom(source: QuaternionLike): Quaternion {
    this._x = source.x;
    this._y = source.y;
    this._z = source.z;
    this._w = source.w;
    this._onValueChanged && this._onValueChanged();
    return this;
  }

  /**
   * Copy this quaternion to the specified quaternion.
   * @param target - The specified quaternion
   * @returns This specified quaternion
   */
  copyTo(target: QuaternionLike): QuaternionLike {
    target.x = this._x;
    target.y = this._y;
    target.z = this._z;
    target.w = this._w;
    return target;
  }

  /**
   * Copy the value of this quaternion from an array.
   * @param array - The array
   * @param offset - The start offset of the array
   * @returns This quaternion
   */
  copyFromArray(array: ArrayLike<number>, offset: number = 0): Quaternion {
    this._x = array[offset];
    this._y = array[offset + 1];
    this._z = array[offset + 2];
    this._w = array[offset + 3];
    this._onValueChanged && this._onValueChanged();
    return this;
  }

  /**
   * Copy the value of this quaternion to an array.
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
   * Serialize this quaternion to a JSON representation.
   * @returns A JSON Object representation of this quaternion
   */
  toJSON(): QuaternionLike {
    return {
      x: this._x,
      y: this._y,
      z: this._z,
      w: this._w
    };
  }

  private _toYawPitchRoll(out: Vector3): void {
    // http://www.euclideanspace.com/maths/geometry/rotations/conversions/quaternionToEuler/
    const { _x: x, _y: y, _z: z, _w: w } = this;
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const ww = w * w;
    const unit = xx + yy + zz + ww;
    const test = 2 * (x * w - y * z);
    if (test > (1 - MathUtil.zeroTolerance) * unit) {
      out._x = Math.atan2(2.0 * (w * y - x * z), xx + ww - yy - zz);
      out._y = Math.PI / 2;
      out._z = 0;
    } else if (test < -(1 - MathUtil.zeroTolerance) * unit) {
      out._x = Math.atan2(2.0 * (w * y - x * z), xx + ww - yy - zz);
      out._y = -Math.PI / 2;
      out._z = 0;
    } else {
      out._x = Math.atan2(2.0 * (z * x + y * w), zz + ww - yy - xx);
      out._y = Math.asin(test / unit);
      out._z = Math.atan2(2.0 * (x * y + z * w), yy + ww - zz - xx);
    }
  }
}

interface QuaternionLike {
  /** {@inheritDoc Quaternion.x} */
  x: number;
  /** {@inheritDoc Quaternion.y} */
  y: number;
  /** {@inheritDoc Quaternion.z} */
  z: number;
  /** {@inheritDoc Quaternion.w} */
  w: number;
}
