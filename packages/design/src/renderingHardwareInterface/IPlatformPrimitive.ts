/**
 * Platform primitive interface.
 */
export interface IPlatformPrimitive {
  /**
   * Draw primitive.
   * @param tech - Shader
   * @param subPrimitive - Sub primitive
   * @param bufferStructChanged - If the buffer structure has changed
   */
  draw(tech: any, subPrimitive: any, bufferStructChanged: boolean): void;

  /**
   * Destroy.
   */
  destroy(): void;
}
