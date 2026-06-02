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
import type { Diagnostic } from "./Diagnostic";
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

  analyze(source: string, options?: AnalyzerOptions): AnalysisResult {
    if (options?.includeMap) {
      this._includeMap = options.includeMap;
      this._chunkOutputCache.clear();
    }

    const diagnostics: Diagnostic[] = [];

    ShaderCompilerUtils.clearAllShaderCompilerObjectPool();

    let shaderSource: IShaderSource;
    try {
      shaderSource = ShaderSourceParser.parse(source);
    } catch (e) {
      const d = gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e)));
      if (d) diagnostics.push(d);
      return { diagnostics };
    }
    diagnostics.push(
      ...(ShaderSourceParser.errors.map((e) => gseErrorToDiagnostic(e)).filter(Boolean) as Diagnostic[])
    );

    for (const subShader of shaderSource.subShaders) {
      for (const pass of subShader.passes) {
        if (pass.isUsePass) continue;
        this._analyzePass(pass.contents, pass.vertexEntry, pass.fragmentEntry, diagnostics);
      }
    }

    return { diagnostics };
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
