import { MathUtil } from "./MathUtil";
import { Quaternion } from "./Quaternion";
import { Matrix3x3 } from "./Matrix3x3";
import { Matrix4x4 } from "./Matrix4x4";

/**
 * 三维向量
 */
export class Vector3 {
  /** @internal 零向量 */
  static readonly _Zero = new Vector3(0.0, 0.0, 0.0);
  /** @internal 一向量 */
  static readonly _One = new Vector3(1.0, 1.0, 1.0);
  /** @internal 临时向量，减少反复创建 */
  static _tempVector3 = new Vector3();

  /**
   * 将两个向量相加。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 向量相加结果
   */
  static add(a: Vector3, b: Vector3, out: Vector3): void {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    out.z = a.z + b.z;
  }

  /**
   * 将两个向量相减。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个三维向量的相减结果
   */
  static subtract(a: Vector3, b: Vector3, out: Vector3): void {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    out.z = a.z - b.z;
  }

  /**
   * 将两个向量相乘。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个三维向量的相乘结果
   */
  static multiply(a: Vector3, b: Vector3, out: Vector3): void {
    out.x = a.x * b.x;
    out.y = a.y * b.y;
    out.z = a.z * b.z;
  }

  /**
   * 将两个三维向量相除。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个三维向量的相除结果
   */
  static divide(a: Vector3, b: Vector3, out: Vector3): void {
    out.x = a.x / b.x;
    out.y = a.y / b.y;
    out.z = a.z / b.z;
  }

