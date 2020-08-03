/**
 * 工具类
 */
export class MathUtil {
  /** 单精度浮点零容差 */
  static ZeroTolerance: number = 1e-6;

  /**
   * 求指定范围内的值。
   * @param v
   * @param min
   * @param max
   * @returns 返回范围内的值
   */
  static clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * 比较两个数是否相等(大小在零容差之内就算相等)。
   * @param a
   * @param b
   * @returns 返回两个数是否相等
   */
  static equals(a: number, b: number): boolean {
    return Math.abs(a - b) <= MathUtil.ZeroTolerance;
  }

  /**
   * 判断一个数是否是2的幂。
   * @param v
   * @returns 返回传入的数是否是2的幂
   */
  static isPowerOf2(v: number): boolean {
    return (v & (v - 1)) === 0;
  }

  /**
   * 弧度转角度。
   * @param r
   * @returns 返回角度
   */
  static radianToDegree(r: number): number {
    return (r * 180) / Math.PI;
  }

  /**
   * 角度转弧度。
   * @param d
   * @returns 返回弧度
   */
  static degreeToRadian(d: number): number {
    return (d * Math.PI) / 180;
  }
}
