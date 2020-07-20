import { Quaternion } from "./Quaternion";
import { Vector3 } from "./Vector3";

/**
 * 4x4矩阵
 */
export class Matrix4x4 {
  /**
   * 将两个矩阵相加
   *
   * @param a - 矩阵
   * @param b - 矩阵
   * @param out - 矩阵相加的结果
   */
  static add(a: Matrix4x4, b: Matrix4x4, out: Matrix4x4): void {}

  /**
   * 将两个矩阵相减 merge~sub
   *
   * @param a - 矩阵
   * @param b - 矩阵
   * @param out - 矩阵相减的结果
   */
  static subtract(a: Matrix4x4, b: Matrix4x4, out: Matrix4x4): void {}

  /**
   * 将两个矩阵相乘 merge~mul
   *
   * @param a - 矩阵
   * @param b - 矩阵
   * @param out - 矩阵相乘的结果
   */
  static multiply(a: Matrix4x4, b: Matrix4x4, out: Matrix4x4): void {}

  /**
   * 判断两个四维矩阵的值是否相等 merge~exactEquals
   *
   * @param a - 矩阵
   * @param b - 矩阵
   */
  static equals(a: Matrix4x4, b: Matrix4x4): boolean {}

  /**
   * 从四元数转换为一个4x4矩阵
   *
   * @param q - 四元数
   * @param out - 转换后的4x4矩阵
   */
  static fromQuat(q: Quaternion, out: Matrix4x4): void {}

  /**
   * 通过指定旋转生成4x4矩阵
   *
   * @param rad - 旋转角度
   * @param out - 指定旋转后矩阵
   */
  static fromRotation(rad: number, out: Matrix4x4): void {}

  /**
   * 通过指定的旋转四元数,转换向量生成4x4矩阵
   *
   * @param q - 旋转四元数
   * @param v - 转换向量
   * @param out - 生成的4x4矩阵
   */
  static fromRotationTranslation(q: Quaternion, trans: Vector3, out: Matrix4x4): void {}

  /**
   * 通过指定的旋转四元数,转换向量,缩放向量生成4x4矩阵
   *
   * @param q - 旋转四元数
   * @param trans - 转换向量
   * @param scale - 缩放向量
   * @param out - 生成的4x4矩阵
   */
  static fromRotationTranslationScale(q: Quaternion, trans: Vector3, scale: Vector3, out: Matrix4x4): void {}

  /**
   * 通过指定的旋转四元数,转换向量,缩放向量,原点向量生成4x4矩阵
   *
   * @param q - 旋转四元数
   * @param trans - 转换向量
   * @param scale - 缩放向量
   * @param origin - 原点向量
   * @param out - 生成的4x4矩阵
   */
  static fromRotationTranslationScaleOrigin(
    q: Quaternion,
    trans: Vector3,
    scale: Vector3,
    origin: Vector3,
    out: Matrix4x4
  ): void {}

  /**
   * 通过指定缩放生成4x4矩阵
   *
   * @param scale - 缩放向量
   * @param out - 指定缩放后矩阵
   */
  static fromScaling(scale: Vector3, out: Matrix4x4): void {}

  /**
   * 通过指定平移生成4x4矩阵
   *
   * @param trans - 平移向量
   * @param out - 指定平移后矩阵
   */
  static fromTranslation(trans: Vector3, out: Matrix4x4): void {}

  /**
   * 计算矩阵a的逆矩阵，并将结果输出到out
   *
   * @param a - 矩阵
   * @param out - 逆矩阵
   */
  static invert(a: Matrix4x4, out: Matrix4x4): void {}

  /**
   * 计算观察矩阵
   *
   * @param eye - 观察者视点位置
   * @param center - 视点目标
   * @param up - 向上向量
   * @param out - 观察矩阵
   */
  static lookAt(eye: Vector3, center: Vector3, up: Vector3, out: Matrix4x4): void {}

  /**
   * 计算观察矩阵
   *
   * @param eye - 观察者视点位置
   * @param target - 视点目标
   * @param up - 向上向量
   * @param out - 观察矩阵
   */
  static lookAtR(eye: Vector3, target: Vector3, up: Vector3, out: Matrix4x4): void {}

  /**
   * 计算正交投影矩阵
   *
   * @param left - 视锥左边界
   * @param right - 视锥右边界
   * @param bottom - 视锥底边界
   * @param top - 视锥顶边界
   * @param near - 视锥近边界
   * @param far - 视锥远边界
   * @param out - 正交投影矩阵
   */
  static ortho(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
    out: Matrix4x4
  ): void {}

  /**
   * 计算透视投影矩阵
   *
   * @param fovy - 视角
   * @param aspect - 视图的宽高比
   * @param near - 近裁面
   * @param far - 远裁面
   * @param out - 透视投影矩阵
   */
  static perspective(fovy: number, aspect: number, near: number, far: number, out: Matrix4x4): void {}

  /**
   * 将矩阵a按给定角度旋转，并将结果输出到out
   *
   * @param a - 矩阵
   * @param rad - 给定的旋转角度
   * @param axis - 旋转轴
   * @param out - 旋转后的矩阵
   */
  static rotate(a: Matrix4x4, rad: number, axis: Vector3, out: Matrix4x4): void {}

