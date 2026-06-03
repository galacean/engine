import {
  ChunkOutputCache,
  GSError,
  IncludeMap,
  Lexer,
  Preprocessor,
  ShaderCompilerUtils,
  ShaderSourceParser,
  ShaderTargetParser
} from "@galacean/engine-shader-parser";
import type { IShaderSource } from "@galacean/engine-design";
import { GLES300Visitor } from "@galacean/engine-shader-compiler";
import { Logger } from "@galacean/engine-core";
import type { Diagnostic } from "./Diagnostic";
import type { CustomRule, RuleContext } from "./Rule";
import { gseErrorToDiagnostic } from "./convert";

export interface AnalyzerOptions {
  /** `#include` lookup table; keys are include paths, values are chunk sources. */
  includeMap?: IncludeMap;
}

export interface AnalysisResult {
  /** Structured diagnostics from ShaderLab structure parsing and per-pass GLSL parse + codegen. */
  diagnostics: Diagnostic[];
}

/**
 * Static analyzer for ShaderLab / GLSL. Drives the full compile pipeline (parse + code generation)
 * and surfaces structured diagnostics the runtime compiler discards.
 */
export class ShaderAnalyzer {
  private static _parser = ShaderTargetParser.create();

  private _includeMap: IncludeMap = {};
  private readonly _chunkOutputCache: ChunkOutputCache = new Map();
  private readonly _rules: CustomRule[] = [];

  /** Register a custom diagnostic rule; it runs after the built-in checks on every `analyze()`. */
  registerRule(rule: CustomRule): void {
    this._rules.push(rule);
  }

  analyze(source: string, options?: AnalyzerOptions): AnalysisResult {
    if (options?.includeMap) {
      this._includeMap = options.includeMap;
      this._chunkOutputCache.clear();
    }

    const diagnostics: Diagnostic[] = [];

    ShaderCompilerUtils.clearAllShaderCompilerObjectPool();

    let shaderSource: IShaderSource | undefined;
    try {
      shaderSource = ShaderSourceParser.parse(source);
      diagnostics.push(
        ...(ShaderSourceParser.errors.map((e) => gseErrorToDiagnostic(e)).filter(Boolean) as Diagnostic[])
      );
      for (const subShader of shaderSource.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          this._analyzePass(pass.contents, pass.vertexEntry, pass.fragmentEntry, diagnostics);
        }
      }
    } catch (e) {
      const d = gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e)));
      if (d) diagnostics.push(d);
    }

    if (this._rules.length > 0) {
      this._runRules(source, shaderSource, diagnostics);
    }

    this._logDiagnostics(diagnostics);
    return { diagnostics };
  }

  /** Print collected diagnostics through the engine Logger (off by default; `Logger.enable()` to see them). */
  private _logDiagnostics(diagnostics: Diagnostic[]): void {
    for (const d of diagnostics) {
      const text = `[${d.code}] ${d.message} (line ${d.range.start.line}, col ${d.range.start.column})`;
      switch (d.severity) {
        case "error":
          Logger.error(text);
          break;
        case "warning":
          Logger.warn(text);
          break;
        case "info":
          Logger.info(text);
          break;
        case "hint":
          Logger.debug(text);
          break;
      }
    }
  }

  private _runRules(source: string, shaderSource: IShaderSource | undefined, diagnostics: Diagnostic[]): void {
    const positionAt = (offset: number): Diagnostic["range"]["start"] => {
      let line = 1;
      let column = 1;
      const end = Math.min(offset, source.length);
      for (let i = 0; i < end; i++) {
        if (source.charCodeAt(i) === 10 /* \n */) {
          line++;
          column = 1;
        } else {
          column++;
        }
      }
      return { line, column, offset };
    };

    for (const rule of this._rules) {
      const context: RuleContext = {
        source,
        shaderSource,
        positionAt,
        report: (d) =>
          diagnostics.push({
            severity: d.severity ?? "error",
            code: `${rule.name}/${d.code}`,
            message: d.message,
            range: d.range,
            source: "galacean-shader-analyzer"
          })
      };
      try {
        rule.check(context);
      } catch (e) {
        // A buggy custom rule must not break analysis; surface its failure as a warning instead.
        diagnostics.push({
          severity: "warning",
          code: `${rule.name}/rule-error`,
          message: `Custom rule "${rule.name}" threw: ${e instanceof Error ? e.message : String(e)}`,
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
          source: "galacean-shader-analyzer"
        });
      }
    }
  }

  private _analyzePass(source: string, vertexEntry: string, fragmentEntry: string, diagnostics: Diagnostic[]): void {
    const { _parser: parser } = ShaderAnalyzer;
    try {
      const macroDefineList = {};
      const noIncludeContent = Preprocessor.parse(source, "", this._includeMap, this._chunkOutputCache);
      const lexer = new Lexer(noIncludeContent, macroDefineList);
      const tokens = lexer.tokenize();
      ShaderCompilerUtils.processingPassText = noIncludeContent;
      const program = parser.parse(tokens, macroDefineList);
      diagnostics.push(...(parser.errors.map((e) => gseErrorToDiagnostic(e)).filter(Boolean) as Diagnostic[]));
      if (program) {
        const codeGen = GLES300Visitor.getVisitor();
        codeGen.visitShaderProgram(program, vertexEntry, fragmentEntry);
        diagnostics.push(...(codeGen.errors.map((e) => gseErrorToDiagnostic(e)).filter(Boolean) as Diagnostic[]));
      }
    } catch (e) {
      const d = gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e)));
      if (d) diagnostics.push(d);
    } finally {
      ShaderCompilerUtils.processingPassText = undefined;
    }
  }
}
