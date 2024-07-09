import { IShaderProgramSource } from "./IShaderProgramSource";
import { IShaderContent } from "./shaderContent/IShaderContent";

/**
 * Shader lab interface.
 */
export interface IShaderLab {
  /**
   * @internal
   * Parse shader source to get the structure of shader.
   */
  _parseShaderContent(shaderSource: string): IShaderContent;

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
  ): IShaderProgramSource;
}