  /**
   * 计算两个三维向量的点积。
   * @param a - 左向量
   * @param b - 右向量
   * @returns 两个向量的点积
   */
  static dot(a: Vector3, b: Vector3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  /**
   * 计算两个三维向量的叉乘。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个三维向量的叉乘结果
   */
  static cross(a: Vector3, b: Vector3, out: Vector3): void {
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const bx = b.x;
    const by = b.y;
    const bz = b.z;

    out.x = ay * bz - az * by;
    out.y = az * bx - ax * bz;
    out.z = ax * by - ay * bx;
  }

  /**
   * 计算两个三维向量的距离。
   * @param a - 向量
   * @param b - 向量
   * @returns 两个向量的距离
   */
  static distance(a: Vector3, b: Vector3): number {
    const x = b.x - a.x;
    const y = b.y - a.y;
    const z = b.z - a.z;
    return Math.sqrt(x * x + y * y + z * z);
  }

  /**
   * 计算两个三维向量的距离的平方。
   * @param a - 向量
   * @param b - 向量
   * @returns 两个向量的距离的平方
   */
  static distanceSquared(a: Vector3, b: Vector3): number {
    const x = b.x - a.x;
    const y = b.y - a.y;
    const z = b.z - a.z;
    return x * x + y * y + z * z;
  }

  /**
   * 判断两个三维向量的值是否相等。
   * @param a - 向量
   * @param b - 向量
   * @returns 两个向量是否相等，是返回 true，否则返回 false
   */
  static equals(a: Vector3, b: Vector3): boolean {
    return MathUtil.equals(a.x, b.x) && MathUtil.equals(a.y, b.y) && MathUtil.equals(a.z, b.z);
  }

  /**
   * 插值三维向量。
   * @param a - 左向量
   * @param b - 右向量
   * @param t - 插值比例
   * @param out - 插值结果
   */
  static lerp(a: Vector3, b: Vector3, t: number, out: Vector3): void {
    const { x, y, z } = a;
    out.x = x + (b.x - x) * t;
    out.y = y + (b.y - y) * t;
    out.z = z + (b.z - z) * t;
  }

  /**
   * 分别取两个三维向量x、y的最大值计算新的三维向量。
   * @param a - 向量
   * @param b - 向量
   * @param out - 结果向量
   */
  static max(a: Vector3, b: Vector3, out: Vector3): void {
    out.x = Math.max(a.x, b.x);
    out.y = Math.max(a.y, b.y);
    out.z = Math.max(a.z, b.z);
  }

  /**
   * 分别取两个三维向量x、y的最小值计算新的三维向量。
   * @param a - 向量
   * @param b - 向量
   * @param out - 结果向量
   */
  static min(a: Vector3, b: Vector3, out: Vector3): void {
    out.x = Math.min(a.x, b.x);
    out.y = Math.min(a.y, b.y);
    out.z = Math.min(a.z, b.z);
  }

  /**
   * 将向量a反转，并将结果输出到out。
   * @param a - 向量
   * @param out - 向量反转的结果
   */
  static negate(a: Vector3, out: Vector3): void {
    out.x = -a.x;
    out.y = -a.y;
    out.z = -a.z;
  }

  /**
   * 将向量a归一化，并将结果输出到out。
   * @param a - 向量
   * @param out - 向量归一化的结果
   */
  static normalize(a: Vector3, out: Vector3): void {
    const { x, y, z } = a;
    let len: number = x * x + y * y + z * z;
    if (len > MathUtil.ZeroTolerance) {
      len = 1 / Math.sqrt(len);
      out.x = x * len;
      out.y = y * len;
      out.z = z * len;
    }
  }

  /**
   * 将向量a投影到向p上。
   * @param a - 要投影的向量
   * @param p - 目标向量
   * @param out - 向量a投影到向量p的结果向量
   */
  static projectOnVector(a: Vector3, p: Vector3, out: Vector3): void {
    const n_p = p.clone();
    Vector3.normalize(n_p, n_p);
    const cosine = Vector3.dot(a, n_p);
    out.x = n_p.x * cosine;
    out.y = n_p.y * cosine;
    out.z = n_p.z * cosine;
  }

  /**
   * 将向量a投影到和法向量n正交的平面上。
   * @param a - 输入向量
   * @param n - 法向量
   * @param out - 投影到平面上的向量
   */
  static projectOnPlane(a: Vector3, n: Vector3, out: Vector3): void {
    Vector3.projectOnVector(a, n, Vector3._tempVector3);
    Vector3.subtract(a, Vector3._tempVector3, out);
  }

  /**
   * 将向量a缩放，并将结果输出到out。
   * @param a - 向量
   * @param s - 缩放因子
   * @param out - 向量缩放的结果
   */
  static scale(a: Vector3, s: number, out: Vector3): void {
    out.x = a.x * s;
    out.y = a.y * s;
    out.z = a.z * s;
  }

  /**
   * 通过3x3矩阵将一个三维向量转换到另一个三维向量。
   * @param a - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static transformMat3x3(a: Vector3, m: Matrix3x3, out: Vector3): void {
    const { x, y, z } = a;
    const e = m.elements;
    out.x = x * e[0] + y * e[3] + z * e[6];
    out.y = x * e[1] + y * e[4] + z * e[7];
    out.z = x * e[2] + y * e[5] + z * e[8];
  }

  /**
   * 通过4x4矩阵将一个三维向量转换到另一个三维向量。
   * @param a - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static transformMat4x4(a: Vector3, m: Matrix4x4, out: Vector3): void {
    const { x, y, z } = a;
    const e = m.elements;
    let w = x * e[3] + y * e[7] + z * e[11] + e[15];
    w = w || 1.0;

    out.x = (x * e[0] + y * e[4] + z * e[8] + e[12]) / w;
    out.y = (x * e[1] + y * e[5] + z * e[9] + e[13]) / w;
    out.z = (x * e[2] + y * e[6] + z * e[10] + e[14]) / w;
  }

  /**
   * 通过四元数将一个三维向量转换到另一个三维向量。
   * @param a - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static transformQuat(a: Vector3, q: Quaternion, out: Vector3): void {
    const { x, y, z } = a;
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
  }

  /** 向量的X分量 */
  x: number;
  /** 向量的Y分量 */
  y: number;
  /** 向量的Z分量 */
  z: number;

  /**
   * 创建一个Vector3实例。
   * @param x - 向量的X分量，默认值0
   * @param y - 向量的Y分量，默认值0
   * @param z - 向量的Z分量，默认值0
   */
  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * 设置x, y, z的值，并返回当前向量。
   * @param x - 向量的X分量
   * @param y - 向量的Y分量
   * @param z - 向量的Z分量
   * @returns 当前向量
   */
  setValue(x: number, y: number, z: number): Vector3 {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  /**
   * 创建一个新的三维向量，并用当前向量值初始化。
   * @returns 一个新的向量，并且拷贝当前向量的值
   */
  clone(): Vector3 {
    let ret = new Vector3(this.x, this.y, this.z);
    return ret;
  }

  /**
   * 将当前向量值拷贝给out向量。
   * @param out - 目标向量
   */
  cloneTo(out: Vector3): void {
    out.x = this.x;
    out.y = this.y;
    out.z = this.z;
  }

  /**
   * 将当前向量加上给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 当前向量
   */
  add(a: Vector3): Vector3 {
    this.x += a.x;
    this.y += a.y;
    this.z += a.z;
    return this;
  }

  /**
   * 将当前向量减去给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 当前向量
   */
  subtract(a: Vector3): Vector3 {
    this.x -= a.x;
    this.y -= a.y;
    this.z -= a.z;
    return this;
  }

  /**
   * 将当前向量乘以给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 当前向量
   */
  multiply(a: Vector3): Vector3 {
    this.x *= a.x;
    this.y *= a.y;
    this.z *= a.z;
    return this;
  }

  /**
   * 将当前向量除以给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 当前向量
   */
  divide(a: Vector3): Vector3 {
    this.x /= a.x;
    this.y /= a.y;
    this.z /= a.z;
    return this;
  }

  /**
   * 计算一个三维向量的标量长度。
   * @returns 当前向量的标量长度
   */
  length(): number {
    const { x, y, z } = this;
    return Math.sqrt(x * x + y * y + z * z);
  }

  /**
   * 计算一个三维向量的标量长度的平方。
   * @returns 当前向量的标量长度的平方
   */
  lengthSquared(): number {
    const { x, y, z } = this;
    return x * x + y * y + z * z;
  }

  /**
   * 当前向量反转，并返回。
   * @returns 当前向量
   */
  negate(): Vector3 {
    this.x *= -1;
    this.y *= -1;
    this.z *= -1;
    return this;
  }

  /**
   * 当前向量归一化，并返回。
   * @returns 当前向量
   */
  normalize(): Vector3 {
    const { x, y, z } = this;
    let len: number = x * x + y * y + z * z;
    if (len > MathUtil.ZeroTolerance) {
      len = 1 / Math.sqrt(len);
      this.x = x * len;
      this.y = y * len;
      this.z = z * len;
    }
    return this;
  }

  /**
   * 当前向量缩放，并返回。
   * @param s - 缩放因子
   * @returns 当前向量
   */
  scale(s: number): Vector3 {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }
}
