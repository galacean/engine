import type { ASTNode } from "./parser/AST";
import type { BranchSignature } from "./common/BaseToken";

// Mirrors `ShaderPass._shaderRootPath`; inlined to keep shader-compiler standalone.
const SHADER_ROOT_PATH = "shaders://root/";

export type IncludeMap = { readonly [includeName: string]: string | undefined };

export type ChunkOutputCache = Map<string, string>;

export interface MacroDefineInfo {
  isFunction: boolean;
  name: string;
  params: string[];
  /** Set only for AST-routed macros (value contains `.` member access). */
  valueAst?: ASTNode.AssignmentExpression;
  /** Identifiers in the value with params filtered. Undefined when the value
   *  has none (numeric literal only — the common case for `#define PI 3.14`). */
  referencedIdentifiers?: string[];
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
      console.error(`Shader slice "${path}" not founded.`);
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
