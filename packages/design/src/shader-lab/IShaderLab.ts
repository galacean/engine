import { ShaderProgramSource } from "./ShaderProgramSource";
import { ShaderContent } from "./shaderContent/ShaderContent";

/**
 * Shader lab interface.
 */
export interface IShaderLab {
  /**
   * @internal
   * Parse shader source to get the structure of shader.
   */
  _parseShaderContent(shaderSource: string): ShaderContent;

  /**
   * @internal
   * Parse shader pass source code.
   */
  _parseShaderPass(
    shaderPassSource: string,
    vertexEntry: string,
    fragmentEntry: string,
    macros: string[],
    backend: number
  ): ShaderProgramSource;
}
