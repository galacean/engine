import { IPrecompiledShader } from "./IPrecompiledShader";
import { IShaderProgramSource } from "./IShaderProgramSource";
import { IShaderSource } from "./shaderSource/IShaderSource";

/**
 * Shader compiler interface.
 */
export interface IShaderCompiler {
  /**
   * @internal
   * Parse shader source code to get the source structure of shader.
   */
  _parseShaderSource(sourceCode: string): IShaderSource;

  /**
   * @internal
   * Parse shader pass source code.
   * @param sourceFile - Canonical root source location used to resolve relative `#include` directives.
   */
  _parseShaderPass(
    shaderPassSource: string,
    vertexEntry: string,
    fragmentEntry: string,
    backend: any,
    sourceFile?: string
  ): IShaderProgramSource | undefined;

  /**
   * @internal
   */
  _precompile(sourceCode: string, platformTarget: any, sourceFile?: string): IPrecompiledShader;
}
