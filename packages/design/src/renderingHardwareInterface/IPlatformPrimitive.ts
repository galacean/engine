/**
 * Platform primitive interface.
 */
export interface IPlatformPrimitive {
  /**
   * Draw primitive.
   * @param tech - Shader
   * @param subPrimitive - Sub primitive
   * @param vaoNeedUpdate - If need to update vaoMap
   */
  draw(tech: any, subPrimitive: any, vaoNeedUpdate?: boolean): void;

  /**
   * Destroy.
   */
  destroy(): void;
}
