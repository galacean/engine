import { IPlatformTransformFeedback, IPlatformBuffer, MeshTopology } from "@galacean/engine-core";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";
import { GLBuffer } from "./GLBuffer";

/**
 * @internal
 * WebGL2 implementation of Transform Feedback.
 */
export class GLTransformFeedback implements IPlatformTransformFeedback {
  private _gl: WebGL2RenderingContext;
  private _glTransformFeedback: WebGLTransformFeedback | null;

  constructor(private readonly _rhi: WebGLGraphicDevice) {
    const gl = _rhi.gl;
    this._gl = gl;
    this._glTransformFeedback = gl.createTransformFeedback();
  }

  bindBufferRange(index: number, buffer: IPlatformBuffer, byteOffset: number, byteSize: number): void {
    const gl = this._gl;
    gl.bindBufferRange(gl.TRANSFORM_FEEDBACK_BUFFER, index, (<GLBuffer>buffer)._glBuffer, byteOffset, byteSize);
  }

  unbindBuffer(index: number): void {
    const gl = this._gl;
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, index, null);
  }

  begin(primitiveMode: MeshTopology): void {
    this._gl.beginTransformFeedback(this._rhi._primitiveFormats.topology[primitiveMode]);
  }

  end(): void {
    this._gl.endTransformFeedback();
  }

  bind(): void {
    const gl = this._gl;
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this._glTransformFeedback);
  }

  unbind(): void {
    const gl = this._gl;
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  }

  destroy(): void {
    if (this._glTransformFeedback) {
      this._gl.deleteTransformFeedback(this._glTransformFeedback);
      this._glTransformFeedback = null!;
    }
  }
}
