import { Engine } from "../Engine";
import { IPlatformTransformFeedbackPrimitive } from "../renderingHardwareInterface";
import { ShaderProgram } from "../shader/ShaderProgram";
import { Buffer } from "./Buffer";
import { BufferBindFlag } from "./enums/BufferBindFlag";
import { BufferUsage } from "./enums/BufferUsage";
import { MeshTopology } from "./enums/MeshTopology";
import { TransformFeedback } from "./TransformFeedback";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";

/**
 * @internal
 * Primitive for Transform Feedback simulation with read/write buffer swapping.
 */
export class TransformFeedbackPrimitive {
  /** @internal */
  _platformPrimitive: IPlatformTransformFeedbackPrimitive;

  private _engine: Engine;
  private _transformFeedback: TransformFeedback;
  private _bindingA: VertexBufferBinding;
  private _bindingB: VertexBufferBinding;
  private _byteStride: number;
  private _readIsA = true;

  /**
   * The current read buffer binding.
   */
  get readBinding(): VertexBufferBinding {
    return this._readIsA ? this._bindingA : this._bindingB;
  }

  /**
   * The current write buffer binding.
   */
  get writeBinding(): VertexBufferBinding {
    return this._readIsA ? this._bindingB : this._bindingA;
  }

  /**
   * @param engine - Engine instance
   * @param byteStride - Bytes per vertex
   */
  constructor(engine: Engine, byteStride: number) {
    this._engine = engine;
    this._byteStride = byteStride;
    this._transformFeedback = new TransformFeedback(engine);
    this._transformFeedback.isGCIgnored = true;
    this._platformPrimitive = engine._hardwareRenderer.createPlatformTransformFeedbackPrimitive();
  }

  /**
   * Resize read and write buffers.
   * @param vertexCount - Number of vertices to allocate
   */
  resize(vertexCount: number): void {
    this._bindingA?.buffer.destroy();
    this._bindingB?.buffer.destroy();

    const byteLength = this._byteStride * vertexCount;
    const bufferA = new Buffer(this._engine, BufferBindFlag.VertexBuffer, byteLength, BufferUsage.Dynamic, false);
    bufferA.isGCIgnored = true;
    const bufferB = new Buffer(this._engine, BufferBindFlag.VertexBuffer, byteLength, BufferUsage.Dynamic, false);
    bufferB.isGCIgnored = true;

    this._bindingA = new VertexBufferBinding(bufferA, this._byteStride);
    this._bindingB = new VertexBufferBinding(bufferB, this._byteStride);
    this._readIsA = true;
  }

  /**
   * Update vertex layout, only rebuilds when program changes.
   * @param program - Shader program for attribute locations
   * @param feedbackElements - Vertex elements describing the read/write buffer
   * @param inputBinding - Additional input buffer binding
   * @param inputElements - Vertex elements describing the input buffer
   */
  updateVertexLayout(
    program: ShaderProgram,
    feedbackElements: VertexElement[],
    inputBinding: VertexBufferBinding,
    inputElements: VertexElement[]
  ): void {
    this._platformPrimitive.updateVertexLayout(
      program,
      this.readBinding.buffer,
      this.writeBinding.buffer,
      this._byteStride,
      feedbackElements,
      inputBinding,
      inputElements
    );
  }

  /**
   * Bind state before issuing draw calls.
   */
  beginDraw(): void {
    this._platformPrimitive.bind(this._readIsA);
  }

  /**
   * Issue a draw call for a vertex range, capturing output to the write buffer.
   * @param mode - Primitive topology
   * @param first - First vertex index
   * @param count - Number of vertices
   */
  draw(mode: MeshTopology, first: number, count: number): void {
    const transformFeedback = this._transformFeedback;
    transformFeedback.bind();
    transformFeedback.bindBufferRange(0, this.writeBinding.buffer, first * this._byteStride, count * this._byteStride);
    transformFeedback.begin(mode);
    this._platformPrimitive.draw(mode, first, count);
    transformFeedback.end();
    transformFeedback.unbind();
    transformFeedback.unbindBuffer(0);
  }

  /**
   * Unbind state after draw calls.
   */
  endDraw(): void {
    this._platformPrimitive.unbind();
  }

  /**
   * Swap read and write buffers.
   */
  swap(): void {
    this._readIsA = !this._readIsA;
  }

  destroy(): void {
    this._platformPrimitive?.destroy();
    this._bindingA?.buffer.destroy();
    this._bindingB?.buffer.destroy();
    this._transformFeedback?.destroy();
  }
}
