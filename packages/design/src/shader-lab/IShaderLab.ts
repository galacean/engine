import { EBackend } from "./Backend";
import { IShaderInfo } from "./IShaderInfo";
import { ShaderStruct } from "./shaderStruct/ShaderStruct";

/**
 * Shader lab interface.
 */
export interface IShaderLab {
  /**
   * Parse shader source to get the structure of shader.
   */
  parseShaderStruct(shaderSource: string): ShaderStruct;

  /**
   * Parse shader pass source code.
   */
  parseShaderPass(
    shaderPassSource: string,
    vertexEntry: string,
    fragmentEntry: string,
    macros: string[],
    backend: EBackend
  ): IShaderInfo;

  /**
   * Add new include shader slice.
   */
  registerInclude(includeName: string, includeSource: string): void;
}
