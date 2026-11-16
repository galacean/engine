import type { IPlatformTransformFeedbackPrimitive, VertexBufferBinding, VertexElement } from "@galacean/engine-core";
import type { IPlatformShaderProgram } from "@galacean/engine-design";
import type { GLBuffer } from "./GLBuffer";
import type { WebGLGraphicDevice } from "./WebGLGraphicDevice";

/**
 * @internal
 * WebGL2 implementation of Transform Feedback primitive.
 * Maintains two VAOs (one per read direction), rebuilding when the program or input bindings change.
 */
export class GLTransformFeedbackPrimitive implements IPlatformTransformFeedbackPrimitive {
  private readonly _rhi: WebGLGraphicDevice;
  private readonly _gl: WebGL2RenderingContext;
  private _vaoA: WebGLVertexArrayObject | null;
  private _vaoB: WebGLVertexArrayObject | null;
  private _lastProgramId = -1;
  private readonly _lastInputBindings: VertexBufferBinding[] = [];

  constructor(rhi: WebGLGraphicDevice) {
    this._rhi = rhi;
    this._gl = rhi.gl as WebGL2RenderingContext;
  }

  bind(
    program: IPlatformShaderProgram,
    bindingA: VertexBufferBinding,
    bindingB: VertexBufferBinding,
    feedbackElements: VertexElement[],
    inputBindings: VertexBufferBinding[],
    inputElements: VertexElement[],
    readIsA: boolean
  ): void {
    let layoutChanged = program.id !== this._lastProgramId;
    const lastInputBindings = this._lastInputBindings;
    if (!layoutChanged) {
      if (inputBindings.length !== lastInputBindings.length) {
        layoutChanged = true;
      } else {
        for (let i = 0, n = inputBindings.length; i < n; i++) {
          if (inputBindings[i] !== lastInputBindings[i]) {
            layoutChanged = true;
            break;
          }
        }
      }
    }
    if (layoutChanged) {
      this._deleteVAOs();

      const attribs = program.attributeLocation;
      this._vaoA = this._createVAO(attribs, bindingA, feedbackElements, inputBindings, inputElements);
      this._vaoB = this._createVAO(attribs, bindingB, feedbackElements, inputBindings, inputElements);
      this._lastProgramId = program.id;
      lastInputBindings.length = inputBindings.length;
      for (let i = 0, n = inputBindings.length; i < n; i++) {
        lastInputBindings[i] = inputBindings[i];
      }

      this._rhi._bindVertexArray(null);
    }
    this._rhi._bindVertexArray(readIsA ? this._vaoA : this._vaoB);
  }

  unbind(): void {
    this._rhi._bindVertexArray(null);
  }

  draw(mode: number, first: number, count: number): void {
    this._gl.drawArrays(mode, first, count);
  }

  invalidate(): void {
    this._deleteVAOs();
  }

  destroy(): void {
    this._deleteVAOs();
  }

  private _deleteVAOs(): void {
    const gl = this._gl;
    if (this._vaoA) {
      if (this._rhi._currentBindVAO === this._vaoA) this._rhi._bindVertexArray(null);
      gl.deleteVertexArray(this._vaoA);
      this._vaoA = null;
    }
    if (this._vaoB) {
      if (this._rhi._currentBindVAO === this._vaoB) this._rhi._bindVertexArray(null);
      gl.deleteVertexArray(this._vaoB);
      this._vaoB = null;
    }
    this._lastProgramId = -1;
    this._lastInputBindings.length = 0;
  }

  private _createVAO(
    attribs: Record<string, number>,
    feedbackBinding: VertexBufferBinding,
    feedbackElements: VertexElement[],
    inputBindings: VertexBufferBinding[],
    inputElements: VertexElement[]
  ): WebGLVertexArrayObject | null {
    const gl = this._gl;
    const vao = gl.createVertexArray();
    this._rhi._bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, (<GLBuffer>feedbackBinding.buffer._platformBuffer)._glBuffer);
    for (let i = 0, n = feedbackElements.length; i < n; i++) {
      this._bindElement(attribs, feedbackElements[i], feedbackBinding.stride);
    }

    let lastInputBinding: VertexBufferBinding | undefined;
    for (let i = 0, n = inputElements.length; i < n; i++) {
      const element = inputElements[i];
      const inputBinding = inputBindings[element.bindingIndex];
      if (inputBinding !== lastInputBinding) {
        gl.bindBuffer(gl.ARRAY_BUFFER, (<GLBuffer>inputBinding.buffer._platformBuffer)._glBuffer);
        lastInputBinding = inputBinding;
      }
      this._bindElement(attribs, element, inputBinding.stride);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vao;
  }

  private _bindElement(attribs: Record<string, number>, element: VertexElement, stride: number): void {
    const gl = this._gl;
    const loc = attribs[element.attribute];
    if (loc !== undefined && loc !== -1) {
      const info = element._formatMetaInfo;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, info.size, info.type, info.normalized, stride, element.offset);
    }
  }
}
