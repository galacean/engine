import { MathUtil } from "./MathUtil";
import { Matrix3x3 } from "./Matrix3x3";
import { Vector3 } from "./Vector3";

/**
 * 四元数。
 */
export class Quaternion {
  /** @internal */
  static readonly _tempVector3 = new Vector3();

  /**
   * 将两个四元数相加。
   * @param left - 左四元数
   * @param right - 右四元数
   * @param out - 四元数相加结果
   */
  static add(left: Quaternion, right: Quaternion, out: Quaternion): void {
    out.x = left.x + right.x;
    out.y = left.y + right.y;
    out.z = left.z + right.z;
    out.w = left.w + right.w;
  }

  /**
   * 将两个四元数相乘。
   * @param left - 左四元数
   * @param right - 右四元数
   * @param out - 四元数相乘结果
   */
  static multiply(left: Quaternion, right: Quaternion, out: Quaternion): void {
    const ax = left.x,
      ay = left.y,
      az = left.z,
      aw = left.w;
    const bx = right.x,
      by = right.y,
      bz = right.z,
      bw = right.w;

    out.x = ax * bw + aw * bx + ay * bz - az * by;
    out.y = ay * bw + aw * by + az * bx - ax * bz;
    out.z = az * bw + aw * bz + ax * by - ay * bx;
    out.w = aw * bw - ax * bx - ay * by - az * bz;
  }

  /**
   * 计算共轭四元数。
   * @param a - 输入四元数
   * @param out - 输出的共轭四元数
   */
  static conjugate(a: Quaternion, out: Quaternion): void {
    out.x = -a.x;
    out.y = -a.y;
    out.z = -a.z;
    out.w = a.w;
  }

  /**
   * 计算两个四元数的点积。
   * @param left - 左四元数
   * @param right - 右四元数
   * @returns 两个四元数的点积
   */
  static dot(left: Quaternion, right: Quaternion): number {
    return left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w;
  }

  /**
   * 判断两个四元数是否相等。
   * @param left - 四元数
   * @param right - 四元数
   * @returns 两个四元数是否相等，是返回 true，否则返回 false
   */
  static equals(left: Quaternion, right: Quaternion): boolean {
    return (
      MathUtil.equals(left.x, right.x) &&
      MathUtil.equals(left.y, right.y) &&
      MathUtil.equals(left.z, right.z) &&
      MathUtil.equals(left.w, right.w)
    );
  }

  /**
   * 通过旋转的欧拉角设置四元数。
   * @param axis - 旋转轴向量
   * @param rad - 旋转角度(单位：弧度)
   * @param out - 生成的四元数
   */
  static rotationAxisAngle(axis: Vector3, rad: number, out: Quaternion): void {
    const normalAxis = Quaternion._tempVector3;
    Vector3.normalize(axis, normalAxis);
    rad *= 0.5;
    const s = Math.sin(rad);
    out.x = normalAxis.x * s;
    out.y = normalAxis.y * s;
    out.z = normalAxis.z * s;
    out.w = Math.cos(rad);
  }

  /**
   * 根据 x,y,z 轴的旋转欧拉角(弧度)生成四元数，欧拉角顺序 pitch yaw roll。
   * @param x - 绕X轴旋转的弧度 pitch
   * @param y - 绕Y轴旋转的弧度 yaw
   * @param z - 绕Z轴旋转的弧度 roll
   * @param out - 生成的四元数
   */
  static rotationEuler(x: number, y: number, z: number, out: Quaternion): void {
    Quaternion.rotationYawPitchRoll(y, x, z, out);
  }

