import { IClone } from "@oasis-engine/design";
import { MathUtil } from "./MathUtil";
import { Matrix } from "./Matrix";
import { Quaternion } from "./Quaternion";
import { Vector4 } from "./Vector4";

/**
 * 三维向量。
 */
export class Vector3 implements IClone {
  /** @internal 零向量。*/
  static readonly _zero = new Vector3(0.0, 0.0, 0.0);
  /** @internal 一向量。*/
  static readonly _one = new Vector3(1.0, 1.0, 1.0);
  /** @internal */
  static readonly _tempVector3 = new Vector3();

  /**
   * 将两个向量相加。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 向量相加结果
   */
  static add(left: Vector3, right: Vector3, out: Vector3): void {
    out.x = left.x + right.x;
    out.y = left.y + right.y;
    out.z = left.z + right.z;
  }

  /**
   * 将两个向量相减。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 两个三维向量的相减结果
   */
  static subtract(left: Vector3, right: Vector3, out: Vector3): void {
    out.x = left.x - right.x;
    out.y = left.y - right.y;
    out.z = left.z - right.z;
  }

  /**
   * 将两个向量相乘。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 两个三维向量的相乘结果
   */
  static multiply(left: Vector3, right: Vector3, out: Vector3): void {
    out.x = left.x * right.x;
    out.y = left.y * right.y;
    out.z = left.z * right.z;
  }

  /**
   * 将两个三维向量相除。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 两个三维向量的相除结果
   */
  static divide(left: Vector3, right: Vector3, out: Vector3): void {
    out.x = left.x / right.x;
    out.y = left.y / right.y;
    out.z = left.z / right.z;
  }

  /**
   * 计算两个三维向量的点积。
   * @param left - 左向量
   * @param right - 右向量
   * @returns 两个向量的点积
   */
  static dot(left: Vector3, right: Vector3): number {
    return left.x * right.x + left.y * right.y + left.z * right.z;
  }

  /**
   * 计算两个三维向量的叉乘。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 两个三维向量的叉乘结果
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
   * @param left - 向量
   * @param right - 向量
   * @returns 两个向量是否相等，是返回 true，否则返回 false
   */
  static equals(left: Vector3, right: Vector3): boolean {
    return MathUtil.equals(left.x, right.x) && MathUtil.equals(left.y, right.y) && MathUtil.equals(left.z, right.z);
  }

  /**
   * 插值三维向量。
   * @param start - 向量
   * @param end - 向量
   * @param t - 插值比例
   * @param out - 插值结果
   */
  static lerp(start: Vector3, end: Vector3, t: number, out: Vector3): void {
    const { x, y, z } = start;
    out.x = x + (end.x - x) * t;
    out.y = y + (end.y - y) * t;
    out.z = z + (end.z - z) * t;
  }

  /**
   * 分别取两个三维向量 x、y 的最大值计算新的三维向量。
   * @param left - 向量
   * @param right - 向量
   * @param out - 结果向量
   */
  static max(left: Vector3, right: Vector3, out: Vector3): void {
    out.x = Math.max(left.x, right.x);
    out.y = Math.max(left.y, right.y);
    out.z = Math.max(left.z, right.z);
  }

  /**
   * 分别取两个三维向量 x、y 的最小值计算新的三维向量。
   * @param left - 向量
   * @param right - 向量
   * @param out - 结果向量
   */
  static min(left: Vector3, right: Vector3, out: Vector3): void {
    out.x = Math.min(left.x, right.x);
    out.y = Math.min(left.y, right.y);
    out.z = Math.min(left.z, right.z);
  }

  /**
   * 将向量 a 反转的结果输出到 out。
   * @param a - 向量
   * @param out - 向量反转的结果
   */
  static negate(a: Vector3, out: Vector3): void {
    out.x = -a.x;
    out.y = -a.y;
    out.z = -a.z;
  }

