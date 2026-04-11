import { Engine } from "../Engine";
import { Logger } from "../base/Logger";
import { ShaderFactory } from "../shaderlib/ShaderFactory";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ShaderPass } from "../shader/ShaderPass";
import { ShaderProgram } from "../shader/ShaderProgram";

/**
 * @internal
 * Shared shader definition for Transform Feedback simulation.
 * Multiple simulators using the same shader share a single program pool per engine.
 */
export class TransformFeedbackShader {
  /** @internal */
  readonly _id: number;
  readonly vertexSource: string;
  readonly fragmentSource: string;
  readonly feedbackVaryings: string[];

  constructor(vertexSource: string, fragmentSource: string, feedbackVaryings: string[]) {
    this._id = ShaderPass._shaderPassCounter++;
    this.vertexSource = vertexSource;
    this.fragmentSource = fragmentSource;
    this.feedbackVaryings = feedbackVaryings;
  }

  /**
   * Get or compile a shader program for the given engine and macro combination.
   */
  getProgram(engine: Engine, macroCollection: ShaderMacroCollection): ShaderProgram | null {
    const map = engine._getShaderProgramMap(this._id);

    let program = map.get(macroCollection);
    if (program) return program;

    const { vertexSource, fragmentSource } = ShaderFactory.compilePlatformSource(
      engine,
      macroCollection,
      this.vertexSource,
      this.fragmentSource
    );

    program = new ShaderProgram(engine, vertexSource, fragmentSource, this.feedbackVaryings);

    if (!program.isValid) {
      Logger.error("TransformFeedbackShader: Failed to compile shader program.");
      return null;
    }

    map.cache(program);
    return program;
  }
}
