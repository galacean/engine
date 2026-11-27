import type { Engine } from "../Engine";
import { GraphicsResource } from "../asset/GraphicsResource";
import type { IPlatformTransformFeedbackPrimitive, IPlatformShaderProgram } from "../renderingHardwareInterface";
import { Buffer } from "./Buffer";
import type { ElementRangeMapping } from "./ElementRangeMapping";
import { BufferBindFlag } from "./enums/BufferBindFlag";
import { BufferUsage } from "./enums/BufferUsage";
import type { MeshTopology } from "./enums/MeshTopology";
import { TransformFeedback } from "./TransformFeedback";
import { VertexBufferBinding } from "./VertexBufferBinding";
import type { VertexElement } from "./VertexElement";

/**
 * @internal
 * WebGL2 Transform Feedback storage for iterative simulations and independent output generators.
 */
export class TransformFeedbackPrimitive extends GraphicsResource {
  private _platformPrimitive!: IPlatformTransformFeedbackPrimitive;
  private readonly _transformFeedback: TransformFeedback;
  private _bindingA: VertexBufferBinding;
  private _bindingB?: VertexBufferBinding;
  private readonly _byteStride: number;
  private _readIsA = true;

  /**
   * The current read buffer binding.
   */
  get readBinding(): VertexBufferBinding {
    return this._readIsA ? this._bindingA : this._bindingB!;
  }

  /**
   * @param engine - Engine instance
   * @param byteStride - Bytes per vertex
   * @param vertexCount - Number of vertices to allocate
   * @param bufferMode - Whether draws read the previous output or generate into a stable binding
   */
  constructor(
    engine: Engine,
    byteStride: number,
    vertexCount: number,
    bufferMode: "ping-pong" | "output-only" = "ping-pong"
  ) {
    super(engine);
    if (!engine._hardwareRenderer.supportsTransformFeedback) {
      throw new Error(
        engine._hardwareRenderer.supportsCompute
          ? "TransformFeedback is only supported on WebGL2; use ComputeShader on WebGPU."
          : "TransformFeedback requires WebGL2 and is not supported on this graphics backend."
      );
    }
    this._byteStride = byteStride;
    this._transformFeedback = new TransformFeedback(engine);
    this._transformFeedback.isGCIgnored = true;
    this._rebuild();
    this._bindingA = this._createBinding(vertexCount);
    if (bufferMode === "ping-pong") this._bindingB = this._createBinding(vertexCount);
    this.isGCIgnored = true;
  }

  /**
   * Resize read and write buffers.
   * @param vertexCount - Number of vertices to allocate
   * @param mappings - Element ranges to preserve from the previous read buffer
   */
  resize(vertexCount: number, mappings: ReadonlyArray<ElementRangeMapping>): void {
    const oldBindingA = this._bindingA;
    const oldBindingB = this._bindingB;
    const oldReadBuffer = this.readBinding.buffer;
    this._bindingA = this._createBinding(vertexCount);
    if (oldBindingB) this._bindingB = this._createBinding(vertexCount);
    this._platformPrimitive.invalidate();

    const stride = this._byteStride;
    const readBuffer = this.readBinding.buffer;
    for (let i = 0, n = mappings.length; i < n; i++) {
      const mapping = mappings[i];
      readBuffer.copyFromBuffer(
        oldReadBuffer,
        mapping.sourceStart * stride,
        mapping.targetStart * stride,
        mapping.count * stride
      );
    }
    oldBindingA.buffer.destroy();
    oldBindingB?.buffer.destroy();
  }

  /**
   * Bind state before issuing draw calls, rebuilding the vertex layout when needed.
   * @param program - Shader program for attribute locations
   * @param feedbackElements - Vertex elements describing the read/write buffer
   * @param inputBindings - Additional input buffer bindings
   * @param inputElements - Vertex elements describing the input buffers
   */
  beginDraw(
    program: IPlatformShaderProgram,
    feedbackElements: VertexElement[],
    inputBindings: VertexBufferBinding[],
    inputElements: VertexElement[]
  ): void {
    if (!this._bindingB && feedbackElements.length) {
      throw new Error("Output-only transform feedback requires independent vertex inputs.");
    }
    this._platformPrimitive.bind(
      program,
      this._bindingA,
      this._bindingB ?? this._bindingA,
      feedbackElements,
      inputBindings,
      inputElements,
      this._readIsA
    );
    this._engine._hardwareRenderer.enableRasterizerDiscard();
    this._transformFeedback.bind();
  }

  /**
   * Issue a draw call for a vertex range, capturing output to the write buffer.
   * @param mode - Primitive topology
   * @param first - First vertex index
   * @param count - Number of vertices per instance
   * @param instanceCount - Number of instances; defaults to one
   */
  draw(mode: MeshTopology, first: number, count: number, instanceCount = 1): void {
    const transformFeedback = this._transformFeedback;
    transformFeedback.bindBufferRange(
      0,
      (this._readIsA && this._bindingB ? this._bindingB : this._bindingA).buffer,
      first * this._byteStride,
      count * instanceCount * this._byteStride
    );
    transformFeedback.begin(mode);
    this._platformPrimitive.draw(mode, first, count, instanceCount);
    transformFeedback.end();
  }

  /**
   * Unbind state after draw calls and make the written buffer current.
   */
  endDraw(): void {
    this._platformPrimitive.unbind();
    this._transformFeedback.unbindBuffer(0);
    this._transformFeedback.unbind();
    this._engine._hardwareRenderer.disableRasterizerDiscard();
    this._engine._hardwareRenderer.invalidateShaderProgramState();
    if (this._bindingB) this._readIsA = !this._readIsA;
  }

  override _rebuild(): void {
    this._platformPrimitive = this._engine._hardwareRenderer.createPlatformTransformFeedbackPrimitive();
  }

  private _createBinding(vertexCount: number): VertexBufferBinding {
    const buffer = new Buffer(
      this._engine,
      BufferBindFlag.VertexBuffer,
      this._byteStride * vertexCount,
      BufferUsage.Dynamic,
      false
    );
    buffer.isGCIgnored = true;
    return new VertexBufferBinding(buffer, this._byteStride);
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._platformPrimitive.destroy();
    this._bindingA.buffer.destroy();
    this._bindingB?.buffer.destroy();
    this._transformFeedback.destroy();
  }
}
