import { MathUtil } from "./MathUtil";

/**
 * 二维向量。
 */
export class Vector2 {
  /** @internal 零向量。*/
  static readonly _zero = new Vector2(0.0, 0.0);
  /** @internal 一向量。*/
  static readonly _one = new Vector2(1.0, 1.0);

  /**
   * 将两个向量相加并输出结果至 out。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 向量相加结果
   */
  static add(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = left.x + right.x;
    out.y = left.y + right.y;
  }

  /**
   * 将两个向量相减并输出结果至 out。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 两个二维向量的相减结果
   */
  static subtract(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = left.x - right.x;
    out.y = left.y - right.y;
  }

  /**
   * 将两个向量相乘并输出结果至 out。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 两个二维向量的相乘结果
   */
  static multiply(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = left.x * right.x;
    out.y = left.y * right.y;
  }

  /**
   * 将两个二维向量相除并输出结果至 out。
   * @param left - 左向量
   * @param right - 右向量
   * @param out - 两个二维向量的相除结果
   */
  static divide(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = left.x / right.x;
    out.y = left.y / right.y;
  }

  /**
   * 计算两个二维向量的点积。
   * @param left - 左向量
   * @param right - 右向量
   * @returns 两个向量的点积
   */
  static dot(left: Vector2, right: Vector2): number {
    return left.x * right.x + left.y * right.y;
  }

  /**
   * 计算两个二维向量的距离。
   * @param left - 向量
   * @param right - 向量
   * @returns 两个向量的距离
   */
  static distance(left: Vector2, right: Vector2): number {
    const x = right.x - left.x;
    const y = right.y - left.y;
    return Math.sqrt(x * x + y * y);
  }

  /**
   * 计算两个二维向量的距离的平方。
   * @param left - 向量
   * @param right - 向量
   * @returns 两个向量的距离的平方
   */
  static distanceSquared(left: Vector2, right: Vector2): number {
    const x = right.x - left.x;
    const y = right.y - left.y;
    return x * x + y * y;
  }

  /**
   * 判断两个二维向量的值是否相等。
   * @param left - 向量
   * @param right - 向量
   * @returns 两个向量是否相等，是返回 true，否则返回 false
   */
  static equals(left: Vector2, right: Vector2): boolean {
    return MathUtil.equals(left.x, right.x) && MathUtil.equals(left.y, right.y);
  }

  /**
   * 插值二维向量。
   * @param left - 左向量
   * @param right - 右向量
   * @param t - 插值比例
   * @param out - 插值结果
   */
  static lerp(left: Vector2, right: Vector2, t: number, out: Vector2): void {
    const { x, y } = left;
    out.x = x + (right.x - x) * t;
    out.y = y + (right.y - y) * t;
  }

  /**
   * 分别取两个二维向量 x、y 的最大值计算新的二维向量。
   * @param left - 向量
   * @param right - 向量
   * @param out - 结果向量
   */
  static max(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = Math.max(left.x, right.x);
    out.y = Math.max(left.y, right.y);
  }

  /**
   * 分别取两个二维向量 x、y 的最小值计算新的二维向量。
   * @param left - 向量
   * @param right - 向量
   * @param out - 结果向量
   */
  static min(left: Vector2, right: Vector2, out: Vector2): void {
    out.x = Math.min(left.x, right.x);
    out.y = Math.min(left.y, right.y);
  }

  /**
   * 将向量 left 反转的结果输出到 out。
   * @param left - 向量
   * @param out - 向量反转的结果
   */
  static negate(left: Vector2, out: Vector2): void {
    out.x = -left.x;
    out.y = -left.y;
  }

  /**
   * 将向量 left 归一化的结果输出到 out。
   * @param left - 向量
   * @param out - 向量归一化的结果
   */
  static normalize(left: Vector2, out: Vector2): void {
    const { x, y } = left;
    let len: number = Math.sqrt(x * x + y * y);
    if (len > MathUtil.zeroTolerance) {
      len = 1 / len;
      out.x = x * len;
      out.y = y * len;
    }
  }

  /**
   * 将向量 left 缩放的结果输出到 out。
   * @param left - 向量
   * @param scale - 缩放因子
   * @param out - 向量缩放的结果
   */
  static scale(left: Vector2, s: number, out: Vector2): void {
    out.x = left.x * s;
    out.y = left.y * s;
  }

  /** 向量的 X 分量。 */
  x: number;
  /** 向量的 Y 分量。 */
  y: number;

  /**
   * 创建一个 Vector2 实例。
   * @param x - 向量的 X 分量，默认值 0
   * @param y - 向量的 Y 分量，默认值 0
   */
  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * 设置 x, y 的值，并返回当前向量。
   * @param x - 向量的 X 分量
   * @param y - 向量的 Y 分量
   * @returns 当前向量
   */
  setValue(x: number, y: number): Vector2 {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * 通过数组设置值，并返回当前向量。
   * @param array - 数组
   * @param offset - 数组偏移
   * @returns 当前向量
   */
  setValueByArray(array: ArrayLike<number>, offset: number = 0): Vector2 {
    this.x = array[offset];
    this.y = array[offset + 1];
    return this;
  }

  /**
   * 将当前向量加上给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  add(right: Vector2): Vector2 {
    this.x += right.x;
    this.y += right.y;
    return this;
  }

  /**
   * 将当前向量减去给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  subtract(right: Vector2): Vector2 {
    this.x -= right.x;
    this.y -= right.y;
    return this;
  }

  /**
   * 将当前向量乘以给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  multiply(right: Vector2): Vector2 {
    this.x *= right.x;
    this.y *= right.y;
    return this;
  }

  /**
   * 将当前向量除以给定的向量 right，并返回当前向量。
   * @param right - 给定的向量
   * @returns 当前向量
   */
  divide(right: Vector2): Vector2 {
    this.x /= right.x;
    this.y /= right.y;
    return this;
  }

  /**
   * 计算一个二维向量的标量长度。
   * @returns 当前向量的标量长度
   */
  length(): number {
    const { x, y } = this;
    return Math.sqrt(x * x + y * y);
  }

  /**
   * 计算一个二维向量的标量长度的平方。
   * @returns 当前向量的标量长度的平方
   */
  lengthSquared(): number {
    const { x, y } = this;
    return x * x + y * y;
  }

  /**
   * 向量反转。
   * @returns 当前向量
   */
  negate(): Vector2 {
    this.x = -this.x;
    this.y = -this.y;
    return this;
  }

  /**
   * 当前向量归一化，并返回。
   * @returns 当前向量
   */
  normalize(): Vector2 {
    Vector2.normalize(this, this);
    return this;
  }

  /**
   * 向量缩放。
   * @param s - 缩放因子
   * @returns 当前向量
   */
  scale(s: number): Vector2 {
    this.x *= s;
    this.y *= s;
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
  }

  /**
   * 克隆并返回一个新的二维向量对象。
   * @returns 新的二维向量对象
   */
  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  /**
   * 将当前向量值拷贝给目标向量。
   * @param out - 目标向量
   */
  cloneTo(out: Vector2): Vector2 {
    out.x = this.x;
    out.y = this.y;
    return out;
  }
}