  /**
   * 将向量 a 归一化的结果输出到 out。
   * @param a - 向量
   * @param out - 向量归一化的结果
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
   * 将向量 a 缩放的结果输出到 out。
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
   * 通过4x4矩阵将一个三维向量进行法线转换到另一个三维向量。
   * @remarks
   * 法线变换假设 w 分量为零，这导致矩阵的第四行和第四列并不使用。
   * 最终得出的结果是一个没有位置变换的向量，但是其他变换属性均被应用。
   * 通常这对法线向量来说比较友好，因为法线向量纯粹代表方向。
   * @param v - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static transformNormal(v: Vector3, m: Matrix, out: Vector3): void {
    const { x, y, z } = v;
    const e = m.elements;
    out.x = x * e[0] + y * e[4] + z * e[8];
    out.y = x * e[1] + y * e[5] + z * e[9];
    out.z = x * e[2] + y * e[6] + z * e[10];
  }

  /**
   * 通过4x4矩阵将一个三维向量转换到另一个三维向量。
   * @param v - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static transformToVec3(v: Vector3, m: Matrix, out: Vector3): void {
    const { x, y, z } = v;
    const e = m.elements;

    out.x = x * e[0] + y * e[4] + z * e[8] + e[12];
    out.y = x * e[1] + y * e[5] + z * e[9] + e[13];
    out.z = x * e[2] + y * e[6] + z * e[10] + e[14];
  }

  /**
   * 通过4x4矩阵将一个三维向量转换到一个四维向量。
   * @param v - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
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
   * 通过4x4矩阵将一个三维向量转换到另一个三维向量。
   *
   * @remarks
   * 坐标变换价值 w 分量为一，从变换得到的四维向量的每个分量都除以 w 分量。
   * 这导致变换结果的 w 分量为一,向量变为齐次向量。
   * 齐次向量在坐标变换中使用，w 分量可以安全的忽略。
   *
   * @param v - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量，此向量为齐次
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
   * 通过四元数将一个三维向量转换到另一个三维向量。
   * @param v - 向量
   * @param q - 四元数
   * @param out - 通过矩阵转换后的向量
   */
  static transformByQuat(v: Vector3, q: Quaternion, out: Vector3): void {
    const { x, y, z } = v;
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

  /** 向量的 X 分量。*/
  x: number;
  /** 向量的 Y 分量。*/
  y: number;
  /** 向量的 Z 分量。*/
  z: number;

  /**
   * 创建一个 Vector3 实例。
   * @param x - 向量的 X 分量，默认值 0
   * @param y - 向量的 Y 分量，默认值 0
   * @param z - 向量的 Z 分量，默认值 0
   */
  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * 设置 x, y, z 的值，并返回当前向量。
   * @param x - 向量的 X 分量
   * @param y - 向量的 Y 分量
   * @param z - 向量的 Z 分量
   * @returns 当前向量
   */
  setValue(x: number, y: number, z: number): Vector3 {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  /**
   * 通过数组设置值，并返回当前向量。
   * @param array - 数组
   * @param offset - 数组偏移
   * @returns 当前向量
   */
  setValueByArray(array: ArrayLike<number>, offset: number = 0): Vector3 {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    return this;
  }

  /**
   * 将当前向量加上给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  add(right: Vector3): Vector3 {
    this.x += right.x;
    this.y += right.y;
    this.z += right.z;
    return this;
  }

  /**
   * 将当前向量减去给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  subtract(right: Vector3): Vector3 {
    this.x -= right.x;
    this.y -= right.y;
    this.z -= right.z;
    return this;
  }

  /**
   * 将当前向量乘以给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  multiply(right: Vector3): Vector3 {
    this.x *= right.x;
    this.y *= right.y;
    this.z *= right.z;
    return this;
  }

  /**
   * 将当前向量除以给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  divide(right: Vector3): Vector3 {
    this.x /= right.x;
    this.y /= right.y;
    this.z /= right.z;
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
   * 向量反转。
   * @returns 当前向量
   */
  negate(): Vector3 {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  /**
   * 向量归一化。
   * @returns 当前向量
   */
  normalize(): Vector3 {
    Vector3.normalize(this, this);
    return this;
  }

  /**
   * 向量缩放。
   * @param s - 缩放因子
   * @returns 当前向量
   */
  scale(s: number): Vector3 {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
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
  }

  /**
   * 克隆并返回一个新的三维向量对象。
   * @returns 新的三维向量对象
   */
  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  /**
   * 将当前向量值拷贝给 out 向量。
   * @param out - 目标向量
   */
  cloneTo(out: Vector3): Vector3 {
    out.x = this.x;
    out.y = this.y;
    out.z = this.z;
    return out;
  }

  /**
   * 通过4x4矩阵将当前向量转换。
   * @remarks
   * 法线变换假设 w 分量为零，这导致矩阵的第四行和第四列并不使用。
   * 最终得出的结果是一个没有位置变换的向量，但是其他变换属性均被应用。
   * 通常这对法线向量来说比较友好，因为法线向量纯粹代表方向。
   * @param m - 转换矩阵
   * @returns 当前向量
   */
  transformNormal(m: Matrix): Vector3 {
    Vector3.transformNormal(this, m, this);
    return this;
  }

  /**
   * 通过4x4矩阵将当前向量转换。
   * @param m - 转换矩阵
   * @returns 当前向量
   */
  transformToVec3(m: Matrix): Vector3 {
    Vector3.transformToVec3(this, m, this);
    return this;
  }

  /**
   * 通过4x4矩阵将当前向量转换。
   * @remarks
   * 坐标变换价值 w 分量为一，从变换得到的四维向量的每个分量都除以 w 分量。
   * 这导致变换结果的 w 分量为一,向量变为齐次向量。
   * 齐次向量在坐标变换中使用，w 分量可以安全的忽略。

   * @param m - 转换矩阵
   * @returns 当前向量
   */
  transformCoordinate(m: Matrix): Vector3 {
    Vector3.transformCoordinate(this, m, this);
    return this;
  }

  /**
   * 通过四元数将当前向量转换。
   * @param q - 四元数
   * @param out - 通过矩阵转换后的向量
   */
  transformByQuat(q: Quaternion): Vector3 {
    Vector3.transformByQuat(this, q, this);
    return this;
  }
}
