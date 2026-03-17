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
 * Transform Feedback primitive that manages buffers, draw calls, and state for GPU-side data capture.
 */
export class TransformFeedbackPrimitive {
  /** @internal */
  _platformPrimitive: IPlatformTransformFeedbackPrimitive;

  private _engine: Engine;
  private _transformFeedback: TransformFeedback;
  private _readBuffer: Buffer;
  private _writeBuffer: Buffer;
  private _renderBufferBinding: VertexBufferBinding;
  private _byteStride: number;
  private _readIsFirst = true;

  /**
   * Buffer binding for the render pass (points to the latest TF output).
   */
  get currentRenderBufferBinding(): VertexBufferBinding {
    return this._renderBufferBinding;
  }

  /**
   * The current read buffer (TF input / render source).
   */
  get readBuffer(): Buffer {
    return this._readBuffer;
  }

  /**
   * The current write buffer (TF output target).
   */
  get writeBuffer(): Buffer {
    return this._writeBuffer;
  }

  /**
   * @param engine - Engine instance
   * @param byteStride - Bytes per vertex in the TF buffer
   */
  constructor(engine: Engine, byteStride: number) {
    this._engine = engine;
    this._byteStride = byteStride;
    this._transformFeedback = new TransformFeedback(engine);
    this._transformFeedback.isGCIgnored = true;
    this._platformPrimitive = engine._hardwareRenderer.createPlatformTransformFeedbackPrimitive();
  }

  /**
   * Resize buffers.
   * @param vertexCount - Number of vertices to allocate
   */
  resize(vertexCount: number): void {
    this._readBuffer?.destroy();
    this._writeBuffer?.destroy();

    const byteLength = this._byteStride * vertexCount;
    const readBuffer = new Buffer(this._engine, BufferBindFlag.VertexBuffer, byteLength, BufferUsage.Dynamic, false);
    readBuffer.isGCIgnored = true;
    const writeBuffer = new Buffer(this._engine, BufferBindFlag.VertexBuffer, byteLength, BufferUsage.Dynamic, false);
    writeBuffer.isGCIgnored = true;

    this._readBuffer = readBuffer;
    this._writeBuffer = writeBuffer;
    this._renderBufferBinding = new VertexBufferBinding(readBuffer, this._byteStride);
  }

  /**
   * Prepare for drawing. Updates attribute bindings if needed and binds state.
   * @param program - The shader program
   * @param feedbackElements - Vertex elements for the feedback buffer
   * @param inputBinding - Input buffer binding (e.g., instance data)
   * @param inputElements - Vertex elements for the input buffer
   */
  beginDraw(
    program: ShaderProgram,
    feedbackElements: VertexElement[],
    inputBinding: VertexBufferBinding,
    inputElements: VertexElement[]
  ): void {
    this._platformPrimitive.update(
      program,
      this._readBuffer,
      this._writeBuffer,
      this._byteStride,
      feedbackElements,
      inputBinding,
      inputElements
    );
    this._platformPrimitive.bind(this._readIsFirst);
  }

  /**
   * Execute a single TF draw call for a vertex range.
   * @param mode - Primitive topology
   * @param first - First vertex index
   * @param count - Number of vertices to process
   */
  draw(mode: MeshTopology, first: number, count: number): void {
    const transformFeedback = this._transformFeedback;
    transformFeedback.bind();
    transformFeedback.bindBufferRange(0, this._writeBuffer, first * this._byteStride, count * this._byteStride);
    transformFeedback.begin(mode);
    this._platformPrimitive.draw(mode, first, count);
    transformFeedback.end();
    transformFeedback.unbindBuffer(0);
    transformFeedback.unbind();
  }

  /**
   * Finish drawing and unbind state.
   */
  endDraw(): void {
    this._platformPrimitive.unbind();
  }

  /**
   * Swap ping-pong buffers. After this, readBuffer holds the latest TF output.
   */
  swap(): void {
    const temp = this._readBuffer;
    this._readBuffer = this._writeBuffer;
    this._writeBuffer = temp;
    this._readIsFirst = !this._readIsFirst;
    this._renderBufferBinding = new VertexBufferBinding(this._readBuffer, this._byteStride);
  }

  destroy(): void {
    this._platformPrimitive?.destroy();
    this._readBuffer?.destroy();
    this._writeBuffer?.destroy();
    this._transformFeedback?.destroy();
  }
}
