/**
 * Platform primitive interface.
 */
export interface IPlatformPrimitive {
  /**
   * Draw primitive.
   * @param tech - Shader
   * @param subPrimitive - Sub primitive
   */
  draw(tech: any, subPrimitive: any): void;

  /**
   * Destroy.
   */
  destroy(): void;
}
