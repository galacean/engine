import { Matrix4x4 } from "./Matrix4x4";
import { Quaternion } from "./Quaternion";

/**
 * 四维向量
 */
export class Vector4 {
  /** @internal 零向量，readonly */
  static Zero = new Vector4(0.0, 0.0, 0.0, 0.0);
  /** @internal 一向量，readonly */
  static One = new Vector4(1.0, 1.0, 1.0, 1.0);

  /** X轴坐标 */
  x: number;
  /** Y轴坐标 */
  y: number;
  /** Z轴坐标 */
  z: number;
  /** W轴坐标 */
  w: number;

  /**
   * 创建一个Vector4实例 merge~fromValues
   *
   * @param x - X轴坐标
   * @param y - Y轴坐标
   * @param z - Z轴坐标
   * @param w - W轴坐标
   */
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 0) {}

  /**
   * 设置x, y, z, w的值，并返回当前向量
   *
   * @param x - X轴坐标
   * @param y - Y轴坐标
   * @param z - Z轴坐标
   * @param w - W轴坐标
   */
  setValue(x: number, y: number, z: number, w: number): Vector4 {}

  /**
   * 创建一个新的四维向量，并用当前向量值初始化
   */
  clone(): Vector4 {}

  /**
   * 将当前向量值拷贝给out向量 rename~copy
   *
   * @param out - 目标向量
   */
  cloneTo(out: Vector4): void {}

  /**
   * 将当前向量加上给定的向量a，并返回当前向量
   *
   * @param a - 给定的向量
   */
  add(a: Vector4): Vector4 {}

  /**
   * 将当前向量减去给定的向量a，并返回当前向量
   *
   * @param a - 给定的向量
   */
  subtract(a: Vector4): Vector4 {}

  /**
   * 将当前向量乘以给定的向量a，并返回当前向量
   *
   * @param a - 给定的向量
   */
  multiply(a: Vector4): Vector4 {}

  /**
   * 将当前向量除以给定的向量a，并返回当前向量
   *
   * @param a - 给定的向量
   */
  divide(a: Vector4): Vector4 {}

  /**
   * 将两个向量相加
   *
   * @param a - 向量
   * @param b - 向量
   * @param out - 向量相加结果
   */
  static add(a: Vector4, b: Vector4, out: Vector4): void {}

  /**
   * 将两个向量相减 merge~sub
   *
   * @param a - 做向量
   * @param b - 右向量
   * @param out - 两个四维向量的相减结果
   */
  static subtract(a: Vector4, b: Vector4, out: Vector4): void {}

  /**
   * 将两个向量相乘 merge~mul
   *
   * @param a - 做向量
   * @param b - 右向量
   * @param out - 两个四维向量的相乘结果
   */
  static multiply(a: Vector4, b: Vector4, out: Vector4): void {}

  /**
   * 将两个四维向量相除 merge~div
   *
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个四维向量的相除结果
   */
  static divide(a: Vector4, b: Vector4, out: Vector4): void {}

  /**
   * 计算两个四维向量的点积
   *
   * @param a - 左向量
   * @param b - 右向量
   */
  static dot(a: Vector4, b: Vector4): number {}

  /**
   * 计算两个四维向量的叉乘
   *
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个四维向量的叉乘结果
   */
  static cross(a: Vector4, b: Vector4, out: Vector4): void {}

  /**
   * 计算两个四维向量的距离 merge~dist
   *
   * @param a - 向量
   * @param b - 向量
   */
  static distance(a: Vector4, b: Vector4): number {}

  /**
   * 计算两个四维向量的距离的平方 merge~sqrDist rename~squaredDistance
   *
   * @param a - 向量
   * @param b - 向量
   */
  static distanceSquared(a: Vector4, b: Vector4): number {}

  /**
   * 判断两个四维向量的值是否相等 merge~exactEquals
   *
   * @param a - 向量
   * @param b - 向量
   */
  static equals(a: Vector4, b: Vector4): boolean {}

  /**
   * 计算一个四维向量的标量长度 merge～len
   */
  length(): number {}

  /**
   * 计算一个四维向量的标量长度的平方 merge~sqrLen rename~squaredLength
   */
  lengthSquared(): number {}

  /**
   * 插值四维向量
   *
   * @param a - 左向量
   * @param b - 右向量
   * @param t - 插值比例
   * @param out - 插值结果
   */
  static lerp(a: Vector4, b: Vector4, t: number, out: Vector4): void {}

  /**
   * 分别取两个四维向量x、y的最大值计算新的四维向量
   *
   * @param a - 向量
   * @param b - 向量
   * @param out - 结果向量
   */
  static max(a: Vector4, b: Vector4, out: Vector4): void {}

  /**
   * 分别取两个四维向量x、y的最小值计算新的四维向量
   *
   * @param a - 向量
   * @param b - 向量
   * @param out - 结果向量
   */
  static min(a: Vector4, b: Vector4, out: Vector4): void {}

  /**
   * 将向量a取反，并将结果输出到out
   *
   * @param a - 向量
   * @param out - 向量取反的结果
   */
  static negate(a: Vector4, out: Vector4): void {}

  /**
   * 当前向量取反，并返回
   */
  negate(): Vector4 {}

  /**
   * 将向量a归一化，并将结果输出到out
   *
   * @param a - 向量
   * @param out - 向量归一化的结果
   */
  static normalize(a: Vector4, out: Vector4): void {}

  /**
   * 当前向量归一化，并返回
   */
  normalize(): Vector4 {}

  /**
   * 将向量a缩放，并将结果输出到out
   *
   * @param a - 向量
   * @param scale - 缩放因子
   * @param out - 向量缩放的结果
   */
  static scale(a: Vector4, scale: number, out: Vector4): void {}

  /**
   * 当前向量缩放，并返回
   *
   * @param scale - 缩放因子
   */
  scale(scale: number): Vector4 {}

  /**
   * 通过4x4矩阵将一个四维向量转换到另一个四维向量
   *
   * @param a - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static transformMat4x4(a: Vector4, m: Matrix4x4, out: Vector4): void {}

  /**
   * 通过四元数将一个四维向量转换到另一个四维向量
   *
   * @param a - 向量
   * @param m - 转换矩阵
   * @param out - 通过矩阵转换后的向量
   */
  static trnasformQuat(a: Vector4, q: Quaternion, out: Vector4): void {}
}
