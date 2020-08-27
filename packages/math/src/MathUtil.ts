/**
 * 数学工具类。
 */
export class MathUtil {
  /** 单精度浮点零容差。 */
  static readonly zeroTolerance: number = 1e-6;
  /** 弧度转角度的转换因子。 */
  static readonly radToDegreeFactor: number = 180 / Math.PI;
  /** 角度转弧度的转换因子。 */
  static readonly degreeToRadFactor: number = Math.PI / 180;

  /**
   * 求指定范围内的值。
   * @param v
   * @param min
   * @param max
   * @returns 范围内的值
   */
  static clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * 比较两个数是否相等(大小在零容差之内就算相等)。
   * @param a
   * @param b
   * @returns 两个数是否相等
   */
  static equals(a: number, b: number): boolean {
    return Math.abs(a - b) <= MathUtil.zeroTolerance;
  }

  /**
   * 判断一个数是否是 2 的幂。
   * @param v
   * @returns 传入的数是否是 2 的幂
   */
  static isPowerOf2(v: number): boolean {
    return (v & (v - 1)) === 0;
  }

  /**
   * 弧度转角度。
   * @param r
   * @returns 角度
   */
  static radianToDegree(r: number): number {
    return r * MathUtil.radToDegreeFactor;
  }

  /**
   * 角度转弧度。
   * @param d
   * @returns 弧度
   */
  static degreeToRadian(d: number): number {
    return d * MathUtil.degreeToRadFactor;
  }
}
