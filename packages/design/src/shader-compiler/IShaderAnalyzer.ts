import { IShaderProgram } from "./IShaderProgram";

/**
 * Shader analyzer interface. Inject a concrete analyzer alongside the compiler (e.g.
 * `WebGLEngine.create({ shaderCompiler, shaderAnalyzer })`) to turn on diagnostics during shader
 * compilation. The compiler calls `_diagnose` on the already-parsed program — no re-parse — and the
 * analyzer surfaces the diagnostics itself (Logger and/or an `onDiagnostics` callback).
 */
export interface IShaderAnalyzer {
  /**
   * @internal
   * Diagnose an already-parsed pass program plus its parse-stage errors. Runs no parse and no code
   * generation; surfaces the diagnostics through the analyzer's own reporting.
   */
  _diagnose(program: IShaderProgram, parseErrors: Error[], vertexEntry: string, fragmentEntry: string): void;
}
