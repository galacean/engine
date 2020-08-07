import { MathUtil } from "./MathUtil";

/**
 * 二维向量
 */
export class Vector2 {
  /** @internal 零向量。*/
  static readonly _zero = new Vector2(0.0, 0.0);
  /** @internal 一向量。*/
  static readonly _one = new Vector2(1.0, 1.0);

  /**
   * 将两个向量相加，并输出结果out。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 向量相加结果
   */
  static add(a: Vector2, b: Vector2, out: Vector2): void {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
  }

  /**
   * 将两个向量相减 并输出结果out。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个二维向量的相减结果
   */
  static subtract(a: Vector2, b: Vector2, out: Vector2): void {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
  }

  /**
   * 将两个向量相乘 并输出结果out。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个二维向量的相乘结果
   */
  static multiply(a: Vector2, b: Vector2, out: Vector2): void {
    out.x = a.x * b.x;
    out.y = a.y * b.y;
  }

  /**
   * 将两个二维向量相除 并输出结果out。
   * @param a - 左向量
   * @param b - 右向量
   * @param out - 两个二维向量的相除结果
   */
  static divide(a: Vector2, b: Vector2, out: Vector2): void {
    out.x = a.x / b.x;
    out.y = a.y / b.y;
  }

  /**
   * 计算两个二维向量的点积。
   * @param a - 左向量
   * @param b - 右向量
   * @returns 两个向量的点积
   */
  static dot(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y;
  }

  /**
   * 计算两个二维向量的距离。
   * @param a - 向量
   * @param b - 向量
   * @returns 两个向量的距离
   */
  static distance(a: Vector2, b: Vector2): number {
    const x = b.x - a.x;
    const y = b.y - a.y;
    return Math.sqrt(x * x + y * y);
  }

  /**
   * 计算两个二维向量的距离的平方。
   * @param a - 向量
   * @param b - 向量
   * @returns 两个向量的距离的平方
   */
  static distanceSquared(a: Vector2, b: Vector2): number {
    const x = b.x - a.x;
    const y = b.y - a.y;
    return x * x + y * y;
  }

  /**
   * 判断两个二维向量的值是否相等。
   * @param a - 向量
   * @param b - 向量
   * @returns 两个向量是否相等，是返回 true，否则返回 false
   */
  static equals(a: Vector2, b: Vector2): boolean {
    return MathUtil.equals(a.x, b.x) && MathUtil.equals(a.y, b.y);
  }

  /**
   * 插值二维向量。
   * @param a - 左向量
   * @param b - 右向量
   * @param t - 插值比例
   * @param out - 插值结果
   */
  static lerp(a: Vector2, b: Vector2, t: number, out: Vector2): void {
    const { x, y } = a;
    out.x = x + (b.x - x) * t;
    out.y = y + (b.y - y) * t;
  }

  /**
   * 分别取两个二维向量x、y的最大值计算新的二维向量。
   * @param a - 向量
   * @param b - 向量
   * @param out - 结果向量
   */
  static max(a: Vector2, b: Vector2, out: Vector2): void {
    out.x = Math.max(a.x, b.x);
    out.y = Math.max(a.y, b.y);
  }

  /**
   * 分别取两个二维向量x、y的最小值计算新的二维向量。
   * @param a - 向量
   * @param b - 向量
   * @param out - 结果向量
   */
  static min(a: Vector2, b: Vector2, out: Vector2): void {
    out.x = Math.min(a.x, b.x);
    out.y = Math.min(a.y, b.y);
  }

  /**
   * 将向量a反转的结果输出到out。
   * @param a - 向量
   * @param out - 向量反转的结果
   */
  static negate(a: Vector2, out: Vector2): void {
    out.x = -a.x;
    out.y = -a.y;
  }

  /**
   * 将向量a归一化的结果输出到out。
   * @param a - 向量
   * @param out - 向量归一化的结果
   */
  static normalize(a: Vector2, out: Vector2): void {
    const { x, y } = a;
    let len: number = x * x + y * y;
    if (len > MathUtil.ZeroTolerance) {
      len = 1 / Math.sqrt(len);
      out.x = x * len;
      out.y = y * len;
    }
  }

  /**
   * 将向量a缩放的结果输出到out。
   * @param a - 向量
   * @param scale - 缩放因子
   * @param out - 向量缩放的结果
   */
  static scale(a: Vector2, s: number, out: Vector2): void {
    out.x = a.x * s;
    out.y = a.y * s;
  }

  /** 向量的X分量 */
  x: number;
  /** 向量的Y分量 */
  y: number;

  /**
   * 创建一个Vector2实例。
   * @param x - 向量的X分量，默认值0
   * @param y - 向量的Y分量，默认值0
   */
  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * 设置x, y的值，并返回当前向量。
   * @param x - 向量的X分量
   * @param y - 向量的Y分量
   * @returns 当前向量
   */
  setValue(x: number, y: number): Vector2 {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * 创建一个新的二维向量，并用当前向量值初始化。
   * @returns 一个新的向量，并且拷贝当前向量的值
   */
  clone(): Vector2 {
    let ret = new Vector2(this.x, this.y);
    return ret;
  }

  /**
   * 将当前向量值拷贝给out向量。
   * @param out - 目标向量
   */
  cloneTo(out: Vector2): void {
    out.x = this.x;
    out.y = this.y;
  }

  /**
   * 将当前向量加上给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 当前向量
   */
  add(a: Vector2): Vector2 {
    this.x += a.x;
    this.y += a.y;
    return this;
  }

  /**
   * 将当前向量减去给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 当前向量
   */
  subtract(a: Vector2): Vector2 {
    this.x -= a.x;
    this.y -= a.y;
    return this;
  }

  /**
   * 将当前向量乘以给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 当前向量
   */
  multiply(a: Vector2): Vector2 {
    this.x *= a.x;
    this.y *= a.y;
    return this;
  }

  /**
   * 将当前向量除以给定的向量a，并返回当前向量。
   * @param a - 给定的向量
   * @returns 当前向量
   */
  divide(a: Vector2): Vector2 {
    this.x /= a.x;
    this.y /= a.y;
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
    this.x *= -1;
    this.y *= -1;
    return this;
  }

  /**
   * 当前向量归一化，并返回。
   * @returns 当前向量
   */
  normalize(): Vector2 {
    const { x, y } = this;
    let len: number = x * x + y * y;
    if (len > MathUtil.ZeroTolerance) {
      len = 1 / Math.sqrt(len);
      this.x = x * len;
      this.y = y * len;
    }
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
}
