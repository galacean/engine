import { CodeGenBackEnd } from "./Backend";
import { IShaderInfo } from "./IShaderInfo";
import { ShaderContent } from "./shaderContent/ShaderContent";

/**
 * Shader lab interface.
 */
export interface IShaderLab {
  /**
   * Parse shader source to get the structure of shader.
   */
  parseShaderContent(shaderSource: string): ShaderContent;

  /**
   * Parse shader pass source code.
   */
  parseShaderPass(
    shaderPassSource: string,
    vertexEntry: string,
    fragmentEntry: string,
    macros: string[],
    backend: CodeGenBackEnd
  ): IShaderInfo;

  /**
   * Add new include shader slice.
   */
  registerInclude(includeName: string, includeSource: string): void;
}
