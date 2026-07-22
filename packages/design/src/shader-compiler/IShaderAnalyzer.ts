import { IShaderProgram } from "./IShaderProgram";

/**
 * Diagnoses parsed shader programs supplied by a shader compiler.
 */
export interface IShaderAnalyzer {
  /**
   * @internal
   * Diagnoses an already-parsed shader pass.
   * @param program - Parsed shader program.
   * @param parseErrors - Errors produced while parsing the pass.
   * @param vertexEntry - Vertex entry-point name.
   * @param fragmentEntry - Fragment entry-point name.
   * @returns Whether no blocking diagnostics were reported and code generation may proceed.
   */
  _diagnose(program: IShaderProgram, parseErrors: Error[], vertexEntry: string, fragmentEntry: string): boolean;
}
