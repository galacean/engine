/**
 * 图元接口规范。
 */
export interface IPlatformPrimitive {
  /**
   * 绘制。
   * @param tech - 着色器
   * @param subPrimitive - 子图元
   */
  draw(tech: any, subPrimitive: any): void;

  /**
   * 销毁。
   */
  destroy(): void;
}
