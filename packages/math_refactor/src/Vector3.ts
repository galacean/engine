import { Matrix3x3 } from "./Matrix3x3";
import { Matrix4x4 } from "./Matrix4x4";
import { Quaternion } from "./Quaternion";

/**
 * 三维向量
 */
export class Vector3 {
  /** @internal 零向量，readonly */
  static Zero = new Vector3(0.0, 0.0, 0.0);
  /** @internal 一向量，readonly */
  static One = new Vector3(1.0, 1.0, 1.0);

  /** X轴坐标 */
  x: number;
  /** Y轴坐标 */
  y: number;
  /** Z轴坐标 */
  z: number;

  /**
   * 创建一个Vector3实例 merge~fromValues
   *
   * @param x - X轴坐标
   * @param y - Y轴坐标
   * @param z - Z轴坐标
   */
  constructor(x: number = 0, y: number = 0, z: number = 0) {}

  /**
   * 设置x, y, z的值，并返回当前向量
   *
   * @param x - X轴坐标
   * @param y - Y轴坐标
   * @param z - Z轴坐标
   */
  setValue(x: number, y: number, z: number): Vector3 {}

  /**
   * 创建一个新的三维向量，并用当前向量值初始化
   */
  clone(): Vector3 {}

  /**
   * 将当前向量值拷贝给out向量 rename~copy
   *
   * @param out - 目标向量
   */
  cloneTo(out: Vector3): void {}

  /**
   * 将当前向量加上给定的向量a，并返回当前向量
   *
   * @param a - 给定的向量
   */
  add(a: Vector3): Vector3 {}

  /**
   * 将当前向量减去给定的向量a，并返回当前向量
   *
   * @param a - 给定的向量
   */
  subtract(a: Vector3): Vector3 {}

  /**
   * 将当前向量乘以给定的向量a，并返回当前向量
   *
   * @param a - 给定的向量
   */
  multiply(a: Vector3): Vector3 {}

  /**
   * 将当前向量除以给定的向量a，并返回当前向量
   *
   * @param a - 给定的向量
   */
  divide(a: Vector3): Vector3 {}

  /**
   * 将两个向量相加
   *
   * @param a - 向量
   * @param b - 向量
   * @param out - 向量相加结果
   */
  static add(a: Vector3, b: Vector3, out: Vector3): void {}

  /**
   * 将两个向量相减 merge~sub
   *
   * @param a - 做向量
   * @param b - 右向量
   * @param out - 两个三维向量的相减结果
   */
  static subtract(a: Vector3, b: Vector3, out: Vector3): void {}

  /**
   * 将两个向量相乘 merge~mul
   *
   * @param a - 做向量
   * @param b - 右向量
   * @param out - 两个三维向量的相乘结果
   */
  static multiply(a: Vector3, b: Vector3, out: Vector3): void {}

  /**
   * 将两个三维向量相除 merge~div
   *
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个三维向量的相除结果
   */
  static divide(a: Vector3, b: Vector3, out: Vector3): void {}

  /**
   * 计算两个三维向量的角度
   *
   * @param a - 向量
   * @param b - 向量
   */
  static angle(a: Vector3, b: Vector3): number {}

  /**
   * 计算两个三维向量的点积
   *
   * @param a - 左向量
   * @param b - 右向量
   */
  static dot(a: Vector3, b: Vector3): number {}

  /**
   * 计算两个三维向量的叉乘
   *
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个三维向量的叉乘结果
   */
  static cross(a: Vector3, b: Vector3, out: Vector3): void {}

  /**
   * 计算两个三维向量的距离 merge~dist
   *
   * @param a - 向量
   * @param b - 向量
   */
  static distance(a: Vector3, b: Vector3): number {}

  /**
   * 计算两个三维向量的距离的平方 merge~sqrDist rename~squaredDistance
   *
   * @param a - 向量
   * @param b - 向量
   */
  static distanceSquared(a: Vector3, b: Vector3): number {}

  /**
   * 判断两个三维向量的值是否相等 merge~exactEquals
   *
   * @param a - 向量
   * @param b - 向量
   */
  static equals(a: Vector3, b: Vector3): boolean {}

  /**
   * 计算一个三维向量的标量长度 merge～len
   *
   * @param a - 向量
   */
  length(): number {}

  /**
   * 计算一个三维向量的标量长度的平方 merge~sqrLen rename~squaredLength
   */
  lengthSquared(): number {}

  /**
   * 插值三维向量
   *
   * @param a - 左向量
   * @param b - 右向量
   * @param t - 插值比例
   * @param out - 插值结果
   */
  static lerp(a: Vector3, b: Vector3, t: number, out: Vector3): void {}

  /**
   * 分别取两个三维向量x、y的最大值计算新的三维向量
   *
   * @param a - 向量
   * @param b - 向量
   * @param out - 结果向量
   */
  static max(a: Vector3, b: Vector3, out: Vector3): void {}

  /**
   * 分别取两个三维向量x、y的最小值计算新的三维向量
   *
   * @param a - 向量
   * @param b - 向量
   * @param out - 结果向量
   */
  static min(a: Vector3, b: Vector3, out: Vector3): void {}

  /**
   * 将向量a取反，并将结果输出到out
   *
   * @param a - 向量
   * @param out - 向量取反的结果
   */
  static negate(a: Vector3, out: Vector3): void {}

  /**
   * 当前向量取反，并返回
   */
  negate(): Vector3 {}

  /**
   * 将向量a归一化，并将结果输出到out
   *
   * @param a - 向量
   * @param out - 向量归一化的结果
   */
  static normalize(a: Vector3, out: Vector3): void {}

  /**
   * 当前向量归一化，并返回
   */
  normalize(): Vector3 {}

  /**
   * 将向量a投影到和法向量n正交的平面上
   *
   * @param a - 输入向量
   * @param n - 法向量
   * @param out - 投影到平面上的向量
   */
  static projectOnPlane(a: Vector3, n: Vector3, out: Vector3): void {}

  /**
   * 将向量a投影到向p上
   *
   * @param a - 要投影的向量
   * @param p - 目标向量
   * @param out - 向量a投影到向量p的结果向量
   */
  static projectOnVector(a: Vector3, p: Vector3, out: Vector3): void {}

  /**
   * 将向量a缩放，并将结果输出到out
   *
   * @param a - 向量
   * @param scale - 缩放因子
   * @param out - 向量缩放的结果
   */
  static scale(a: Vector3, scale: number, out: Vector3): void {}

  /**
   * 当前向量缩放，并返回
   *
   * @param scale - 缩放因子
   */
  scale(scale: number): Vector3 {}

  /**
   * 通过3x3矩阵将一个三维向量转换到另一个三维向量
   *
   * @param a - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static transformMat3x3(a: Vector3, m: Matrix3x3, out: Vector3): void {}

  /**
   * 通过4x4矩阵将一个三维向量转换到另一个三维向量
   *
   * @param a - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static transformMat4x4(a: Vector3, m: Matrix4x4, out: Vector3): void {}

  /**
   * 通过四元数将一个三维向量转换到另一个三维向量
   *
   * @param a - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static trnasformQuat(a: Vector3, q: Quaternion, out: Vector3): void {}
}
