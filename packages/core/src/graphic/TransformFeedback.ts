import { GraphicsResource } from "../asset/GraphicsResource";
import { Engine } from "../Engine";
import { IPlatformTransformFeedback } from "../renderingHardwareInterface";
import { Buffer } from "./Buffer";
import { MeshTopology } from "./enums/MeshTopology";

/**
 * Transform Feedback object for GPU-based data capture.
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
   * Bind this Transform Feedback object as active.
   */
  bind(): void {
    this._platformTransformFeedback.bind();
  }

  /**
   * Bind a buffer range as output at the given index.
   * @param index - Output binding point index (corresponds to varying index in shader)
   * @param buffer - Output buffer to capture data into
   * @param byteOffset - Starting byte offset in the buffer
   * @param byteSize - Size in bytes of the capture range
   */
  bindBufferRange(index: number, buffer: Buffer, byteOffset: number, byteSize: number): void {
    this._platformTransformFeedback.bindBufferRange(index, buffer._platformBuffer, byteOffset, byteSize);
  }

  /**
   * Begin a Transform Feedback pass.
   * @param primitiveMode - Primitive topology mode
   */
  begin(primitiveMode: MeshTopology): void {
    this._platformTransformFeedback.begin(primitiveMode);
  }

  /**
   * End the current Transform Feedback pass.
   */
  end(): void {
    this._platformTransformFeedback.end();
  }

  /**
   * Unbind the output buffer at the given index from the Transform Feedback target.
   * @param index - Output binding point index
   */
  unbindBuffer(index: number): void {
    this._platformTransformFeedback.unbindBuffer(index);
  }

  /**
   * Unbind this Transform Feedback object.
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
