import type { IPlatformShaderProgram } from "@galacean/engine-design";
import type { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import type { VertexElement } from "../graphic/VertexElement";

/**
 * Platform interface for Transform Feedback primitive operations.
 * @internal
 */
export interface IPlatformTransformFeedbackPrimitive {
  /**
   * Bind the read layout, rebuilding cached state when its inputs change.
   * @param program - Shader program (for attribute locations)
   * @param bindingA - First feedback buffer binding
   * @param bindingB - Second feedback buffer binding
   * @param feedbackElements - Vertex elements for feedback buffer
   * @param inputBindings - Input buffer bindings
   * @param inputElements - Vertex elements for input buffers
   * @param readIsA - Whether to use direction A as read
   */
  bind(
    program: IPlatformShaderProgram,
    bindingA: VertexBufferBinding,
    bindingB: VertexBufferBinding,
    feedbackElements: VertexElement[],
    inputBindings: VertexBufferBinding[],
    inputElements: VertexElement[],
    readIsA: boolean
  ): void;

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
   * Invalidate cached state, forcing rebuild on next bind.
   */
  invalidate(): void;

  /**
   * Destroy native resources.
   */
  destroy(): void;
}
