/**
 * Platform interface for Transform Feedback primitive operations.
 * @internal
 */
export interface IPlatformTransformFeedbackPrimitive {
  /**
   * Update attribute bindings for the given program. Auto-rebuilds when program changes.
   * @param program - Shader program (for attribute locations)
   * @param readBuffer - Current read buffer (ping-pong A)
   * @param writeBuffer - Current write buffer (ping-pong B)
   * @param tfStride - TF buffer byte stride
   * @param feedbackElements - Vertex elements for TF buffer
   * @param inputBindings - Additional buffers with their vertex elements
   */
  update(
    program: any,
    readBuffer: any,
    writeBuffer: any,
    feedbackStride: number,
    feedbackElements: any[],
    inputBinding: any,
    inputElements: any[]
  ): void;

  /**
   * Bind attribute state for the given ping-pong direction.
   * @param useA - Whether to bind direction A or B
   */
  bind(useA: boolean): void;

  /**
   * Unbind attribute state.
   */
  unbind(): void;

  /**
   * Issue a draw call.
   * @param mode - Primitive topology
   * @param first - First vertex index
   * @param count - Number of vertices
   */
  draw(mode: number, first: number, count: number): void;

  /**
   * Destroy native resources.
   */
  destroy(): void;
}
