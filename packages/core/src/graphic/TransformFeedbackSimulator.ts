import { Engine } from "../Engine";
import { MeshTopology } from "./enums/MeshTopology";
import { TransformFeedbackPrimitive } from "./TransformFeedbackPrimitive";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";
import { ShaderData } from "../shader/ShaderData";
import { ShaderPass } from "../shader/ShaderPass";

/**
 * @internal
 * General-purpose Transform Feedback simulator.
 * Manages per-frame simulation with shared shader program caching.
 */
export class TransformFeedbackSimulator {
  private _engine: Engine;
  private _primitive: TransformFeedbackPrimitive;
  private _shaderPass: ShaderPass;

  /**
   * The current read buffer binding.
   */
  get readBinding(): VertexBufferBinding {
    return this._primitive.readBinding;
  }

  /**
   * The current write buffer binding.
   */
  get writeBinding(): VertexBufferBinding {
    return this._primitive.writeBinding;
  }

  /**
   * @param engine - Engine instance
   * @param byteStride - Bytes per vertex in the feedback buffer
   * @param shaderPass - ShaderPass with feedbackVaryings configured
   */
  constructor(engine: Engine, byteStride: number, shaderPass: ShaderPass) {
    this._engine = engine;
    this._primitive = new TransformFeedbackPrimitive(engine, byteStride);
    this._shaderPass = shaderPass;
  }

  /**
   * Resize feedback buffers.
   * @param vertexCount - Number of vertices to allocate
   */
  resize(vertexCount: number): void {
    this._primitive.resize(vertexCount);
  }

  /**
   * Begin a simulation step: get/compile program, bind, upload uniforms, update layout.
   * @param shaderData - Shader data with current macros and uniforms
   * @param feedbackElements - Vertex elements for the feedback buffer
   * @param inputBinding - Input buffer binding
   * @param inputElements - Vertex elements for the input buffer
   */
  beginUpdate(
    shaderData: ShaderData,
    feedbackElements: VertexElement[],
    inputBinding: VertexBufferBinding,
    inputElements: VertexElement[]
  ): boolean {
    const program = this._shaderPass._getShaderProgram(this._engine, shaderData._macroCollection);
    if (!program?.isValid) return false;

    program.bind();
    program.uploadUniforms(program.rendererUniformBlock, shaderData);
    program.uploadUniforms(program.otherUniformBlock, shaderData);

    this._primitive.updateVertexLayout(program, feedbackElements, inputBinding, inputElements);
    this._primitive.beginDraw();
    return true;
  }

  /**
   * Issue a draw call for a vertex range.
   * @param mode - Primitive topology
   * @param first - First vertex index
   * @param count - Number of vertices
   */
  draw(mode: MeshTopology, first: number, count: number): void {
    this._primitive.draw(mode, first, count);
  }

  /**
   * End the simulation step: unbind state and swap buffers.
   */
  endUpdate(): void {
    this._primitive.endDraw();
    this._primitive.swap();
  }

  destroy(): void {
    this._primitive?.destroy();
  }
}
