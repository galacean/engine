import type { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import type { VertexElement } from "../graphic/VertexElement";
import type { IPlatformShaderProgram } from "./IPlatformShaderProgram";

/** Storage-buffer implementation of a feedback step and parent-to-child trajectory gather. */
export interface IPlatformFeedbackCompute {
  bind(
    program: IPlatformShaderProgram,
    read: VertexBufferBinding,
    write: VertexBufferBinding,
    feedbackElements: readonly VertexElement[],
    inputs: readonly VertexBufferBinding[],
    elements: readonly VertexElement[]
  ): void;
  dispatch(first: number, count: number, instances?: number): void;
  gather(
    parent: VertexBufferBinding,
    child: VertexBufferBinding,
    firstParent: number,
    firstChild: number,
    childrenPerParent: number,
    parentCount: number
  ): void;
  destroy(): void;
}
