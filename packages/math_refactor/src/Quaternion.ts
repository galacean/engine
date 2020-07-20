import { Vector3 } from "./Vector3";

/**
 * 四元数
 */
export class Quaternion {
  /**
   * 将两个四元数相加
   *
   * @param a - 左四元数
   * @param b - 右四元数
   * @param out - 四元数相加结果
   */
  static add(a: Quaternion, b: Quaternion, out: Quaternion): void {}

  /**
   * 将两个四元数相乘 merge~mul
   *
   * @param a - 左四元数
   * @param b - 右四元数
   * @param out - 四元数相乘结果
   */
  static multiply(a: Quaternion, b: Quaternion, out: Quaternion): void {}

  /**
   * 计算共轭四元数
   *
   * @param a - 输入四元数
   * @param out - 输出的共轭四元数
   */
  static conjugate(a: Quaternion, out: Quaternion): void {}

  /**
   * 计算两个四元数的点积
   *
   * @param a - 左四元数
   * @param b - 右四元数
   */
  static dot(a: Quaternion, b: Quaternion): number {}

  /**
   * 判断两个四元数是否相等 merge~exactEquals
   *
   * @param a - 四元数
   * @param b - 四元数
   */
  static equals(a: Quaternion, b: Quaternion): boolean {}

  /**
   * 通过x,y,z轴的旋转生成四元数
   *
   * @param x - 绕X轴旋转的角度
   * @param y - 绕Y轴旋转的角度
   * @param z - 绕Z轴旋转的角度
   * @param out - 生成的四元数
   */
  static fromEuler(x: number, y: number, z: number, out: Quaternion): void {}

  /**
   * 计算四元数的逆
   *
   * @param a - 四元数的逆
   * @param out - 四元数的逆
   */
  static invert(a: Quaternion, out: Quaternion): void {}

  /**
   * 插值四元数
   *
   * @param a - 左四元数
   * @param b - 右四元数
   * @param t - 插值比例
   * @param out - 插值结果
   */
  static lerp(a: Quaternion, b: Quaternion, t: number, out: Quaternion): void {}

  /**
   * 球面插值四元数
   *
   * @param a - 左四元数
   * @param b - 右四元数
   * @param t - 插值比例
   * @param out - 插值结果
   */
  static slerp(a: Quaternion, b: Quaternion, t: number, out: Quaternion): void {}

  /**
   * 将一个四元数归一化
   *
   * @param a - 四元数
   * @param out - 四元数归一化的结果
   */
  static normalize(a: Quaternion, out: Quaternion): void {}

  /**
   * 绕X轴旋转四元数
   *
   * @param a - 四元数
   * @param rad - 旋转角度
   * @param out - 旋转后的四元数
   */
  static rotateX(a: Quaternion, rad: number, out: Quaternion): void {}

  /**
   * 绕Y轴旋转四元数
   *
   * @param a - 四元数
   * @param rad - 旋转角度
   * @param out - 旋转后的四元数
   */
  static rotateY(a: Quaternion, rad: number, out: Quaternion): void {}

  /**
   * 绕Z轴旋转四元数
   *
   * @param a - 四元数
   * @param rad - 旋转角度
   * @param out - 旋转后的四元数
   */
  static rotateZ(a: Quaternion, rad: number, out: Quaternion): void {}

  /**
   * 将一个四元数缩放
   *
   * @param a - 四元数
   * @param scale - 缩放因子
   * @param out - 四元数缩放的结果
   */
  static scale(a: Quaternion, scale: number, out: Quaternion): void {}

  /**
   * 获取四元数的欧拉角
   *
   * @param a - 四元数
   * @param out - 欧拉角
   */
  static toEuler(a: Quaternion, out: Vector3): void {}

  /** X轴坐标 */
  x: number;
  /** Y轴坐标 */
  y: number;
  /** Z轴坐标 */
  z: number;
  /** W轴坐标 */
  w: number;

  /**
   * 创建四元数实例 merge~create merge~fromValues
   *
   * @param x - 默认值0
   * @param y - 默认值0
   * @param z - 默认值0
   * @param w - 默认值1
   */
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /**
   * 设置x, y, z, w的值
   *
   * @param x
   * @param y
   * @param z
   * @param w
   */
  setValue(x: number, y: number, z: number, w: number): void {}

  /**
   * 创建一个新的四元数，并用当前四元数初始化
   */
  clone(): Quaternion {}

  /**
   * 将当前四元数值拷贝给out四元数 rename~copy
   *
   * @param out - 目标四元数
   */
  cloneTo(out: Quaternion): void {}

  /**
   * 从四元数分解欧拉角，并返回角度
   *
   * @param out - 输出欧拉角
   * @param q - 输入
   */
  getAxisAngle(out: Vector3): number {}

  /**
   * 将四元数设置为单位四元数
   */
  identity(): void {}

  /**
   * 计算一个四元数的标量长度 merge～len
   */
  length(): number {}

  /**
   * 计算一个四元数的标量长度的平方 merge~sqrLen rename~squaredLength
   */
  lengthSquared(): number {}

  /**
   * 通过旋转的欧拉角设置四元数
   *
   * @param axis - 旋转轴向量
   * @param rad - 旋转角度
   */
  setAxisAngle(axis: Vector3, rad: number): void {}
}
