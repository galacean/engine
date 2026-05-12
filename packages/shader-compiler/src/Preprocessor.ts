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
  /** Expression-parsed value AST. Set for any `#define` whose replacement list
   *  is a valid GLSL `assignment_expression` (`_defineHasValue() === true`).
   *  Identifier references inside the value are tracked as a natural byproduct
   *  of AST semantic analysis — `VariableIdentifier` nodes look themselves up
   *  in the symbol table during codegen and emit `referenceGlobal` calls.
   *  Absent for opaque token-sequence macros (empty value, type-alias keyword,
   *  bare/trailing punctuation) which the GLSL ES 3.00 §3.4 spec allows. */
  valueAst?: ASTNode.AssignmentExpression;
  /** Whitespace-normalized directive text used to detect duplicate
   *  registrations (re-includes, multi-chunk repeats) within the same branch.
   *  Differs from `name` alone: `#define X 1` and `#define X 2` in the same
   *  branch have different keys → both stay so the AST upgrade picks the
   *  matching shape. */
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
