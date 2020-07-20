import { Matrix4x4 } from "./Matrix4x4";
import { Quaternion } from "./Quaternion";
import { Vector2 } from "./Vector2";

/**
 * 3x3矩阵
 */
export class Matrix3x3 {
  /** 矩阵元素数组 */
  elements: Float32Array;

  /**
   * 创建3x3矩阵实例 merge~create
   */
  constructor() {
    const e: Float32Array = (this.elements = new Float32Array(9));
    e[0] = 1;
    e[1] = 0;
    e[2] = 0;
    e[3] = 0;
    e[4] = 1;
    e[5] = 0;
    e[6] = 0;
    e[7] = 0;
    e[8] = 1;
  }

  /**
   * 给矩阵设置值，并返回当前值
   *
   * @param m00
   * @param m01
   * @param m02
   * @param m10
   * @param m11
   * @param m12
   * @param m20
   * @param m21
   * @param m22
   */
  setValue(
    m00: number,
    m01: number,
    m02: number,
    m10: number,
    m11: number,
    m12: number,
    m20: number,
    m21: number,
    m22: number
  ): Matrix3x3 {}

  /**
   * 创建一个新的三维矩阵，并用当前矩阵值初始化
   */
  clone(): Matrix3x3 {}

  /**
   * 将当前矩阵值拷贝给out矩阵 rename~copy
   *
   * @param out - 目标矩阵
   */
  cloneTo(out: Matrix3x3): void {}

  /**
   * 将当前矩阵加上给定的向量a，并返回当前矩阵
   *
   * @param a - 给定的向量
   */
  add(a: Matrix3x3): Matrix3x3 {}

  /**
   * 将当前矩阵减去给定的向量a，并返回当前矩阵
   *
   * @param a - 给定的向量
   */
  subtract(a: Matrix3x3): Matrix3x3 {}

  /**
   * 将当前矩阵乘以给定的向量a，并返回当前矩阵
   *
   * @param a - 给定的向量
   */
  multiply(a: Matrix3x3): Matrix3x3 {}

  /**
   * 将两个矩阵相加
   *
   * @param a - 矩阵
   * @param b - 矩阵
   * @param out - 矩阵相加的结果
   */
  static add(a: Matrix3x3, b: Matrix3x3, out: Matrix3x3): void {}

  /**
   * 将两个矩阵相减 merge~sub
   *
   * @param a - 矩阵
   * @param b - 矩阵
   * @param out - 矩阵相减的结果
   */
  static subtract(a: Matrix3x3, b: Matrix3x3, out: Matrix3x3): void {}

  /**
   * 将两个矩阵相乘 merge~mul
   *
   * @param a - 矩阵
   * @param b - 矩阵
   * @param out - 矩阵相乘的结果
   */
  static multiply(a: Matrix3x3, b: Matrix3x3, out: Matrix3x3): void {}

  /**
   * 计算3x3矩阵的行列式
   */
  determinant(): number {}

  /**
   * 判断两个三维矩阵的值是否相等 merge~exactEquals
   *
   * @param a - 矩阵
   * @param b - 矩阵
   */
  static equals(a: Matrix3x3, b: Matrix3x3): boolean {}

  /**
   * 从4x4矩阵转换为一个3x3矩阵，upper-left原则，即忽略第4行第4列
   *
   * @param a - 4x4矩阵
   * @param out - 转换后的3x3矩阵
   */
  static fromMat4(a: Matrix4x4, out: Matrix3x3): void {}

  /**
   * 从四元数转换为一个3x3矩阵
   *
   * @param q - 四元数
   * @param out - 转换后的3x3矩阵
   */
  static fromQuat(q: Quaternion, out: Matrix3x3): void {}

  /**
   * 通过指定旋转生成3x3矩阵
   *
   * @param rad - 旋转角度
   * @param out - 指定旋转后矩阵
   */
  static fromRotation(rad: number, out: Matrix3x3): void {}

  /**
   * 通过指定缩放生成3x3矩阵
   *
   * @param scale - 缩放向量
   * @param out - 指定缩放后矩阵
   */
  static fromScaling(scale: Vector2, out: Matrix3x3): void {}

  /**
   * 通过指定平移生成3x3矩阵
   *
   * @param trans - 平移向量
   * @param out - 指定平移后矩阵
   */
  static fromTranslation(trans: Vector2, out: Matrix3x3): void {}

  /**
   * 通过uvTransform设置矩阵
   *
   * @param uOffset - 纹理 u 方向的偏移
   * @param vOffset - 纹理 v 方向的偏移
   * @param uScale - 纹理 u 方向的缩放
   * @param vScale - 纹理 v 方向的缩放
   * @param rotation - 纹理旋转弧度 0～2*PI
   * @param center - 纹理中心点
   * @param out - 设置后的矩阵
   */
  static fromUvTransform(
    uOffset: number,
    vOffset: number,
    uScale: number,
    vScale: number,
    rotation: number,
    center: number[],
    out: Matrix3x3
  ): void {}

  /**
   * 将矩阵设置为单位矩阵，并返回
   */
  identity(): Matrix3x3 {}

  /**
   * 计算矩阵a的逆矩阵，并将结果输出到out
   *
   * @param a - 矩阵
   * @param out - 逆矩阵
   */
  static invert(a: Matrix3x3, out: Matrix3x3): void {}

  /**
   * 计算当前矩阵的逆矩阵，并返回
   */
  invert(): Matrix3x3 {}

  /**
   * 从4x4矩阵中计算出3x3法线矩阵
   *
   * @param a - 4x4矩阵
   * @param out - 计算出来的3x3法线矩阵
   */
  static normalFromMat4(a: Matrix4x4, out: Matrix3x3): void {}

  /**
   * 将矩阵a按给定角度旋转，并将结果输出到out
   *
   * @param a - 矩阵
   * @param rad - 给定的旋转角度
   * @param out - 旋转后的矩阵
   */
  static rotate(a: Matrix3x3, rad: number, out: Matrix3x3): void {}

  /**
   * 将当前矩阵按给定角度旋转，并返回
   *
   * @param rad - 给定的旋转角度
   */
  rotate(rad: number): Matrix3x3 {}

  /**
   * 将矩阵a按给定向量v缩放，并将结果输出到out
   *
   * @param a - 矩阵
   * @param v - 缩放向量
   * @param out - 缩放后的矩阵
   */
  static scale(a: Matrix3x3, v: Vector2, out: Matrix3x3): void {}

  /**
   * 将当前矩阵按给定向量v缩放，并返回
   *
   * @param v
   */
  scale(v: Vector2): Matrix3x3 {}

  /**
   * 将矩阵a按给定向量v转换，并将结果输出到out
   *
   * @param a - 矩阵
   * @param v - 转换向量
   * @param out - 转换后的结果
   */
  static translate(a: Matrix3x3, v: Vector2, out: Matrix3x3): void {}

  /**
   * 将当前矩阵按给定向量v转换，并返回
   *
   * @param v - 转换向量
   */
  translate(v: Vector2): Matrix3x3 {}

  /**
   * 计算矩阵a的转置矩阵，并将结果输出到out
   *
   * @param a - 矩阵
   * @param out - 转置矩阵
   */
  static transpose(a: Matrix3x3, out: Matrix3x3): void {}

  /**
   * 计算当前矩阵的转置矩阵，并返回
   */
  transpose(): Matrix3x3 {}
}
