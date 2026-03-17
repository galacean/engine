import { IPlatformTransformFeedbackPrimitive, VertexElement, VertexBufferBinding, Buffer } from "@galacean/engine-core";
import { GLBuffer } from "./GLBuffer";

/**
 * @internal
 * WebGL2 implementation of Transform Feedback primitive.
 * Maintains two VAOs (one per ping-pong direction), auto-rebuilds when program changes.
 */
export class GLTransformFeedbackPrimitive implements IPlatformTransformFeedbackPrimitive {
  private _gl: WebGL2RenderingContext;
  private _vaoA: WebGLVertexArrayObject;
  private _vaoB: WebGLVertexArrayObject;
  private _lastProgramId = -1;

  constructor(gl: WebGL2RenderingContext) {
    this._gl = gl;
  }

  update(
    program: any,
    readBuffer: Buffer,
    writeBuffer: Buffer,
    feedbackStride: number,
    feedbackElements: VertexElement[],
    inputBinding: VertexBufferBinding,
    inputElements: VertexElement[]
  ): void {
    if (program.id === this._lastProgramId) return;

    this._deleteVAOs();

    const attribs = program.attributeLocation;
    this._vaoA = this._createVAO(attribs, readBuffer, feedbackStride, feedbackElements, inputBinding, inputElements);
    this._vaoB = this._createVAO(attribs, writeBuffer, feedbackStride, feedbackElements, inputBinding, inputElements);
    this._lastProgramId = program.id;

    this._gl.bindVertexArray(null);
  }

  bind(useA: boolean): void {
    this._gl.bindVertexArray(useA ? this._vaoA : this._vaoB);
  }

  unbind(): void {
    this._gl.bindVertexArray(null);
  }

  draw(mode: number, first: number, count: number): void {
    this._gl.drawArrays(mode, first, count);
  }

  destroy(): void {
    this._deleteVAOs();
  }

  private _deleteVAOs(): void {
    const gl = this._gl;
    if (this._vaoA) {
      gl.deleteVertexArray(this._vaoA);
      this._vaoA = null;
    }
    if (this._vaoB) {
      gl.deleteVertexArray(this._vaoB);
      this._vaoB = null;
    }
    this._lastProgramId = -1;
  }

  private _createVAO(
    attribs: Record<string, number>,
    feedbackBuffer: Buffer,
    feedbackStride: number,
    feedbackElements: VertexElement[],
    inputBinding: VertexBufferBinding,
    inputElements: VertexElement[]
  ): WebGLVertexArrayObject {
    const gl = this._gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, (<GLBuffer>feedbackBuffer._platformBuffer)._glBuffer);
    this._bindElements(gl, attribs, feedbackElements, feedbackStride);

    gl.bindBuffer(gl.ARRAY_BUFFER, (<GLBuffer>inputBinding.buffer._platformBuffer)._glBuffer);
    this._bindElements(gl, attribs, inputElements, inputBinding.stride);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vao;
  }

  private _bindElements(
    gl: WebGL2RenderingContext,
    attribs: Record<string, number>,
    elements: VertexElement[],
    stride: number
  ): void {
    for (const element of elements) {
      const loc = attribs[element.attribute];
      if (loc !== undefined && loc !== -1) {
        const info = element._formatMetaInfo;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, info.size, info.type, info.normalized, stride, element.offset);
      }
    }
  }
}
