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
   * @param basePathForIncludeKey the base path to resolve the relative path of `#include` directive. Must follow the specifications of [URL.origin](https://developer.mozilla.org/en-US/docs/Web/API/URL/origin), like: `shaders://root/`
   */
  _parseShaderPass(
    shaderPassSource: string,
    vertexEntry: string,
    fragmentEntry: string,
    macros: any[],
    backend: number,
    platformMacros: string[],
    basePathForIncludeKey: string
  ): IShaderProgramSource;
}