  /**
   * 根据 yaw、pitch、roll 生成四元数
   * @param yaw - 偏航角(单位弧度)
   * @param pitch - 俯仰角(单位弧度)
   * @param roll - 翻滚角(单位弧度)
   * @param out - 生成的四元数
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

    out.x = cosYaw * sinPitch * cosRoll + sinYaw * cosPitch * sinRoll;
    out.y = sinYaw * cosPitch * cosRoll - cosYaw * sinPitch * sinRoll;
    out.z = cosYawPitch * sinRoll - sinYawPitch * cosRoll;
    out.w = cosYawPitch * cosRoll + sinYawPitch * sinRoll;
  }

  /**
   * 通过矩阵得出对应的四元数。
   * @param m - 3x3矩阵
   * @param out - 生成的四元数
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
      out.w = sqrt * 0.5;
      sqrt = 0.5 / sqrt;

      out.x = (m23 - m32) * sqrt;
      out.y = (m31 - m13) * sqrt;
      out.z = (m12 - m21) * sqrt;
    } else if (m11 >= m22 && m11 >= m33) {
      sqrt = Math.sqrt(1.0 + m11 - m22 - m33);
      half = 0.5 / sqrt;

      out.x = 0.5 * sqrt;
      out.y = (m12 + m21) * half;
      out.z = (m13 + m31) * half;
      out.w = (m23 - m32) * half;
    } else if (m22 > m33) {
      sqrt = Math.sqrt(1.0 + m22 - m11 - m33);
      half = 0.5 / sqrt;

      out.x = (m21 + m12) * half;
      out.y = 0.5 * sqrt;
      out.z = (m32 + m23) * half;
      out.w = (m31 - m13) * half;
    } else {
      sqrt = Math.sqrt(1.0 + m33 - m11 - m22);
      half = 0.5 / sqrt;

      out.x = (m13 + m31) * half;
      out.y = (m23 + m32) * half;
      out.z = 0.5 * sqrt;
      out.w = (m12 - m21) * half;
    }
  }

  /**
   * 计算四元数的逆。
   * @param a - 四元数的逆
   * @param out - 四元数的逆
   */
  static invert(a: Quaternion, out: Quaternion): void {
    const { x, y, z, w } = a;
    const dot = x * x + y * y + z * z + w * w;
    if (dot > MathUtil.zeroTolerance) {
      const invDot = 1.0 / dot;
      out.x = -x * invDot;
      out.y = -y * invDot;
      out.z = -z * invDot;
      out.w = w * invDot;
    }
  }

  /**
   * 插值四元数。
   * @param start - 左四元数
   * @param end - 右四元数
   * @param t - 插值比例 范围 0～1
   * @param out - 插值结果
   */
  static lerp(start: Quaternion, end: Quaternion, t: number, out: Quaternion): void {
    const inv = 1.0 - t;
    if (Quaternion.dot(start, end) >= 0) {
      out.x = start.x * inv + end.x * t;
      out.y = start.y * inv + end.y * t;
      out.z = start.z * inv + end.z * t;
      out.w = start.w * inv + end.w * t;
    } else {
      out.x = start.x * inv - end.x * t;
      out.y = start.y * inv - end.y * t;
      out.z = start.z * inv - end.z * t;
      out.w = start.w * inv - end.w * t;
    }

    out.normalize();
  }

