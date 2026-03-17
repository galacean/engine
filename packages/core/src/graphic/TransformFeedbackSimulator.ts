import { Engine } from "../Engine";
import { MeshTopology } from "./enums/MeshTopology";
import { TransformFeedbackPrimitive } from "./TransformFeedbackPrimitive";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";
import { ShaderFactory } from "../shaderlib/ShaderFactory";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ShaderProgram } from "../shader/ShaderProgram";
import { ShaderProgramPool } from "../shader/ShaderProgramPool";
import { ShaderData } from "../shader/ShaderData";
import { Logger } from "../base/Logger";

/**
 * @internal
 * General-purpose Transform Feedback simulator.
 * Manages shader compilation, program caching, and per-frame simulation.
 */
export class TransformFeedbackSimulator {
  private _engine: Engine;
  private _primitive: TransformFeedbackPrimitive;
  private _programPool: ShaderProgramPool;
  private _vertexSource: string;
  private _fragmentSource: string;
  private _feedbackVaryings: string[];

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
   * @param vertexSource - Vertex shader source (may contain #include)
   * @param fragmentSource - Fragment shader source
   * @param feedbackVaryings - Transform Feedback varying names
   */
  constructor(
    engine: Engine,
    byteStride: number,
    vertexSource: string,
    fragmentSource: string,
    feedbackVaryings: string[]
  ) {
    this._engine = engine;
    this._primitive = new TransformFeedbackPrimitive(engine, byteStride);
    this._programPool = new ShaderProgramPool(engine);
    this._vertexSource = vertexSource;
    this._fragmentSource = fragmentSource;
    this._feedbackVaryings = feedbackVaryings;
  }

  /**
   * Resize feedback buffers.
   * @param vertexCount - Number of vertices to allocate
   */
  resize(vertexCount: number): void {
    this._primitive.resize(vertexCount);
  }

  /**
   * Begin a simulation step: compile/cache program, bind, upload uniforms, update layout.
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
    const primitive = this._primitive;

    let program = this._programPool.get(shaderData._macroCollection);
    if (!program) {
      program = this._compileProgram(shaderData._macroCollection);
      if (!program) return false;
      this._programPool.cache(program);
    }

    program.bind();
    program.uploadUniforms(program.rendererUniformBlock, shaderData);
    program.uploadUniforms(program.otherUniformBlock, shaderData);

    primitive.updateVertexLayout(program, feedbackElements, inputBinding, inputElements);
    primitive.beginDraw();
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
    this._programPool?._destroy();
  }

  private _compileProgram(macroCollection: ShaderMacroCollection): ShaderProgram | null {
    const engine = this._engine;
    const { vertexSource, fragmentSource } = ShaderFactory.compilePlatformSource(
      engine,
      macroCollection,
      this._vertexSource,
      this._fragmentSource
    );

    const program = new ShaderProgram(engine, vertexSource, fragmentSource, this._feedbackVaryings);

    if (!program.isValid) {
      Logger.error("TransformFeedbackSimulator: Failed to compile shader program.");
      return null;
    }

    return program;
  }
}
