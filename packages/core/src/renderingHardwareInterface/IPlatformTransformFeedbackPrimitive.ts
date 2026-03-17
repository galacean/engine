/**
 * Platform interface for Transform Feedback primitive operations.
 * @internal
 */
export interface IPlatformTransformFeedbackPrimitive {
  /**
   * Update vertex layout. Auto-rebuilds when program changes.
   * @param program - Shader program (for attribute locations)
   * @param readBinding - Current read buffer binding
   * @param writeBinding - Current write buffer binding
   * @param feedbackElements - Vertex elements for feedback buffer
   * @param inputBinding - Input buffer binding
   * @param inputElements - Vertex elements for input buffer
   */
  updateVertexLayout(
    program: any,
    readBinding: any,
    writeBinding: any,
    feedbackElements: any[],
    inputBinding: any,
    inputElements: any[]
  ): void;

  /**
   * Bind attribute state for the given read direction.
   * @param readIsA - Whether to use direction A as read
   */
  bind(readIsA: boolean): void;

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
