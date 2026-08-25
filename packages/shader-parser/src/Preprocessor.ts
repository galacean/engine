import type { ASTNode } from "./parser/AST";
import type { BranchSignature } from "./common/BaseToken";
import { Logger } from "@galacean/engine-core";
import { normalizeShaderIncludeKey } from "@galacean/engine-design";
import { GSError, GSErrorName } from "./GSError";
import { ShaderPosition } from "./common/ShaderPosition";
import { ShaderRange } from "./common/ShaderRange";
import type { ShaderSourceMapSegment } from "./ir";
import { PreprocessorMacroState, type CachedPreprocessorMacroState } from "./preprocessor/PreprocessorMacroState";

const SHADER_ROOT_PATH = "shaders://root/";
const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:/;

export type IncludeMap = { readonly [includeName: string]: string | undefined };

export interface PreprocessResult {
  /** Expanded shader source. */
  content: string;
  /** Include-resolution failures collected while expanding the source. */
  errors: GSError[];
  /** Mapping from expanded offsets back to the source chunks that produced them. */
  sourceMap: ShaderSourceMapSegment[];
}

export type ChunkOutputCache = Map<string, PreprocessResult>;

const cachedMacroStates = new WeakMap<PreprocessResult, CachedPreprocessorMacroState>();

export interface MacroDefineInfo {
  isFunction: boolean;
  params: string[];
  /** Value AST. Set when the replacement list parses as `expression` (which
   *  includes comma-separated lists per C99 §6.10.3); absent for the GLSL ES
   *  3.00 §3.4 opaque cases the grammar can't reduce (empty, type-alias keyword,
   *  trailing punctuation, unbalanced bracket, trailing operator). Identifier
   *  references inside are collected by `MacroCallSymbol._collectIdentifierRefs`
   *  walking this subtree. */
  valueAst?: ASTNode.Expression;
  /** Whitespace-normalized directive text. Dedup key against re-includes in
   *  the same branch; differing values produce different keys. */
  dedupKey: string;
  /** `#ifdef` branch at registration time; call sites filter to visible entries. */
  branch: BranchSignature;
}

export interface MacroDefineList {
  [macroName: string]: MacroDefineInfo[];
}

