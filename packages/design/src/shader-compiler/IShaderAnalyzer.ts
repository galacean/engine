import { IShaderProgram } from "./IShaderProgram";

/**
 * Shader analyzer interface. Inject a concrete analyzer alongside the compiler (e.g.
 * `WebGLEngine.create({ shaderCompiler, shaderAnalyzer })`) to turn on diagnostics during shader
 * compilation. The compiler calls `_diagnose` on the already-parsed program — no re-parse — and the
 * analyzer surfaces the diagnostics itself (via the engine Logger).
 */
export interface IShaderAnalyzer {
  /**
   * @internal
   * Diagnose an already-parsed pass program plus its parse-stage errors. Runs no parse and no code
   * generation; surfaces the diagnostics through the analyzer's own reporting.
   * @returns Whether no blocking diagnostics were reported and code generation may proceed.
   */
  _diagnose(program: IShaderProgram, parseErrors: Error[], vertexEntry: string, fragmentEntry: string): boolean;
}
