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
import { ShaderValidator } from "./ShaderValidator";

/** Options used when analyzing shader source. */
export interface AnalyzerOptions {
  /** `#include` lookup table; keys are include paths, values are chunk sources. */
  includeMap?: IncludeMap;
}

/** Parsed pass available for subsequent code generation. */
export interface AnalyzedPass {
  /**
   * Parsed AST for this pass. Valid until the next call to {@link ShaderAnalyzer.analyze} because
   * AST nodes are pooled.
   */
  program: ASTNode.GLShaderProgram;
  /** Vertex entry-point name. */
  vertexEntry: string;
  /** Fragment entry-point name. */
  fragmentEntry: string;
}

/** Result of analyzing shader source. */
export interface AnalysisResult {
  /** Structured diagnostics from shader-source structure parsing and per-pass GLSL analysis. */
  diagnostics: Diagnostic[];
  /** Parsed passes in source order, empty when an error prevents code generation. */
  passes: AnalyzedPass[];
}

/**
 * Analyzes ShaderLab source and GLSL semantics without generating backend source.
 */
export class ShaderAnalyzer implements IShaderAnalyzer {
  private _includeMap: IncludeMap = {};
  private readonly _chunkOutputCache: ChunkOutputCache = new Map();

  /**
   * Analyzes shader source.
   * @param source - ShaderLab source to analyze.
   * @param options - Analysis options.
   * @returns Diagnostics and reusable parsed passes.
   */
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

    if (diagnostics.some((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error)) passes.length = 0;
    this._logDiagnostics(diagnostics);
    return { diagnostics, passes };
  }

  /**
   * @internal
   * Diagnose an already-parsed program (no re-parse) plus its parse-stage errors, surfacing the
   * result via Logger. Called by the compiler when this analyzer is injected.
   */
  _diagnose(program: IShaderProgram, parseErrors: Error[], vertexEntry: string, fragmentEntry: string): boolean {
    const glProgram = program as unknown as ASTNode.GLShaderProgram;
    const shaderData = glProgram.shaderData;
    const passText = ShaderCompilerUtils.processingPassText;
    const diagnostics: Diagnostic[] = parseErrors.map((e) => gseErrorToDiagnostic(e));
    for (const e of ShaderValidator.validate(glProgram, passText, vertexEntry, fragmentEntry))
      diagnostics.push(gseErrorToDiagnostic(e));
    const { errors: ioErrors } = ShaderIOAnalyzer.analyze(shaderData, vertexEntry, fragmentEntry, passText);
    for (const e of ioErrors) diagnostics.push(gseErrorToDiagnostic(e));
    this._logDiagnostics(diagnostics);
    return !diagnostics.some((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error);
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
        diagnostics.push(
          ...ShaderValidator.validate(program, passText, vertexEntry, fragmentEntry).map((e) => gseErrorToDiagnostic(e))
        );
        // ShaderIOAnalyzer consumes the concrete parser range stored by the source parser.
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
