import {
  ChunkOutputCache,
  IncludeMap,
  parseShaderPass,
  ShaderCompilerUtils,
  ShaderIOAnalyzer,
  ShaderSourceParser
} from "@galacean/engine-shader-parser";
import type { ASTNode, ShaderRange } from "@galacean/engine-shader-parser";
import type { IShaderAnalyzer, IShaderPassSource, IShaderProgram, IShaderSource } from "@galacean/engine-design";
import { Logger } from "@galacean/engine-core";
import type { Diagnostic } from "./Diagnostic";
import { DiagnosticSeverity, formatDiagnostic } from "./Diagnostic";
import { gseErrorToDiagnostic } from "./convert";

export interface AnalyzerOptions {
  /** `#include` lookup table; keys are include paths, values are chunk sources. */
  includeMap?: IncludeMap;
}

export interface AnalyzedPass {
  /**
   * The parsed AST for this pass. Feed it to the compiler's `visitShaderProgram` to generate GLSL
   * without re-parsing. Valid only until the next `analyze()` — AST nodes are pooled and recycled,
   * so consume it before analyzing another source.
   */
  program: ASTNode.GLShaderProgram;
  vertexEntry: string;
  fragmentEntry: string;
}

export interface AnalysisResult {
  /** Structured diagnostics from shader-source structure parsing and per-pass GLSL analysis. */
  diagnostics: Diagnostic[];
  /** Per-pass parsed ASTs in source order — reuse for codegen so the editor parses only once. */
  passes: AnalyzedPass[];
}

/**
 * Static analyzer for shader source / GLSL. Drives parse + the parser's IO analysis and surfaces
 * structured diagnostics the runtime compiler discards. It does not run code generation.
 */
export class ShaderAnalyzer implements IShaderAnalyzer {
  private _includeMap: IncludeMap = {};
  private readonly _chunkOutputCache: ChunkOutputCache = new Map();

  analyze(source: string, options?: AnalyzerOptions): AnalysisResult {
    if (options?.includeMap) {
      this._includeMap = options.includeMap;
      this._chunkOutputCache.clear();
    }

    const diagnostics: Diagnostic[] = [];
    const passes: AnalyzedPass[] = [];

    ShaderCompilerUtils.clearAllShaderCompilerObjectPool();

    try {
      const shaderSource: IShaderSource = ShaderSourceParser.parse(source);
      diagnostics.push(...ShaderSourceParser.errors.map((e) => gseErrorToDiagnostic(e)));
      for (const subShader of shaderSource.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          const analyzed = this._analyzePass(pass, diagnostics);
          if (analyzed) passes.push(analyzed);
        }
      }
    } catch (e) {
      diagnostics.push(gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e))));
    }

    this._logDiagnostics(diagnostics);
    return { diagnostics, passes };
  }

  /**
   * @internal
   * Diagnose an already-parsed program (no re-parse) plus its parse-stage errors, surfacing the
   * result via Logger. Called by the compiler when this analyzer is injected.
   */
  _diagnose(program: IShaderProgram, parseErrors: Error[], vertexEntry: string, fragmentEntry: string): void {
    const shaderData = (program as unknown as ASTNode.GLShaderProgram).shaderData;
    const diagnostics: Diagnostic[] = parseErrors.map((e) => gseErrorToDiagnostic(e));
    const { errors: ioErrors } = ShaderIOAnalyzer.analyze(
      shaderData,
      vertexEntry,
      fragmentEntry,
      ShaderCompilerUtils.processingPassText
    );
    for (const e of ioErrors) diagnostics.push(gseErrorToDiagnostic(e));
    this._logDiagnostics(diagnostics);
  }

  /** Print collected diagnostics through the engine Logger (off by default; `Logger.enable()` to see them). */
  private _logDiagnostics(diagnostics: Diagnostic[]): void {
    for (const d of diagnostics) {
      switch (d.severity) {
        case DiagnosticSeverity.Error:
          Logger.error(formatDiagnostic(d));
          break;
        case DiagnosticSeverity.Warning:
          Logger.warn(formatDiagnostic(d));
          break;
      }
    }
  }

  private _analyzePass(pass: IShaderPassSource, diagnostics: Diagnostic[]): AnalyzedPass | null {
    const { vertexEntry, fragmentEntry } = pass;
    try {
      const { program, errors, passText } = parseShaderPass(pass.contents, this._includeMap, this._chunkOutputCache);
      diagnostics.push(...errors.map((e) => gseErrorToDiagnostic(e)));
      if (program) {
        // IShaderPassSource types the entry location structurally (design stays class-free); the parser
        // stored a ShaderRange there — restore the concrete type ShaderIOAnalyzer/createGSError consume.
        const { errors: ioErrors } = ShaderIOAnalyzer.analyze(
          program.shaderData,
          vertexEntry,
          fragmentEntry,
          passText,
          pass.vertexEntryLocation as ShaderRange | undefined,
          pass.fragmentEntryLocation as ShaderRange | undefined
        );
        diagnostics.push(...ioErrors.map((e) => gseErrorToDiagnostic(e)));
        return { program, vertexEntry, fragmentEntry };
      }
    } catch (e) {
      diagnostics.push(gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e))));
    }
    return null;
  }
}
