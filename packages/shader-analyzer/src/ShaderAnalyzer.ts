import {
  ChunkOutputCache,
  IncludeMap,
  Lexer,
  Preprocessor,
  ShaderCompilerUtils,
  ShaderSourceParser,
  ShaderTargetParser
} from "@galacean/engine-shader-parser";
import type { IShaderSource } from "@galacean/engine-design";
import { GLES300Visitor } from "@galacean/engine-shader-compiler";

export interface AnalyzerOptions {
  /** `#include` lookup table; keys are include paths, values are chunk sources. */
  includeMap?: IncludeMap;
}

export interface AnalysisResult {
  /** Diagnostics from ShaderLab structure parsing and per-pass GLSL parse + codegen. */
  diagnostics: Error[];
}

/**
 * Static analyzer for ShaderLab / GLSL. Drives the full compile pipeline (parse + code generation)
 * and surfaces the diagnostics the runtime compiler discards.
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

    const diagnostics: Error[] = [];

    ShaderCompilerUtils.clearAllShaderCompilerObjectPool();

    let shaderSource: IShaderSource;
    try {
      shaderSource = ShaderSourceParser.parse(source);
    } catch (e) {
      diagnostics.push(ShaderAnalyzer._toError(e));
      return { diagnostics };
    }
    diagnostics.push(...ShaderSourceParser.errors);

    for (const subShader of shaderSource.subShaders) {
      for (const pass of subShader.passes) {
        if (pass.isUsePass) continue;
        this._analyzePass(pass.contents, pass.vertexEntry, pass.fragmentEntry, diagnostics);
      }
    }

    return { diagnostics };
  }

  private _analyzePass(source: string, vertexEntry: string, fragmentEntry: string, diagnostics: Error[]): void {
    const { _parser: parser } = ShaderAnalyzer;
    try {
      const macroDefineList = {};
      const noIncludeContent = Preprocessor.parse(source, "", this._includeMap, this._chunkOutputCache);
      const lexer = new Lexer(noIncludeContent, macroDefineList);
      const tokens = lexer.tokenize();
      ShaderCompilerUtils.processingPassText = noIncludeContent;
      const program = parser.parse(tokens, macroDefineList);
      diagnostics.push(...parser.errors);
      if (program) {
        // Run code generation too: some diagnostics (varying/attribute/MRT struct misuse,
        // gl_FragColor with MRT, …) are only detected during codegen, not parsing.
        const codeGen = GLES300Visitor.getVisitor();
        codeGen.visitShaderProgram(program, vertexEntry, fragmentEntry);
        diagnostics.push(...codeGen.errors);
      }
    } catch (e) {
      // Some authoring errors (e.g. malformed `#define`) throw during lex/preprocess rather than
      // landing in `parser.errors`; capture them so a single analyze() surfaces every diagnostic.
      diagnostics.push(ShaderAnalyzer._toError(e));
    } finally {
      ShaderCompilerUtils.processingPassText = undefined;
    }
  }

  private static _toError(e: unknown): Error {
    return e instanceof Error ? e : new Error(String(e));
  }
}
