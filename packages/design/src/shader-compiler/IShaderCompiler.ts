import { IShaderProgramSource } from "./IShaderProgramSource";
import { IShaderSource } from "./shaderSource/IShaderSource";

/**
 * Shader compiler interface.
 */
export interface IShaderCompiler {
  /**
   * @internal
   * Bind the live logical include registry used by runtime shader creation.
   * @param includeMap - Canonical include keys mapped to GLSL chunk sources.
   */
  _setIncludeMap(includeMap: Readonly<Record<string, string | undefined>>): void;

  /**
   * @internal
   * Parse shader source code to get the source structure of shader.
   * @param sourceCode - Complete ShaderLab source.
   * @returns Parsed ShaderLab source structure.
   * @throws Error when source-structure parsing fails.
   */
  _parseShaderSource(sourceCode: string): IShaderSource;

  /**
   * @internal
   * Parse shader pass source code.
   * @param shaderPassSource - GLSL source contained by one ShaderLab pass.
   * @param vertexEntry - Vertex entry function name.
   * @param fragmentEntry - Fragment entry function name.
   * @param backend - Backend-specific shader target.
   * @param sourceFile - Canonical root source location used to resolve relative `#include` directives.
   * @returns Generated stage program, or `undefined` after a blocking parser or backend error.
   */
  _parseShaderPass(
    shaderPassSource: string,
    vertexEntry: string,
    fragmentEntry: string,
    backend: any,
    sourceFile?: string
  ): IShaderProgramSource | undefined;
}
