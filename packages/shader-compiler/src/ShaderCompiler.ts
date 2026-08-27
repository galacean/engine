import { ShaderLanguage } from "@galacean/engine-core";
import type { IShaderSource } from "@galacean/engine-design";
import type { IShaderProgramSource } from "@galacean/engine-design/types/shader-compiler/IShaderProgramSource";
import {
  getParsedShaderPassPayload,
  normalizeShaderIncludeMap,
  ParserObjectPool,
  createRuntimeShaderTargetParser,
  parseRuntimeShaderPass,
  type IncludeMap,
  type ChunkOutputCache,
  ShaderSourceParser
} from "@galacean/engine-shader-parser/internal";
import type { ParsedShaderPass } from "@galacean/engine-shader-parser/shared";
import { generateParsedShaderPassData, requireValidShaderSource } from "./ShaderCompilation";

/**
 * Compiles ShaderLab sources into runtime GLES programs.
 *
 * Source parsing and backend generation remain independent of authoring diagnostics; structural
 * source errors reject compilation before partial runtime programs can be created. Offline `.shaderc`
 * validation lives in the bundler-only precompiler entry and is excluded from this runtime package surface.
 */
export class ShaderCompiler {
  private _includeMap: IncludeMap = {};
  private readonly _chunkOutputCache: ChunkOutputCache = new Map();
  private readonly _sourceParserObjectPool = new ParserObjectPool();
  private readonly _parserObjectPool = new ParserObjectPool();
  private readonly _runtimeParser = createRuntimeShaderTargetParser(this._parserObjectPool);

  /**
   * Replaces the `#include` lookup table and clears the derived chunk cache.
   * @param includeMap - Canonical include paths mapped to shader chunks.
   * @internal
   */
  _setIncludeMap(includeMap: IncludeMap): void {
    this._includeMap = normalizeShaderIncludeMap(includeMap);
    this._chunkOutputCache.clear();
  }

  /**
   * Parses one ShaderLab document into its source structure.
   * @param sourceCode - Complete ShaderLab source.
   * @returns Parsed subshaders, passes, entries, and render states.
   * @throws ShaderSourceParseError when source-structure diagnostics were produced.
   * @internal
   */
  _parseShaderSource(sourceCode: string): IShaderSource {
    this._chunkOutputCache.clear();
    return requireValidShaderSource(ShaderSourceParser.parseStrict(sourceCode, this._sourceParserObjectPool));
  }

  /**
   * Parses and generates one runtime ShaderLab pass.
   * @param source - GLSL source contained by the pass.
   * @param vertexEntry - Vertex entry function name.
   * @param fragmentEntry - Fragment entry function name.
   * @param backend - Target GLES language version.
   * @param sourceFile - Optional logical source location used for relative includes and attribution.
   * @returns Generated stage program, or `undefined` after a blocking parser or backend error.
   * @internal
   */
  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    backend: ShaderLanguage,
    sourceFile?: string
  ): IShaderProgramSource | undefined {
    const parsed = parseRuntimeShaderPass(
      source,
      this._includeMap,
      this._chunkOutputCache,
      sourceFile,
      this._parserObjectPool,
      this._runtimeParser
    );
    return generateParsedShaderPassData(parsed, vertexEntry, fragmentEntry, backend);
  }

  /**
   * Generates backend source from a pass returned by `ShaderAnalyzer.analyze()` without parsing it again.
   * @param pass - Opaque parsed-pass handle from the analyzer result.
   * @param backend - Target GLES language version.
   * @returns Generated stage source, or `undefined` when parsing or entry validation failed.
   * @throws TypeError when `pass` was not created by the compatible shader-parser package instance.
   */
  generate(pass: ParsedShaderPass, backend: ShaderLanguage): IShaderProgramSource | undefined {
    const { data, vertexEntry, fragmentEntry, coreInfo } = getParsedShaderPassPayload(pass);
    return generateParsedShaderPassData(data, vertexEntry, fragmentEntry, backend, coreInfo);
  }
}