export class Preprocessor {
  private static readonly _includePathReg = /^[ \t]*"([^"\r\n]+)"[ \t]*(?:(?:\/\/.*)|(?:\/\*.*\*\/[ \t]*))?$/;
  private static readonly _directiveReg =
    /^[ \t]*#(include|define|undef|if|ifdef|ifndef|elif|else|endif)\b([^\r\n]*)/gm;

  static parse(
    source: string,
    basePathForIncludeKey: string,
    includeMap: IncludeMap,
    chunkOutputCache: ChunkOutputCache,
    sourceFile?: string,
    sourceScopeStarts?: readonly number[]
  ): string {
    const result = this.parseWithErrors(
      source,
      basePathForIncludeKey,
      includeMap,
      chunkOutputCache,
      sourceFile,
      true,
      sourceScopeStarts
    );
    for (const error of result.errors) Logger.error(error.toString());
    return result.content;
  }

  /**
   * Expands includes and returns any include-resolution failures with source locations.
   *
   * @param source - Source to preprocess.
   * @param basePathForIncludeKey - Base URL for relative include paths.
   * @param includeMap - Include-path lookup table.
   * @param chunkOutputCache - Cache for expanded include chunks.
   * @param sourceFile - Canonical path of the root source.
   * @param trackSourceMap - Whether to retain generated-to-original source segments.
   * @param sourceScopeStarts - Start offsets of inherited ShaderLab content layers.
   * @returns The expanded source and collected errors.
   */
  static parseWithErrors(
    source: string,
    basePathForIncludeKey: string,
    includeMap: IncludeMap,
    chunkOutputCache: ChunkOutputCache,
    sourceFile?: string,
    trackSourceMap = true,
    sourceScopeStarts?: readonly number[]
  ): PreprocessResult {
    return this._expand(
      source,
      basePathForIncludeKey,
      includeMap,
      chunkOutputCache,
      new Set(),
      sourceFile,
      trackSourceMap,
      new PreprocessorMacroState(),
      sourceScopeStarts,
      0
    );
  }

  private static _expand(
    source: string,
    basePathForIncludeKey: string,
    includeMap: IncludeMap,
    chunkOutputCache: ChunkOutputCache,
    activeIncludePaths: Set<string>,
    sourceFile: string | undefined,
    trackSourceMap: boolean,
    macroState: PreprocessorMacroState,
    sourceScopeStarts: readonly number[] | undefined,
    inheritedSourceScope: number
  ): PreprocessResult {
    const errors: GSError[] = [];
    const sourceMap: ShaderSourceMapSegment[] = [];
    const parts: string[] = [];
    let sourceOffset = 0;
    let generatedOffset = 0;
    let match: RegExpExecArray | null;
    const directiveSource = this._maskDirectiveTrivia(source);
    const directiveReg = new RegExp(this._directiveReg.source, this._directiveReg.flags);

    const appendSource = (start: number, end: number, keep: boolean): void => {
      while (start < end) {
        const nextBoundary = this._nextSourceScopeStart(start, end, sourceScopeStarts);
        const segmentEnd = nextBoundary ?? end;
        const originalText = source.slice(start, segmentEnd);
        const text = keep ? originalText : this._maskText(originalText);
        parts.push(text);
        if (trackSourceMap) {
          sourceMap.push({
            generatedStart: generatedOffset,
            generatedEnd: generatedOffset + text.length,
            sourceStart: start,
            source,
            sourceFile,
            sourceScope: this._sourceScopeAt(start, sourceScopeStarts, inheritedSourceScope)
          });
        }
        generatedOffset += text.length;
        start = segmentEnd;
      }
    };

    while ((match = directiveReg.exec(directiveSource))) {
      appendSource(sourceOffset, match.index, macroState.reachable);
      const directive = match[1];
      const directiveBody = match[2] ?? "";
      if (directive !== "include") {
        const result = macroState.processDirective(directive, this._stripLineComment(directiveBody));
        if (result.error) {
          const leadingWhitespace = directiveBody.length - directiveBody.trimStart().length;
          const expressionLength = directiveBody.trim().length;
          const expressionOffset = directiveReg.lastIndex - directiveBody.length + leadingWhitespace;
          const expressionStart = expressionOffset + Math.min(result.errorStart ?? 0, expressionLength);
          const expressionEnd = expressionOffset + Math.min(result.errorEnd ?? expressionLength, expressionLength);
          errors.push(this._createPreprocessorError(source, expressionStart, result.error, sourceFile, expressionEnd));
        }
        appendSource(match.index, directiveReg.lastIndex, result.keep);
        sourceOffset = directiveReg.lastIndex;
        continue;
      }

      if (!macroState.reachable) {
        appendSource(match.index, directiveReg.lastIndex, false);
        sourceOffset = directiveReg.lastIndex;
        continue;
      }

      const includeName = this._includePathReg.exec(directiveBody)?.[1];
      if (!includeName) {
        errors.push(
          this._createPreprocessorError(source, match.index, "Invalid shader include directive.", sourceFile)
        );
        sourceOffset = directiveReg.lastIndex;
        continue;
      }

      const path = this._resolveIncludePath(includeName, basePathForIncludeKey);
      if (!path) {
        errors.push(
          this._createPreprocessorError(
            source,
            match.index,
            `Invalid shader include path "${includeName}".`,
            sourceFile
          )
        );
        sourceOffset = directiveReg.lastIndex;
        continue;
      }

      const chunk = includeMap[path];
      if (chunk === undefined) {
        errors.push(
          this._createPreprocessorError(source, match.index, `Shader include "${path}" was not found.`, sourceFile)
        );
        sourceOffset = directiveReg.lastIndex;
        continue;
      }

      if (activeIncludePaths.has(path)) {
        errors.push(
          this._createPreprocessorError(source, match.index, `Shader include cycle detected at "${path}".`, sourceFile)
        );
        sourceOffset = directiveReg.lastIndex;
        continue;
      }

      const inputMacroState = macroState.captureSnapshot();
      const includeSourceScope = this._sourceScopeAt(match.index, sourceScopeStarts, inheritedSourceScope);
      const cacheKey = `${path}\0${macroState.cacheKey()}`;
      let expanded = chunkOutputCache.get(cacheKey);
      const cachedState = expanded && cachedMacroStates.get(expanded);
      if (!expanded || !cachedState) {
        activeIncludePaths.add(path);
        expanded = this._expand(
          chunk,
          this._canonicalIncludeURL(path),
          includeMap,
          chunkOutputCache,
          activeIncludePaths,
          path,
          trackSourceMap,
          macroState,
          undefined,
          includeSourceScope
        );
        activeIncludePaths.delete(path);
        cachedMacroStates.set(expanded, macroState.createCachedState(inputMacroState));
        chunkOutputCache.set(cacheKey, expanded);
      } else {
        macroState.applyCachedState(cachedState);
      }
      parts.push(expanded.content);
      if (trackSourceMap) {
        for (const segment of expanded.sourceMap) {
          sourceMap.push({
            generatedStart: generatedOffset + segment.generatedStart,
            generatedEnd: generatedOffset + segment.generatedEnd,
            sourceStart: segment.sourceStart,
            source: segment.source,
            sourceFile: segment.sourceFile,
            sourceScope: includeSourceScope
          });
        }
      }
      generatedOffset += expanded.content.length;
      errors.push(...expanded.errors);
      sourceOffset = directiveReg.lastIndex;
    }
    appendSource(sourceOffset, source.length, macroState.reachable);
    return { content: parts.join(""), errors, sourceMap };
  }

  private static _sourceScopeAt(
    offset: number,
    scopeStarts: readonly number[] | undefined,
    inheritedScope: number
  ): number {
    if (!scopeStarts?.length) return inheritedScope;
    let scope = 0;
    for (let index = 1; index < scopeStarts.length && scopeStarts[index] <= offset; index++) scope = index;
    return scope;
  }

  private static _nextSourceScopeStart(
    offset: number,
    end: number,
    scopeStarts: readonly number[] | undefined
  ): number | undefined {
    if (!scopeStarts) return;
    for (const start of scopeStarts) {
      if (start > offset && start < end) return start;
    }
  }

  private static _maskDirectiveTrivia(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\r\n]/g, " "))
      .replace(/\\(?:\r\n|\n|\r)/g, (continuation) => " ".repeat(continuation.length));
  }

  private static _stripLineComment(source: string): string {
    return source.replace(/\/\/.*$/, "");
  }

  private static _maskText(source: string): string {
    return source.replace(/[^\r\n]/g, " ");
  }

  private static _resolveIncludePath(includeName: string, basePathForIncludeKey: string): string | undefined {
    const basePath = includeName[0] === "." ? basePathForIncludeKey || SHADER_ROOT_PATH : SHADER_ROOT_PATH;
    if (!ABSOLUTE_URL_PATTERN.test(includeName) && basePath.startsWith(SHADER_ROOT_PATH)) {
      return normalizeShaderIncludeKey(new URL(includeName, basePath).href);
    }
    try {
      const url = new URL(includeName, basePath);
      return normalizeShaderIncludeKey(url.href);
    } catch {
      return;
    }
  }

  private static _canonicalIncludeURL(path: string): string {
    return ABSOLUTE_URL_PATTERN.test(path) ? new URL(path).href : new URL(path, SHADER_ROOT_PATH).href;
  }

  private static _createPreprocessorError(
    source: string,
    offset: number,
    message: string,
    file?: string,
    endOffset = offset
  ): GSError {
    const start = this._positionAt(source, offset);
    if (endOffset <= offset) return new GSError(GSErrorName.PreprocessorError, message, start, source, file);
    const range = new ShaderRange();
    range.set(start, this._positionAt(source, endOffset));
    return new GSError(GSErrorName.PreprocessorError, message, range, source, file);
  }

  private static _positionAt(source: string, offset: number): ShaderPosition {
    let line = 0;
    let lastBreak = -1;
    for (let i = 0; i < offset; i++) {
      const char = source.charCodeAt(i);
      if (char === 10) {
        line++;
        lastBreak = i;
      } else if (char === 13) {
        lastBreak = i;
      }
    }
    const position = new ShaderPosition();
    position.set(offset, line, offset - lastBreak - 1);
    return position;
  }
}
