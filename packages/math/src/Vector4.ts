import { MathUtil } from "./MathUtil";
import { Quaternion } from "./Quaternion";
import { Matrix } from "./Matrix";

/**
 * 四维向量。
 */
export class Vector4 {
  /** @internal 零向量。*/
  static readonly _zero = new Vector4(0.0, 0.0, 0.0, 0.0);
  /** @internal 一向量。*/
  static readonly _one = new Vector4(1.0, 1.0, 1.0, 1.0);

  /**
   * 将两个向量相加。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 向量相加结果
   */
  static add(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = left.x + right.x;
    out.y = left.y + right.y;
    out.z = left.z + right.z;
    out.w = left.w + right.w;
  }

  /**
   * 将两个向量相减。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 两个四维向量的相减结果
   */
  static subtract(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = left.x - right.x;
    out.y = left.y - right.y;
    out.z = left.z - right.z;
    out.w = left.w - right.w;
  }

  /**
   * 将两个向量相乘。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 两个四维向量的相乘结果
   */
  static multiply(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = left.x * right.x;
    out.y = left.y * right.y;
    out.z = left.z * right.z;
    out.w = left.w * right.w;
  }

  /**
   * 将两个四维向量相除。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 两个四维向量的相除结果
   */
  static divide(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = left.x / right.x;
    out.y = left.y / right.y;
    out.z = left.z / right.z;
    out.w = left.w / right.w;
  }

  /**
   * 计算两个四维向量的点积。
   * @param left - 左向量
   * @param right - 右向量
   * @returns 两个向量的点积
   */
  static dot(left: Vector4, right: Vector4): number {
    return left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w;
  }

  /**
   * 计算两个四维向量的距离。
   * @param a - 向量
   * @param b - 向量
   * @returns 两个向量的距离
   */
  static distance(a: Vector4, b: Vector4): number {
    const x = b.x - a.x;
    const y = b.y - a.y;
    const z = b.z - a.z;
    const w = b.w - a.w;
    return Math.sqrt(x * x + y * y + z * z + w * w);
  }

  /**
   * 计算两个四维向量的距离的平方。
   * @param a - 向量
   * @param b - 向量
   * @returns 两个向量的距离的平方
   */
  static distanceSquared(a: Vector4, b: Vector4): number {
    const x = b.x - a.x;
    const y = b.y - a.y;
    const z = b.z - a.z;
    const w = b.w - a.w;
    return x * x + y * y + z * z + w * w;
  }

  /**
   * 判断两个四维向量的值是否相等。
   * @param left - 向量
   * @param right - 向量
   * @returns 两个向量是否相等，是返回 true，否则返回 false
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
   * 插值四维向量。
   * @param start - 左向量
   * @param end - 右向量
   * @param t - 插值比例
   * @param out - 插值结果
   */
  static lerp(start: Vector4, end: Vector4, t: number, out: Vector4): void {
    const { x, y, z, w } = start;
    out.x = x + (end.x - x) * t;
    out.y = y + (end.y - y) * t;
    out.z = z + (end.z - z) * t;
    out.w = w + (end.w - w) * t;
  }

  /**
   * 分别取两个四维向量 x、y 的最大值计算新的四维向量。
   * @param left - 向量
   * @param right - 向量
   * @param out - 结果向量
   */
  static max(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = Math.max(left.x, right.x);
    out.y = Math.max(left.y, right.y);
    out.z = Math.max(left.z, right.z);
    out.w = Math.max(left.w, right.w);
  }

  /**
   * 分别取两个四维向量 x、y 的最小值计算新的四维向量。
   * @param left - 向量
   * @param right - 向量
   * @param out - 结果向量
   */
  static min(left: Vector4, right: Vector4, out: Vector4): void {
    out.x = Math.min(left.x, right.x);
    out.y = Math.min(left.y, right.y);
    out.z = Math.min(left.z, right.z);
    out.w = Math.min(left.w, right.w);
  }

  /**
   * 将向量 a 反转的结果输出到 out。
   * @param a - 向量
   * @param out - 向量反转的结果
   */
  static negate(a: Vector4, out: Vector4): void {
    out.x = -a.x;
    out.y = -a.y;
    out.z = -a.z;
    out.w = -a.w;
  }

