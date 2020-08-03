import { MathUtil } from "./MathUtil";
import { Quaternion } from "./Quaternion";
import { Matrix4x4 } from "./Matrix4x4";

/**
 * 四维向量
 */
export class Vector4 {
  /** @internal 零向量 */
  static readonly Zero = new Vector4(0.0, 0.0, 0.0, 0.0);
  /** @internal 一向量 */
  static readonly One = new Vector4(1.0, 1.0, 1.0, 1.0);

  /**
   * 将两个向量相加。
   * @param a - 向量
   * @param b - 向量
   * @param out - 向量相加结果
   */
  static add(a: Vector4, b: Vector4, out: Vector4): void {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    out.z = a.z + b.z;
    out.w = a.w + b.w;
  }

  /**
   * 将两个向量相减。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个四维向量的相减结果
   */
  static subtract(a: Vector4, b: Vector4, out: Vector4): void {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    out.z = a.z - b.z;
    out.w = a.w - b.w;
  }

  /**
   * 将两个向量相乘。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个四维向量的相乘结果
   */
  static multiply(a: Vector4, b: Vector4, out: Vector4): void {
    out.x = a.x * b.x;
    out.y = a.y * b.y;
    out.z = a.z * b.z;
    out.w = a.w * b.w;
  }

  /**
   * 将两个四维向量相除。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个四维向量的相除结果
   */
  static divide(a: Vector4, b: Vector4, out: Vector4): void {
    out.x = a.x / b.x;
    out.y = a.y / b.y;
    out.z = a.z / b.z;
    out.w = a.w / b.w;
  }

  /**
   * 计算两个四维向量的点积。
   * @param a - 左向量
   * @param b - 右向量
   * @returns 返回两个向量的点积
   */
  static dot(a: Vector4, b: Vector4): number {
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  }

  /**
   * 计算两个四维向量的距离。
   * @param a - 向量
   * @param b - 向量
   * @returns 返回两个向量的距离
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
   * @returns 返回两个向量的距离的平方
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
   * @param a - 向量
   * @param b - 向量
   * @returns 返回两个向量是否相等，是返回 true，否则返回 false
   */
  static equals(a: Vector4, b: Vector4): boolean {
    return (
      MathUtil.equals(a.x, b.x) && MathUtil.equals(a.y, b.y) && MathUtil.equals(a.z, b.z) && MathUtil.equals(a.w, b.w)
    );
  }

  /**
   * 插值四维向量。
   * @param a - 左向量
   * @param b - 右向量
   * @param t - 插值比例
   * @param out - 插值结果
   */
  static lerp(a: Vector4, b: Vector4, t: number, out: Vector4): void {
    const { x, y, z, w } = a;
    out.x = x + (b.x - x) * t;
    out.y = y + (b.y - y) * t;
    out.z = z + (b.z - z) * t;
    out.w = w + (b.w - w) * t;
  }

  /**
   * 分别取两个四维向量x、y的最大值计算新的四维向量。
   * @param a - 向量
   * @param b - 向量
   * @param out - 结果向量
   */
  static max(a: Vector4, b: Vector4, out: Vector4): void {
    out.x = Math.max(a.x, b.x);
    out.y = Math.max(a.y, b.y);
    out.z = Math.max(a.z, b.z);
    out.w = Math.max(a.w, b.w);
  }

  /**
   * 分别取两个四维向量x、y的最小值计算新的四维向量。
   * @param a - 向量
   * @param b - 向量
   * @param out - 结果向量
   */
  static min(a: Vector4, b: Vector4, out: Vector4): void {
    out.x = Math.min(a.x, b.x);
    out.y = Math.min(a.y, b.y);
    out.z = Math.min(a.z, b.z);
    out.w = Math.min(a.w, b.w);
  }

  /**
   * 将向量a反转，并将结果输出到out。
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
   * 将向量a归一化，并将结果输出到out。
   * @param a - 向量
   * @param out - 向量归一化的结果
   */
  static normalize(a: Vector4, out: Vector4): void {
    const { x, y, z, w } = a;
    let len: number = x * x + y * y + z * z + w * w;
    if (len > 0) {
      len = 1 / Math.sqrt(len);
      out.x = x * len;
      out.y = y * len;
      out.z = z * len;
      out.w = w * len;
    }
  }

