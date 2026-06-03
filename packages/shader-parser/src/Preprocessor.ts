import type { ASTNode } from "./parser/AST";
import type { BranchSignature } from "./common/BaseToken";
import { Logger } from "./common/Logger";

// Mirrors `ShaderPass._shaderRootPath`; inlined to keep shader-compiler standalone.
const SHADER_ROOT_PATH = "shaders://root/";

export type IncludeMap = { readonly [includeName: string]: string | undefined };

export type ChunkOutputCache = Map<string, string>;

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
    return source.replace(this._includeReg, (match, includeName) =>
      includeName ? this._replace(includeName, basePathForIncludeKey, includeMap, chunkOutputCache) : match
    );
  }

  private static _replace(
    includeName: string,
    basePathForIncludeKey: string,
    includeMap: IncludeMap,
    chunkOutputCache: ChunkOutputCache
  ): string {
    let path: string;
    if (includeName[0] === ".") {
      path = new URL(includeName, basePathForIncludeKey).href.substring(SHADER_ROOT_PATH.length);
    } else {
      path = includeName;
    }

    const chunk = includeMap[path];
    if (!chunk) {
      Logger.error(`Shader slice "${path}" not founded.`);
      return "";
    }

    let cached = chunkOutputCache.get(path);
    if (cached === undefined) {
      cached = this.parse(chunk, basePathForIncludeKey, includeMap, chunkOutputCache);
      chunkOutputCache.set(path, cached);
    }
    return cached;
  }
}
