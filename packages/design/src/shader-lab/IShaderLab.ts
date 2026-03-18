import { IPrecompiledShader } from "./IPrecompiledShader";
import { IShaderProgramSource } from "./IShaderProgramSource";
import { IShaderSource } from "./shaderSource/IShaderSource";

/**
 * Shader lab interface.
 */
export interface IShaderLab {
  /**
   * @internal
   * Parse shader source code to get the source structure of shader.
   */
  _parseShaderSource(sourceCode: string): IShaderSource;

  /**
   * @internal
   * Parse shader pass source code.
   * @param basePathForIncludeKey the base path to resolve the relative path of `#include` directive. Must follow the specifications of [URL.origin](https://developer.mozilla.org/en-US/docs/Web/API/URL/origin), like: `shaders://root/`
   */
  _parseShaderPass(
    shaderPassSource: string,
    vertexEntry: string,
    fragmentEntry: string,
    backend: any,
    basePathForIncludeKey: string
  ): IShaderProgramSource;

  _parseMacros(context: string, macros: Array<{ name: string; value: string }>): string;

  /**
   * @internal
   * Precompile shader source code into a serializable format.
   * The result can be serialized to binary (.gsb) and loaded at runtime
   * to skip Preprocessor + Lexer + Parser + CodeGen stages.
   * @param sourceCode - ShaderLab source code
   * @param platformTarget - Target shader language (ShaderLanguage enum value)
   * @param basePath - Base path for resolving #include directives
   */
  _precompile(sourceCode: string, platformTarget: any, basePath: string): IPrecompiledShader;
}
