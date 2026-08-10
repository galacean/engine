import type { Engine } from "../Engine";
import type { ElementRangeMapping } from "./ElementRangeMapping";
import { MeshTopology } from "./enums/MeshTopology";
import { TransformFeedbackPrimitive } from "./TransformFeedbackPrimitive";
import type { VertexBufferBinding } from "./VertexBufferBinding";
import type { VertexElement } from "./VertexElement";
import type { ShaderData } from "../shader/ShaderData";
import type { ShaderPass } from "../shader/ShaderPass";

/**
 * @internal
 * General-purpose Transform Feedback simulator.
 * Manages per-frame simulation with shared shader program caching.
 */
export class TransformFeedbackSimulator {
  private readonly _primitive: TransformFeedbackPrimitive;
  private readonly _shaderPass: ShaderPass;
  private readonly _feedbackVaryings: string[];

  /**
   * The current read buffer binding.
   */
  get readBinding(): VertexBufferBinding {
    return this._primitive.readBinding;
  }

  /**
   * @param engine - Engine instance
   * @param byteStride - Bytes per vertex in the feedback buffer
   * @param vertexCount - Number of vertices to allocate
   * @param shaderPass - Shader pass used for simulation
   * @param feedbackVaryings - Vertex shader outputs captured by Transform Feedback
   */
  constructor(
    engine: Engine,
    byteStride: number,
    vertexCount: number,
    shaderPass: ShaderPass,
    feedbackVaryings: string[]
  ) {
    this._primitive = new TransformFeedbackPrimitive(engine, byteStride, vertexCount);
    this._shaderPass = shaderPass;
    this._feedbackVaryings = feedbackVaryings;
  }

  /**
   * Resize feedback buffers.
   * @param vertexCount - Number of vertices to allocate
   * @param mappings - Element ranges to preserve from the previous feedback state
   */
  resize(vertexCount: number, mappings: ReadonlyArray<ElementRangeMapping>): void {
    this._primitive.resize(vertexCount, mappings);
  }

  /**
   * Begin a simulation step: get/compile program, bind, upload uniforms, update layout.
   * @param shaderData - Shader data with current macros and uniforms
   * @param feedbackElements - Vertex elements for the feedback buffer
   * @param inputBindings - Input buffer bindings
   * @param inputElements - Vertex elements for the input buffers
   */
  beginUpdate(
    shaderData: ShaderData,
    feedbackElements: VertexElement[],
    inputBindings: VertexBufferBinding[],
    inputElements: VertexElement[]
  ): boolean {
    const program = this._shaderPass._getShaderProgram(
      this._primitive.engine,
      shaderData._macroCollection,
      this._feedbackVaryings
    );
    if (!program.isValid) {
      return false;
    }

    program.bind();
    program.uploadUniforms(program.rendererUniformBlock, shaderData);
    program.uploadUniforms(program.otherUniformBlock, shaderData);

    this._primitive.beginDraw(program, feedbackElements, inputBindings, inputElements);
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
  }

  destroy(): void {
    this._primitive.destroy();
  }
}
