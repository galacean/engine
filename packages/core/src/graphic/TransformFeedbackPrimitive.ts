import { Engine } from "../Engine";
import { GraphicsResource } from "../asset/GraphicsResource";
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
export class TransformFeedbackPrimitive extends GraphicsResource {
  /** @internal */
  _platformPrimitive: IPlatformTransformFeedbackPrimitive;

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
    super(engine);
    this._byteStride = byteStride;
    this._transformFeedback = new TransformFeedback(engine);
    this._transformFeedback.isGCIgnored = true;
    this._platformPrimitive = engine._hardwareRenderer.createPlatformTransformFeedbackPrimitive();
    this.isGCIgnored = true;
  }

  /**
   * Resize read and write buffers.
   * @param vertexCount - Number of vertices to allocate
   */
  resize(vertexCount: number): void {
    const oldBindingA = this._bindingA;
    const oldBindingB = this._bindingB;

    const byteLength = this._byteStride * vertexCount;
    const bufferA = new Buffer(this._engine, BufferBindFlag.VertexBuffer, byteLength, BufferUsage.Dynamic, false);
    bufferA.isGCIgnored = true;
    const bufferB = new Buffer(this._engine, BufferBindFlag.VertexBuffer, byteLength, BufferUsage.Dynamic, false);
    bufferB.isGCIgnored = true;

    // GPU copy old data to new buffers before destroying old ones
    if (oldBindingA) {
      const copyLength = Math.min(oldBindingA.buffer.byteLength, byteLength);
      bufferA.copyFromBuffer(oldBindingA.buffer, 0, 0, copyLength);
      bufferB.copyFromBuffer(oldBindingB.buffer, 0, 0, copyLength);
      oldBindingA.buffer.destroy();
      oldBindingB.buffer.destroy();
    }

    this._bindingA = new VertexBufferBinding(bufferA, this._byteStride);
    this._bindingB = new VertexBufferBinding(bufferB, this._byteStride);
    this._readIsA = true;
    this._platformPrimitive.invalidate();
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
      this._bindingA,
      this._bindingB,
      feedbackElements,
      inputBinding,
      inputElements
    );
  }

  /**
   * Bind state before issuing draw calls.
   */
  beginDraw(): void {
    this._engine._hardwareRenderer.enableRasterizerDiscard();
    this._transformFeedback.bind();
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
    transformFeedback.bindBufferRange(0, this.writeBinding.buffer, first * this._byteStride, count * this._byteStride);
    transformFeedback.begin(mode);
    this._platformPrimitive.draw(mode, first, count);
    transformFeedback.end();
  }

  /**
   * Unbind state after draw calls.
   */
  endDraw(): void {
    this._platformPrimitive.unbind();
    this._transformFeedback.unbindBuffer(0);
    this._transformFeedback.unbind();
    this._engine._hardwareRenderer.disableRasterizerDiscard();
    this._engine._hardwareRenderer.invalidateShaderProgramState();
  }

  /**
   * Swap read and write buffers.
   */
  swap(): void {
    this._readIsA = !this._readIsA;
  }

  override _rebuild(): void {
    this._platformPrimitive = this._engine._hardwareRenderer.createPlatformTransformFeedbackPrimitive();
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._platformPrimitive?.destroy();
    this._bindingA?.buffer.destroy();
    this._bindingB?.buffer.destroy();
    this._transformFeedback?.destroy();
  }
}