  /**
   * 球面插值四元数。
   * @param start - 左四元数
   * @param end - 右四元数
   * @param t - 插值比例
   * @param out - 插值结果
   */
  static slerp(start: Quaternion, end: Quaternion, t: number, out: Quaternion): void {
    //CM: todo: 参照stride实现
    const ax = start.x;
    const ay = start.y;
    const az = start.z;
    const aw = start.w;
    let bx = end.x;
    let by = end.y;
    let bz = end.z;
    let bw = end.w;

    let scale0, scale1;
    // calc cosine
    let cosom = ax * bx + ay * by + az * bz + aw * bw;
    // adjust signs (if necessary)
    if (cosom < 0.0) {
      cosom = -cosom;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    // calculate coefficients
    if (1.0 - cosom > MathUtil.zeroTolerance) {
      // standard case (slerp)
      const omega = Math.acos(cosom);
      const sinom = Math.sin(omega);
      scale0 = Math.sin((1.0 - t) * omega) / sinom;
      scale1 = Math.sin(t * omega) / sinom;
    } else {
      // "from" and "to" quaternions are very close
      //  ... so we can do a linear interpolation
      scale0 = 1.0 - t;
      scale1 = t;
    }
    // calculate final values
    out.x = scale0 * ax + scale1 * bx;
    out.y = scale0 * ay + scale1 * by;
    out.z = scale0 * az + scale1 * bz;
    out.w = scale0 * aw + scale1 * bw;
  }

  /**
   * 将一个四元数归一化。
   * @param a - 四元数
   * @param out - 四元数归一化的结果
   */
  static normalize(a: Quaternion, out: Quaternion): void {
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
   * 绕 X 轴旋生成转四元数。
   * @param a - 四元数
   * @param rad - 旋转角度(单位：弧度)
   * @param out - 旋转后的四元数
   */
  static rotationX(rad: number, out: Quaternion): void {
    rad *= 0.5;
    const s = Math.sin(rad);
    const c = Math.cos(rad);

    out.x = s;
    out.y = 0;
    out.z = 0;
    out.w = c;
  }

  /**
   * 绕 Y 轴旋转生成四元数。
   * @param a - 四元数
   * @param rad - 旋转角度(单位：弧度)
   * @param out - 旋转后的四元数
   */
  static rotationY(rad: number, out: Quaternion): void {
    rad *= 0.5;
    const s = Math.sin(rad);
    const c = Math.cos(rad);

    out.x = 0;
    out.y = s;
    out.z = 0;
    out.w = c;
  }

  /**
   * 绕 Z 轴旋转生成四元数。
   * @param a - 四元数
   * @param rad - 旋转角度(单位：弧度)
   * @param out - 旋转后的四元数
   */
  static rotationZ(rad: number, out: Quaternion): void {
    rad *= 0.5;
    const s = Math.sin(rad);
    const c = Math.cos(rad);

    out.x = 0;
    out.y = 0;
    out.z = s;
    out.w = c;
  }

  /**
   * 四元数 q 绕 X 轴旋转。
   * @param q - 四元数
   * @param rad - 旋转角度(单位：弧度)
   * @param out - 旋转后的四元数
   */
  static rotateX(q: Quaternion, rad: number, out: Quaternion): void {
    const { x, y, z, w } = q;
    rad *= 0.5;
    const bx = Math.sin(rad);
    const bw = Math.cos(rad);

    out.x = x * bw + w * bx;
    out.y = y * bw + z * bx;
    out.z = z * bw - y * bx;
    out.w = w * bw - x * bx;
  }

  /**
   * 四元数 q 绕 Y 轴旋转。
   * @param q - 四元数
   * @param rad - 旋转角度(单位：弧度)
   * @param out - 旋转后的四元数
   */
  static rotateY(q: Quaternion, rad: number, out: Quaternion): void {
    const { x, y, z, w } = q;
    rad *= 0.5;
    const by = Math.sin(rad);
    const bw = Math.cos(rad);

    out.x = x * bw - z * by;
    out.y = y * bw + w * by;
    out.z = z * bw + x * by;
    out.w = w * bw - y * by;
  }

  /**
   * 四元数 q 绕 Z 轴旋转。
   * @param q - 四元数
   * @param rad - 旋转角度(单位：弧度)
   * @param out - 旋转后的四元数
   */
  static rotateZ(q: Quaternion, rad: number, out: Quaternion): void {
    const { x, y, z, w } = q;
    rad *= 0.5;
    const bz = Math.sin(rad);
    const bw = Math.cos(rad);

    out.x = x * bw + y * bz;
    out.y = y * bw - x * bz;
    out.z = z * bw + w * bz;
    out.w = w * bw - z * bz;
  }

  /**
   * 将一个四元数缩放。
   * @param a - 四元数
   * @param s - 缩放因子
   * @param out - 四元数缩放的结果
   */
  static scale(a: Quaternion, s: number, out: Quaternion): void {
    out.x = a.x * s;
    out.y = a.y * s;
    out.z = a.z * s;
    out.w = a.w * s;
  }

  /** 四元数的 X 分量 */
  x: number;
  /** 四元数的 Y 分量 */
  y: number;
  /** 四元数的 Z 分量 */
  z: number;
  /** 四元数的 W 分量 */
  w: number;

  /**
   * 创建四元数实例。
   * @param x - 四元数的 X 分量，默认值 0
   * @param y - 四元数的 Y 分量，默认值 0
   * @param z - 四元数的 Z 分量，默认值 0
   * @param w - 四元数的 W 分量，默认值 1
   */
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /**
   * 设置 x, y, z, w 的值。
   * @param x - 四元数的 X 分量
   * @param y - 四元数的 Y 分量
   * @param z - 四元数的 Z 分量
   * @param w - 四元数的 W 分量
   * @returns 当前四元数
   */
  setValue(x: number, y: number, z: number, w: number): Quaternion {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;

    return this;
  }

  /**
   * 通过数组设置值，并返回当前四元数。
   * @param array - 数组
   * @param offset - 数组偏移
   * @returns 当前四元数
   */
  setValueByArray(array: ArrayLike<number>, offset: number = 0): Quaternion {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    this.w = array[offset + 3];
    return this;
  }

  /**
   * 共轭四元数
   * @returns 当前四元数
   */
  conjugate(): Quaternion {
    this.x *= -1;
    this.y *= -1;
    this.z *= -1;

    return this;
  }

  /**
   * 获取四元数的旋转轴和旋转角度(单位：弧度)。
   * @param out - 四元数的旋转轴
   * @returns 当前四元数的旋转角度(单位：弧度)
   */
  getAxisAngle(out: Vector3): number {
    const { x, y, z } = this;
    const length = x * x + y * y + z * z;

    if (length < MathUtil.zeroTolerance) {
      out.x = 1;
      out.y = 0;
      out.z = 0;

      return 0;
    } else {
      const inv = 1.0 / length;
      out.x = this.x * inv;
      out.y = this.y * inv;
      out.z = this.z * inv;

      return Math.acos(this.w) * 2.0;
    }
  }

  /**
   * 将四元数设置为单位四元数。
   */
  identity(): Quaternion {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 1;
    return this;
  }

  /**
   * 计算一个四元数的标量长度。
   * @returns 当前四元数的标量长度
   */
  length(): number {
    const { x, y, z, w } = this;
    return Math.sqrt(x * x + y * y + z * z + w * w);
  }

  /**
   * 计算一个四元数的标量长度的平方。
   * @returns 当前四元数的标量长度的平方
   */
  lengthSquared(): number {
    const { x, y, z, w } = this;
    return x * x + y * y + z * z + w * w;
  }

  /**
   * 四元数归一化。
   * @returns 当前四元数
   */
  normalize(): Quaternion {
    Quaternion.normalize(this, this);
    return this;
  }

  /**
   * 获取四元数的欧拉角(弧度)。
   * @param out - 四元数的欧拉角(弧度)
   * @returns 欧拉角 x->pitch y->yaw z->roll
   */
  toEuler(out: Vector3): Vector3 {
    this.toYawPitchRoll(out);
    const t = out.x;
    out.x = out.y;
    out.y = t;
    return out;
  }

  /**
   * 获取四元数的欧拉角(弧度)。
   * @param out - 四元数的欧拉角(弧度)
   * @returns 欧拉角 x->yaw y->pitch z->roll
   */
  toYawPitchRoll(out: Vector3): Vector3 {
    const { x, y, z, w } = this;
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const xy = x * y;
    const zw = z * w;
    const zx = z * x;
    const yw = y * w;
    const yz = y * z;
    const xw = x * w;

    out.y = Math.asin(2.0 * (xw - yz));
    if (Math.cos(out.y) > MathUtil.zeroTolerance) {
      out.z = Math.atan2(2.0 * (xy + zw), 1.0 - 2.0 * (zz + xx));
      out.x = Math.atan2(2.0 * (zx + yw), 1.0 - 2.0 * (yy + xx));
    } else {
      out.z = Math.atan2(-2.0 * (xy - zw), 1.0 - 2.0 * (yy + zz));
      out.x = 0.0;
    }

    return out;
  }

  /**
   * 拷贝到数组。
   * @param out - 数组。
   * @param outOffset - 数组偏移。
   */
  toArray(out: number[] | Float32Array | Float64Array, outOffset: number = 0) {
    out[outOffset] = this.x;
    out[outOffset + 1] = this.y;
    out[outOffset + 2] = this.z;
    out[outOffset + 3] = this.w;
  }

  /**
   * 创建一个新的四元数，并用当前四元数初始化。
   * @returns 一个新的四元数，并且拷贝当前四元数的值
   */
  clone(): Quaternion {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }

  /**
   * 将当前四元数值拷贝给 out 四元数。
   * @param out - 目标四元数
   */
  cloneTo(out: Quaternion): Quaternion {
    out.x = this.x;
    out.y = this.y;
    out.z = this.z;
    out.w = this.w;
    return out;
  }

  /**
   * 绕 X 轴旋转。
   * @param rad - 旋转角度(单位：弧度)
   * @returns 当前四元数
   */
  rotateX(rad: number): Quaternion {
    Quaternion.rotateX(this, rad, this);
    return this;
  }

  /**
   * 绕 Y 轴旋转。
   * @param rad - 旋转角度(单位：弧度)
   * @returns 当前四元数
   */
  rotateY(rad: number): Quaternion {
    Quaternion.rotateY(this, rad, this);
    return this;
  }

  /**
   * 绕 Z 轴旋转。
   * @param rad - 旋转角度(单位：弧度)
   * @returns 当前四元数
   */
  rotateZ(rad: number): Quaternion {
    Quaternion.rotateZ(this, rad, this);
    return this;
  }

  /**
   * 通过旋转的欧拉角设置当前四元数。
   * @param axis - 旋转轴向量
   * @param rad - 旋转角度(单位：弧度)
   * @returns 当前四元数
   */
  rotationAxisAngle(axis: Vector3, rad: number): Quaternion {
    Quaternion.rotationAxisAngle(axis, rad, this);
    return this;
  }
}