  /**
   * 将矩阵a按给定向量v缩放，并将结果输出到out
   *
   * @param a - 矩阵
   * @param v - 缩放向量
   * @param out - 缩放后的矩阵
   */
  static scale(a: Matrix4x4, v: Vector3, out: Matrix4x4): void {}

  /**
   * 将矩阵a按给定向量v转换，并将结果输出到out
   *
   * @param a - 矩阵
   * @param v - 转换向量
   * @param out - 转换后的结果
   */
  static translate(a: Matrix4x4, v: Vector3, out: Matrix4x4): void {}

  /**
   * 计算矩阵a的转置矩阵，并将结果输出到out
   *
   * @param a - 矩阵
   * @param out - 转置矩阵
   */
  static transpose(a: Matrix4x4, out: Matrix4x4): void {}

  /** 矩阵元素数组 */
  elements: Float32Array;

  /**
   * 创建4x4矩阵实例 merge~create,fromValues
   */
  constructor(
    m11: number = 1,
    m12: number = 0,
    m13: number = 0,
    m14: number = 0,
    m21: number = 0,
    m22: number = 1,
    m23: number = 0,
    m24: number = 0,
    m31: number = 0,
    m32: number = 0,
    m33: number = 1,
    m34: number = 0,
    m41: number = 0,
    m42: number = 0,
    m43: number = 0,
    m44: number = 1,
    elements: Float32Array = null
  ) {
    const e: Float32Array = elements ? (this.elements = elements) : (this.elements = new Float32Array(16));
    e[0] = m11;
    e[1] = m12;
    e[2] = m13;
    e[3] = m14;
    e[4] = m21;
    e[5] = m22;
    e[6] = m23;
    e[7] = m24;
    e[8] = m31;
    e[9] = m32;
    e[10] = m33;
    e[11] = m34;
    e[12] = m41;
    e[13] = m42;
    e[14] = m43;
    e[15] = m44;
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
    m11: number = 1,
    m12: number = 0,
    m13: number = 0,
    m14: number = 0,
    m21: number = 0,
    m22: number = 1,
    m23: number = 0,
    m24: number = 0,
    m31: number = 0,
    m32: number = 0,
    m33: number = 1,
    m34: number = 0,
    m41: number = 0,
    m42: number = 0,
    m43: number = 0,
    m44: number = 1
  ): Matrix4x4 {}

  /**
   * 创建一个新的四维矩阵，并用当前矩阵值初始化
   */
  clone(): Matrix4x4 {}

  /**
   * 将当前矩阵值拷贝给out矩阵 rename~copy
   *
   * @param out - 目标矩阵
   */
  cloneTo(out: Matrix4x4): void {}

  /**
   * 将当前矩阵加上给定的向量a，并返回当前矩阵
   *
   * @param a - 给定的向量
   */
  add(a: Matrix4x4): Matrix4x4 {}

  /**
   * 将当前矩阵减去给定的向量a，并返回当前矩阵
   *
   * @param a - 给定的向量
   */
  subtract(a: Matrix4x4): Matrix4x4 {}

  /**
   * 将当前矩阵乘以给定的向量a，并返回当前矩阵
   *
   * @param a - 给定的向量
   */
  multiply(a: Matrix4x4): Matrix4x4 {}

  /**
   * 将矩阵分解为平移向量、旋转四元数、缩放向量
   *
   * @param position - 平移向量
   * @param quat - 旋转四元数
   * @param scale - 缩放向量
   */
  decompose(position: Vector3, quat: Quaternion, scale: Vector3): void {}

  /**
   * 计算4x4矩阵的行列式
   */
  determinant(): number {}

  /**
   * 从矩阵中返回表示旋转的四元数
   *
   * @param a - 转换矩阵
   * @param out - 表示旋转的四元数
   */
  getRotation(out: Quaternion): Quaternion {}

  /**
   * 从矩阵中返回缩放向量
   *
   * @param out - 缩放向量
   */
  getScaling(out: Vector3): Vector3 {}

  /**
   * 从矩阵中返回转换向量
   *
   * @param out - 转换向量
   */
  getTranslation(out: Vector3): Vector3 {}

  /**
   * 将矩阵设置为单位矩阵
   */
  identity(): void {}

  /**
   * 计算当前矩阵的逆矩阵，并返回
   */
  invert(): Matrix4x4 {}

  /**
   * 将当前矩阵按给定角度旋转，并返回
   *
   * @param rad - 给定的旋转角度
   * @param axis - 旋转轴
   */
  rotate(rad: number, axis: Vector3): Matrix4x4 {}

  /**
   * 将当前矩阵按给定向量v缩放，并返回
   *
   * @param v
   */
  scale(v: Vector3): Matrix4x4 {}

  /**
   * 将当前矩阵按给定向量v转换，并返回
   *
   * @param v - 转换向量
   */
  translate(v: Vector3): Matrix4x4 {}

  /**
   * 计算当前矩阵的转置矩阵，并返回
   */
  transpose(): Matrix4x4 {}
}
