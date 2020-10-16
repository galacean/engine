/**
 * 用于描述克隆相关接口。
 */
export interface IClone {
  /**
   * 克隆并返回对象。
   */
  clone(): Object;

  /**
   * 克隆至目标对象。
   * @param target - 目标对象
   */
  cloneTo(target: Object);
}
