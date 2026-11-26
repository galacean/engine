import { ShaderLanguage } from "@galacean/engine-core";
import type { IWebGPUShaderCompiler } from "@galacean/engine-design";
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
  constructor(private readonly webgpu?: IWebGPUShaderCompiler) {}
  private _includeMap: IncludeMap = {};
  private readonly _chunkOutputCache: ChunkOutputCache = new Map();
  private _sourceParserObjectPool?: ParserObjectPool;
  private _parserObjectPool?: ParserObjectPool;
  private _runtimeParser?: ReturnType<typeof createRuntimeShaderTargetParser>;
  private _idleClearTimer?: ReturnType<typeof setTimeout>;

  private _scheduleIdleCleanup(): void {
    if (this._idleClearTimer !== undefined) {
      clearTimeout(this._idleClearTimer);
    }
    const timer = setTimeout(() => {
      this._idleClearTimer = undefined;
      this._sourceParserObjectPool = undefined;
      this._parserObjectPool = undefined;
      this._chunkOutputCache.clear();
      this._runtimeParser = undefined;
    }, 500);
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      (timer as { unref?: () => void }).unref?.();
    }
    this._idleClearTimer = timer;
  }

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
    try {
      const sourcePool = (this._sourceParserObjectPool ??= new ParserObjectPool());
      return requireValidShaderSource(ShaderSourceParser.parseStrict(sourceCode, sourcePool));
    } finally {
      this._scheduleIdleCleanup();
    }
  }

  /**
   * Parses and generates one runtime ShaderLab pass.
   * @param source - GLSL source contained by the pass.
   * @param vertexEntry - Vertex entry function name.
   * @param fragmentEntry - Fragment entry function name.
   * @param backend - Target shader language.
   * @param sourceFile - Optional logical source location used for relative includes and attribution.
   * @param sourceScopeStarts - Inherited ShaderLab content boundaries from source parsing.
   * @returns Generated stage program, or `undefined` after a blocking parser or backend error.
   * @internal
   */
  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    backend: ShaderLanguage,
    sourceFile?: string,
    sourceScopeStarts?: readonly number[]
  ): IShaderProgramSource | undefined {
    try {
      const parserPool = (this._parserObjectPool ??= new ParserObjectPool());
      const runtimeParser = (this._runtimeParser ??= createRuntimeShaderTargetParser(parserPool));
      const parsed = parseRuntimeShaderPass(
        source,
        this._includeMap,
        this._chunkOutputCache,
        sourceFile,
        parserPool,
        runtimeParser,
        sourceScopeStarts
      );
      return generateParsedShaderPassData(parsed, vertexEntry, fragmentEntry, backend, undefined, this.webgpu, false);
    } finally {
      this._scheduleIdleCleanup();
    }
  }

  /**
   * Generates backend source from a pass returned by `ShaderAnalyzer.analyze()` without parsing it again.
   * @param pass - Opaque parsed-pass handle from the analyzer result.
   * @param backend - Target shader language.
   * @returns Variant-selectable instructions and unselected text for inspection, or `undefined` on validation failure.
   * @throws TypeError when `pass` was not created by the compatible shader-parser package instance.
   */
  generate(pass: ParsedShaderPass, backend: ShaderLanguage): IShaderProgramSource | undefined {
    const { data, vertexEntry, fragmentEntry, coreInfo } = getParsedShaderPassPayload(pass);
    return generateParsedShaderPassData(data, vertexEntry, fragmentEntry, backend, coreInfo, this.webgpu);
  }
}