  /**
   * 将向量 a 归一化的结果输出到 out。
   * @param a - 向量
   * @param out - 向量归一化的结果
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
   * 将向量 a 缩放的结果输出到 out。
   * @param a - 向量
   * @param s - 缩放因子
   * @param out - 向量缩放的结果
   */
  static scale(a: Vector4, s: number, out: Vector4): void {
    out.x = a.x * s;
    out.y = a.y * s;
    out.z = a.z * s;
    out.w = a.w * s;
  }

  /**
   * 通过4x4矩阵将一个四维向量转换到另一个四维向量。
   * @param v - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
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
   * 通过四元数将一个四维向量转换到另一个四维向量。
   * @param v - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
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

  /** 向量的 X 分量。 */
  x: number;
  /** 向量的 Y 分量。 */
  y: number;
  /** 向量的 Z 分量。 */
  z: number;
  /** 向量的 W 分量。 */
  w: number;

  /**
   * 创建一个 Vector4 实例。
   * @param x - 向量的 X 分量，默认值 0
   * @param y - 向量的 Y 分量，默认值 0
   * @param z - 向量的 Z 分量，默认值 0
   * @param w - 向量的 W 分量，默认值 0
   */
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /**
   * 设置 x, y, z, w 的值，并返回当前向量。
   * @param x - 向量的 X 分量
   * @param y - 向量的 Y 分量
   * @param z - 向量的 Z 分量
   * @param w - 向量的 W 分量
   * @returns 当前向量
   */
  setValue(x: number, y: number, z: number, w: number): Vector4 {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  /**
   * 将当前向量加上给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  add(right: Vector4): Vector4 {
    this.x += right.x;
    this.y += right.y;
    this.z += right.z;
    this.w += right.w;
    return this;
  }

  /**
   * 将当前向量减去给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  subtract(right: Vector4): Vector4 {
    this.x -= right.x;
    this.y -= right.y;
    this.z -= right.z;
    this.w -= right.w;
    return this;
  }

  /**
   * 将当前向量乘以给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  multiply(right: Vector4): Vector4 {
    this.x *= right.x;
    this.y *= right.y;
    this.z *= right.z;
    this.w *= right.w;
    return this;
  }

  /**
   * 将当前向量除以给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  divide(right: Vector4): Vector4 {
    this.x /= right.x;
    this.y /= right.y;
    this.z /= right.z;
    this.w /= right.w;
    return this;
  }

  /**
   * 计算一个四维向量的标量长度。
   * @returns 当前向量的标量长度
   */
  length(): number {
    const { x, y, z, w } = this;
    return Math.sqrt(x * x + y * y + z * z + w * w);
  }

  /**
   * 计算一个四维向量的标量长度的平方。
   * @returns 当前向量的标量长度的平方
   */
  lengthSquared(): number {
    const { x, y, z, w } = this;
    return x * x + y * y + z * z + w * w;
  }

  /**
   * 向量反转。
   * @returns 当前向量
   */
  negate(): Vector4 {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    this.w = -this.w;
    return this;
  }

  /**
   * 向量归一化。
   * @returns 当前向量
   */
  normalize(): Vector4 {
    Vector4.normalize(this, this);
    return this;
  }

  /**
   * 向量缩放。
   * @param s - 缩放因子
   * @returns 当前向量
   */
  scale(s: number): Vector4 {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    this.w *= s;
    return this;
  }

  /**
   * 创建一个新的四维向量，并用当前向量值初始化。
   * @returns 一个新的向量，并且拷贝当前向量的值
   */
  clone(): Vector4 {
    let ret = new Vector4(this.x, this.y, this.z, this.w);
    return ret;
  }

  /**
   * 将当前向量值拷贝给 out 向量。
   * @param out - 目标向量
   */
  cloneTo(out: Vector4): Vector4 {
    out.x = this.x;
    out.y = this.y;
    out.z = this.z;
    out.w = this.w;
    return out;
  }
}
