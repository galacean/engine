import type { ASTNode } from "./parser/AST";
import type { BranchSignature } from "./common/BaseToken";
import { Logger } from "@galacean/engine-core";
import { GSError, GSErrorName } from "./GSError";
import { ShaderPosition } from "./common/ShaderPosition";

// Mirrors `ShaderPass._shaderRootPath` (from core's ShaderPass).
const SHADER_ROOT_PATH = "shaders://root/";

export type IncludeMap = { readonly [includeName: string]: string | undefined };

export interface PreprocessResult {
  /** Expanded shader source. */
  content: string;
  /** Include-resolution failures collected while expanding the source. */
  errors: GSError[];
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
    const errors: GSError[] = [];
    const content = source.replace(this._includeReg, (match, includeName: string | undefined, offset: number) =>
      includeName
        ? this._replace(includeName, basePathForIncludeKey, includeMap, chunkOutputCache, source, offset, errors)
        : match
    );
    return { content, errors };
  }

  private static _replace(
    includeName: string,
    basePathForIncludeKey: string,
    includeMap: IncludeMap,
    chunkOutputCache: ChunkOutputCache,
    source: string,
    offset: number,
    errors: GSError[]
  ): string {
    let path: string;
    if (includeName[0] === ".") {
      try {
        path = new URL(includeName, basePathForIncludeKey).href.substring(SHADER_ROOT_PATH.length);
      } catch {
        errors.push(
          this._createIncludeError(
            source,
            offset,
            `Cannot resolve relative shader include "${includeName}" without a shader base path.`
          )
        );
        return "";
      }
    } else {
      path = includeName;
    }

    const chunk = includeMap[path];
    if (!chunk) {
      errors.push(this._createIncludeError(source, offset, `Shader include "${path}" was not found.`));
      return "";
    }

    let cached = chunkOutputCache.get(path);
    if (!cached) {
      cached = this.parseWithErrors(chunk, basePathForIncludeKey, includeMap, chunkOutputCache);
      chunkOutputCache.set(path, cached);
    }
    errors.push(...cached.errors);
    return cached.content;
  }

  private static _createIncludeError(source: string, offset: number, message: string): GSError {
    const before = source.slice(0, offset);
    const line = before.split("\n").length - 1;
    const lastBreak = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
    const position = new ShaderPosition();
    position.set(offset, line, offset - lastBreak - 1);
    return new GSError(GSErrorName.PreprocessorError, message, position, source);
  }
}
