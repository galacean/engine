import { IPlatformBuffer } from "./IPlatformBuffer";

/**
 * Platform interface for Transform Feedback operations.
 * @internal
 */
export interface IPlatformTransformFeedback {
  /**
   * Bind a buffer range as Transform Feedback output at the given index.
   */
  bindBufferRange(index: number, buffer: IPlatformBuffer, byteOffset: number, byteSize: number): void;

  /**
   * Unbind buffer from Transform Feedback output at the given index.
   */
  unbindBuffer(index: number): void;

  /**
   * Begin a Transform Feedback pass.
   * @param primitiveMode - The primitive mode (e.g., POINTS)
   */
  begin(primitiveMode: number): void;

  /**
   * End the current Transform Feedback pass.
   */
  end(): void;

  /**
   * Bind this Transform Feedback object as the active TF.
   */
  bind(): void;

  /**
   * Unbind the Transform Feedback object.
   */
  unbind(): void;

  /**
   * Destroy native resources.
   */
  destroy(): void;
}
