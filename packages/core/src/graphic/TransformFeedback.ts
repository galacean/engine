import { GraphicsResource } from "../asset/GraphicsResource";
import { Engine } from "../Engine";
import { IPlatformTransformFeedback } from "../renderingHardwareInterface";
import { Buffer } from "./Buffer";

/**
 * Transform Feedback object for GPU-based data capture.
 * Wraps a platform-specific TF object and provides buffer binding,
 * begin/end control, and context-loss recovery.
 * @internal
 */
export class TransformFeedback extends GraphicsResource {
  /** @internal */
  _platformTransformFeedback: IPlatformTransformFeedback;

  constructor(engine: Engine) {
    super(engine);
    this._platformTransformFeedback = engine._hardwareRenderer.createPlatformTransformFeedback();
  }

  /**
   * Bind a buffer range as Transform Feedback output at the given index.
   */
  bindBufferRange(index: number, buffer: Buffer, byteOffset: number, byteSize: number): void {
    this._platformTransformFeedback.bindBufferRange(index, buffer._platformBuffer, byteOffset, byteSize);
  }

  /**
   * Begin a Transform Feedback pass.
   * @param primitiveMode - GL primitive mode (e.g., gl.POINTS = 0)
   */
  begin(primitiveMode: number): void {
    this._platformTransformFeedback.begin(primitiveMode);
  }

  /**
   * End the current Transform Feedback pass.
   */
  end(): void {
    this._platformTransformFeedback.end();
  }

  /**
   * Bind this Transform Feedback object.
   */
  bind(): void {
    this._platformTransformFeedback.bind();
  }

  /**
   * Unbind the Transform Feedback object.
   */
  unbind(): void {
    this._platformTransformFeedback.unbind();
  }

  override _rebuild(): void {
    this._platformTransformFeedback = this._engine._hardwareRenderer.createPlatformTransformFeedback();
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._platformTransformFeedback.destroy();
  }
}