  /**
   * 将向量a缩放，并将结果输出到out。
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
   * @param a - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static transformMat4x4(a: Vector4, m: Matrix4x4, out: Vector4): void {
    const { x, y, z, w } = a;
    const e = m.elements;
    out.x = x * e[0] + y * e[4] + z * e[8] + w * e[12];
    out.y = x * e[1] + y * e[5] + z * e[9] + w * e[13];
    out.z = x * e[2] + y * e[6] + z * e[10] + w * e[14];
    out.w = x * e[3] + y * e[7] + z * e[11] + w * e[15];
  }

  /**
   * 通过四元数将一个四维向量转换到另一个四维向量。
   * @param a - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static transformQuat(a: Vector4, q: Quaternion, out: Vector4): void {
    const { x, y, z, w } = a;
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

  /** X轴坐标 */
  x: number;
  /** Y轴坐标 */
  y: number;
  /** Z轴坐标 */
  z: number;
  /** W轴坐标 */
  w: number;

  /**
   * 创建一个Vector4实例。
   * @param x - X轴坐标，默认值0
   * @param y - Y轴坐标，默认值0
   * @param z - Z轴坐标，默认值0
   * @param w - W轴坐标，默认值0
   */
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /**
   * 设置x, y, z, w的值，并返回当前向量。
   * @param x - X轴坐标
   * @param y - Y轴坐标
   * @param z - Z轴坐标
   * @param w - W轴坐标
   * @returns 返回当前向量
   */
  setValue(x: number, y: number, z: number, w: number): Vector4 {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  /**
   * 创建一个新的四维向量，并用当前向量值初始化。
   * @returns 返回一个新的向量，并且拷贝当前向量的值
   */
  clone(): Vector4 {
    let ret = new Vector4(this.x, this.y, this.z, this.w);
    return ret;
  }

  /**
   * 将当前向量值拷贝给out向量。
   * @param out - 目标向量
   */
  cloneTo(out: Vector4): void {
    out.x = this.x;
    out.y = this.y;
    out.z = this.z;
    out.w = this.w;
  }

  /**
   * 将当前向量加上给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 返回当前向量
   */
  add(a: Vector4): Vector4 {
    this.x += a.x;
    this.y += a.y;
    this.z += a.z;
    this.w += a.w;
    return this;
  }

  /**
   * 将当前向量减去给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 返回当前向量
   */
  subtract(a: Vector4): Vector4 {
    this.x -= a.x;
    this.y -= a.y;
    this.z -= a.z;
    this.w -= a.w;
    return this;
  }

  /**
   * 将当前向量乘以给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 返回当前向量
   */
  multiply(a: Vector4): Vector4 {
    this.x *= a.x;
    this.y *= a.y;
    this.z *= a.z;
    this.w *= a.w;
    return this;
  }

  /**
   * 将当前向量除以给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 返回当前向量
   */
  divide(a: Vector4): Vector4 {
    this.x /= a.x;
    this.y /= a.y;
    this.z /= a.z;
    this.w /= a.w;
    return this;
  }

  /**
   * 计算一个四维向量的标量长度。
   * @returns 返回当前向量的标量长度
   */
  length(): number {
    const { x, y, z, w } = this;
    return Math.sqrt(x * x + y * y + z * z + w * w);
  }

  /**
   * 计算一个四维向量的标量长度的平方。
   * @returns 返回当前向量的标量长度的平方
   */
  lengthSquared(): number {
    const { x, y, z, w } = this;
    return x * x + y * y + z * z + w * w;
  }

  /**
   * 当前向量反转，并返回。
   * @returns 返回当前向量
   */
  negate(): Vector4 {
    this.x *= -1;
    this.y *= -1;
    this.z *= -1;
    this.w *= -1;
    return this;
  }

  /**
   * 当前向量归一化，并返回。
   * @returns 返回当前向量
   */
  normalize(): Vector4 {
    const { x, y, z, w } = this;
    let len: number = x * x + y * y + z * z + w * w;
    if (len > 0) {
      len = 1 / Math.sqrt(len);
      this.x = x * len;
      this.y = y * len;
      this.z = z * len;
      this.w = w * len;
    }
    return this;
  }

  /**
   * 当前向量缩放，并返回。
   * @param s - 缩放因子
   * @returns 返回当前向量
   */
  scale(s: number): Vector4 {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    this.w *= s;
    return this;
  }
}
