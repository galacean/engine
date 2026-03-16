import { Engine } from "../Engine";
import { ShaderProgram } from "../shader/ShaderProgram";
import { Buffer } from "./Buffer";
import { BufferBindFlag } from "./enums/BufferBindFlag";
import { BufferUsage } from "./enums/BufferUsage";
import { TransformFeedback } from "./TransformFeedback";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";

/**
 * @internal
 * A primitive that manages ping-pong buffers and VAOs for Transform Feedback rendering.
 * Handles buffer creation, VAO setup, TF draw with bindBufferRange, and ping-pong swap.
 */
export class TransformFeedbackPrimitive {
  private _engine: Engine;
  private _readBuffer: Buffer;
  private _writeBuffer: Buffer;
  private _transformFeedback: TransformFeedback;

  private _vaoA: WebGLVertexArrayObject;
  private _vaoB: WebGLVertexArrayObject;
  private _currentVAO: WebGLVertexArrayObject;

  private _renderBufferBinding: VertexBufferBinding;
  private _byteStride: number;
  private _vertexCount = 0;
  private _initialized = false;
  private _vaoDirty = true;

  /**
   * Vertex buffer binding for the render pass.
   * After swap, the latest TF output is in readBuffer.
   */
  get currentRenderBufferBinding(): VertexBufferBinding {
    return this._renderBufferBinding;
  }

  get readBuffer(): Buffer {
    return this._readBuffer;
  }

  get writeBuffer(): Buffer {
    return this._writeBuffer;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  constructor(engine: Engine, byteStride: number) {
    this._engine = engine;
    this._byteStride = byteStride;
    this._transformFeedback = new TransformFeedback(engine);
    this._transformFeedback.isGCIgnored = true;
  }

  /**
   * Resize ping-pong buffers for the given vertex count.
   */
  resize(vertexCount: number): void {
    if (vertexCount === this._vertexCount && this._initialized) return;

    const engine = this._engine;
    const byteLength = this._byteStride * vertexCount;

    this._readBuffer?.destroy();
    this._writeBuffer?.destroy();

    const readBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, byteLength, BufferUsage.Dynamic, false);
    readBuffer.isGCIgnored = true;
    const writeBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, byteLength, BufferUsage.Dynamic, false);
    writeBuffer.isGCIgnored = true;

    const floatStride = this._byteStride / 4;
    const zeroData = new Float32Array(vertexCount * floatStride);
    readBuffer.setData(zeroData);
    writeBuffer.setData(zeroData);

    this._readBuffer = readBuffer;
    this._writeBuffer = writeBuffer;
    this._renderBufferBinding = new VertexBufferBinding(this._readBuffer, this._byteStride);
    this._vertexCount = vertexCount;
    this._initialized = true;
    this._vaoDirty = true;
  }

  /**
   * Mark VAOs as dirty (e.g., after shader program recompile).
   */
  markVAODirty(): void {
    this._vaoDirty = true;
  }

  /**
   * Rebuild VAOs if dirty. Call before draw.
   * @param program - The TF shader program (for attribute locations).
   * @param tfElements - VertexElements from the TF read buffer.
   * @param extraBindings - Additional vertex buffer bindings with their elements.
   */
  rebuildVAOsIfNeeded(
    program: ShaderProgram,
    tfElements: VertexElement[],
    extraBindings: { binding: VertexBufferBinding; elements: VertexElement[] }[]
  ): void {
    if (!this._vaoDirty) return;

    const gl = this._engine._hardwareRenderer.gl as WebGL2RenderingContext;

    if (this._vaoA) gl.deleteVertexArray(this._vaoA);
    if (this._vaoB) gl.deleteVertexArray(this._vaoB);

    this._vaoA = this._createVAO(gl, program, this._readBuffer, tfElements, extraBindings);
    this._vaoB = this._createVAO(gl, program, this._writeBuffer, tfElements, extraBindings);
    this._currentVAO = this._vaoA;

    gl.bindVertexArray(null);
    this._vaoDirty = false;
  }

  /**
   * Bind the current VAO for TF drawing.
   */
  bindVAO(): void {
    const gl = this._engine._hardwareRenderer.gl as WebGL2RenderingContext;
    gl.bindVertexArray(this._currentVAO);
  }

  /**
   * Unbind VAO after TF drawing.
   */
  unbindVAO(): void {
    const gl = this._engine._hardwareRenderer.gl as WebGL2RenderingContext;
    gl.bindVertexArray(null);
  }

  /**
   * Execute a TF draw call for a range of vertices, with bindBufferRange to write at the correct offset.
   */
  draw(rhi: any, mode: number, first: number, count: number): void {
    const byteOffset = first * this._byteStride;
    const byteSize = count * this._byteStride;
    this._transformFeedback.bind();
    this._transformFeedback.bindBufferRange(0, this._writeBuffer, byteOffset, byteSize);
    this._transformFeedback.begin(mode);
    rhi.drawArrays(mode, first, count);
    this._transformFeedback.end();
    this._transformFeedback.unbind();
  }

  /**
   * Swap ping-pong buffers. After this, readBuffer holds the latest TF output.
   */
  swap(): void {
    const temp = this._readBuffer;
    this._readBuffer = this._writeBuffer;
    this._writeBuffer = temp;
    this._currentVAO = this._currentVAO === this._vaoA ? this._vaoB : this._vaoA;
    this._renderBufferBinding = new VertexBufferBinding(this._readBuffer, this._byteStride);
  }

  destroy(): void {
    const gl = this._engine._hardwareRenderer.gl as WebGL2RenderingContext;
    if (this._vaoA) gl.deleteVertexArray(this._vaoA);
    if (this._vaoB) gl.deleteVertexArray(this._vaoB);
    this._readBuffer?.destroy();
    this._writeBuffer?.destroy();
    this._transformFeedback?.destroy();
  }

  private _createVAO(
    gl: WebGL2RenderingContext,
    program: ShaderProgram,
    tfReadBuffer: Buffer,
    tfElements: VertexElement[],
    extraBindings: { binding: VertexBufferBinding; elements: VertexElement[] }[]
  ): WebGLVertexArrayObject {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const attribs = program.attributeLocation;

    // TF read buffer attributes
    tfReadBuffer.bind();
    this._bindElements(gl, attribs, tfElements, this._byteStride);

    // Extra buffer attributes
    for (const { binding, elements } of extraBindings) {
      binding.buffer.bind();
      this._bindElements(gl, attribs, elements, binding.stride);
    }

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
