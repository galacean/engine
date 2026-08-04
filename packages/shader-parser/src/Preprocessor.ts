import type { ASTNode } from "./parser/AST";
import type { BranchSignature } from "./common/BaseToken";
import { Logger } from "@galacean/engine-core";
import { GSError, GSErrorName } from "./GSError";
import { ShaderPosition } from "./common/ShaderPosition";
import type { ShaderSourceMapSegment } from "./ir";

// Mirrors `ShaderPass._shaderRootPath` (from core's ShaderPass).
const SHADER_ROOT_PATH = "shaders://root/";

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
  // Block-comment alternation prevents expanding `#include` inside doc comments.
  private static readonly _includeReg = /\/\*[\s\S]*?\*\/|^[ \t]*#include +"([\w\d./]+)"/gm;

  static parse(
    source: string,
    basePathForIncludeKey: string,
    includeMap: IncludeMap,
    chunkOutputCache: ChunkOutputCache
  ): string {
    const result = this.parseWithErrors(source, basePathForIncludeKey, includeMap, chunkOutputCache);
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
   * @returns The expanded source and collected errors.
   */
  static parseWithErrors(
    source: string,
    basePathForIncludeKey: string,
    includeMap: IncludeMap,
    chunkOutputCache: ChunkOutputCache
  ): PreprocessResult {
    return this._expand(source, basePathForIncludeKey, includeMap, chunkOutputCache, new Set());
  }

  private static _expand(
    source: string,
    basePathForIncludeKey: string,
    includeMap: IncludeMap,
    chunkOutputCache: ChunkOutputCache,
    activeIncludePaths: Set<string>,
    sourceFile?: string
  ): PreprocessResult {
    const errors: GSError[] = [];
    const sourceMap: ShaderSourceMapSegment[] = [];
    const parts: string[] = [];
    let sourceOffset = 0;
    let generatedOffset = 0;
    let match: RegExpExecArray | null;
    const includeReg = new RegExp(this._includeReg.source, this._includeReg.flags);

    const appendSource = (start: number, end: number): void => {
      if (end <= start) return;
      const text = source.slice(start, end);
      parts.push(text);
      sourceMap.push({
        generatedStart: generatedOffset,
        generatedEnd: generatedOffset + text.length,
        sourceStart: start,
        source,
        file: sourceFile
      });
      generatedOffset += text.length;
    };

    while ((match = includeReg.exec(source))) {
      appendSource(sourceOffset, match.index);
      const includeName = match[1];
      if (!includeName) {
        appendSource(match.index, includeReg.lastIndex);
        sourceOffset = includeReg.lastIndex;
        continue;
      }

      const path = this._resolveIncludePath(includeName, basePathForIncludeKey);
      if (!path) {
        errors.push(
          this._createIncludeError(
            source,
            match.index,
            `Cannot resolve relative shader include "${includeName}" without a shader base path.`,
            sourceFile
          )
        );
        sourceOffset = includeReg.lastIndex;
        continue;
      }

      const chunk = includeMap[path];
      if (!chunk) {
        errors.push(
          this._createIncludeError(source, match.index, `Shader include "${path}" was not found.`, sourceFile)
        );
        sourceOffset = includeReg.lastIndex;
        continue;
      }

      if (activeIncludePaths.has(path)) {
        errors.push(
          this._createIncludeError(source, match.index, `Shader include cycle detected at "${path}".`, sourceFile)
        );
        sourceOffset = includeReg.lastIndex;
        continue;
      }

      let expanded = chunkOutputCache.get(path);
      if (!expanded) {
        activeIncludePaths.add(path);
        try {
          expanded = this._expand(
            chunk,
            this._canonicalIncludeURL(path),
            includeMap,
            chunkOutputCache,
            activeIncludePaths,
            path
          );
          chunkOutputCache.set(path, expanded);
        } finally {
          activeIncludePaths.delete(path);
        }
      }
      parts.push(expanded.content);
      for (const segment of expanded.sourceMap) {
        sourceMap.push({
          generatedStart: generatedOffset + segment.generatedStart,
          generatedEnd: generatedOffset + segment.generatedEnd,
          sourceStart: segment.sourceStart,
          source: segment.source,
          file: segment.file
        });
      }
      generatedOffset += expanded.content.length;
      errors.push(...expanded.errors);
      sourceOffset = includeReg.lastIndex;
    }
    appendSource(sourceOffset, source.length);
    return { content: parts.join(""), errors, sourceMap };
  }

  private static _resolveIncludePath(includeName: string, basePathForIncludeKey: string): string | undefined {
    try {
      const url =
        includeName[0] === "." ? new URL(includeName, basePathForIncludeKey) : new URL(includeName, SHADER_ROOT_PATH);
      return url.href.startsWith(SHADER_ROOT_PATH) ? url.href.substring(SHADER_ROOT_PATH.length) : undefined;
    } catch {
      return undefined;
    }
  }

  private static _canonicalIncludeURL(path: string): string {
    return new URL(path, SHADER_ROOT_PATH).href;
  }

  private static _createIncludeError(source: string, offset: number, message: string, file?: string): GSError {
    const before = source.slice(0, offset);
    const line = before.split("\n").length - 1;
    const lastBreak = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
    const position = new ShaderPosition();
    position.set(offset, line, offset - lastBreak - 1);
    return new GSError(GSErrorName.PreprocessorError, message, position, source, file);
  }
}
