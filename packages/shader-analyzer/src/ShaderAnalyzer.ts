import {
  ChunkOutputCache,
  IncludeMap,
  parseShaderPass,
  ShaderCompilerUtils,
  ShaderIOAnalyzer,
  ShaderSourceParser
} from "@galacean/engine-shader-parser";
import type { ASTNode } from "@galacean/engine-shader-parser";
import type { IShaderSource } from "@galacean/engine-design";
import { Logger } from "@galacean/engine-core";
import type { Diagnostic } from "./Diagnostic";
import type { CustomRule, RuleContext } from "./Rule";
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
export class ShaderAnalyzer {
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
    const passes: AnalyzedPass[] = [];

    ShaderCompilerUtils.clearAllShaderCompilerObjectPool();

    let shaderSource: IShaderSource | undefined;
    try {
      shaderSource = ShaderSourceParser.parse(source);
      diagnostics.push(...ShaderSourceParser.errors.map((e) => gseErrorToDiagnostic(e)));
      for (const subShader of shaderSource.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          const analyzed = this._analyzePass(pass.contents, pass.vertexEntry, pass.fragmentEntry, diagnostics);
          if (analyzed) passes.push(analyzed);
        }
      }
    } catch (e) {
      diagnostics.push(gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e))));
    }

    if (this._rules.length > 0) {
      this._runRules(source, shaderSource, diagnostics);
    }

    this._logDiagnostics(diagnostics);
    return { diagnostics, passes };
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

  private _analyzePass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    diagnostics: Diagnostic[]
  ): AnalyzedPass | null {
    try {
      const { program, errors, passText } = parseShaderPass(source, this._includeMap, this._chunkOutputCache);
      diagnostics.push(...errors.map((e) => gseErrorToDiagnostic(e)));
      if (program) {
        const { errors: ioErrors } = ShaderIOAnalyzer.analyze(program.shaderData, vertexEntry, fragmentEntry, passText);
        diagnostics.push(...ioErrors.map((e) => gseErrorToDiagnostic(e)));
        return { program, vertexEntry, fragmentEntry };
      }
    } catch (e) {
      diagnostics.push(gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e))));
    }
    return null;
  }
}
