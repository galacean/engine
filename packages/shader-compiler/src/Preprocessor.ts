import type { ASTNode } from "./parser/AST";
import type { BranchSignature } from "./common/BaseToken";

// Mirrors `ShaderPass._shaderRootPath`; inlined to keep shader-compiler standalone.
const SHADER_ROOT_PATH = "shaders://root/";

export type IncludeMap = { readonly [includeName: string]: string | undefined };

export type ChunkOutputCache = Map<string, string>;

/**
 * Record for a single `#define` directive. `valueAst` is set for expression
 * macros (joined into the AST pipeline); opaque macros leave it undefined and
 * are emitted verbatim to the GLSL driver.
 */
export interface MacroDefineInfo {
  isFunction: boolean;
  name: string;
  params: string[];
  valueAst?: ASTNode.AssignmentExpression;
  /** Leading identifier of the value (`#define F foo` → `foo`, `#define F foo(a)`
   *  → `foo`), or empty for literals / operator expressions. Drives symbol-table
   *  lookup at macro call sites. */
  referenceName: string;
  /** Branch signature at the point of registration. The same `#define` repeated
   *  in different `#ifdef` branches produces multiple entries with different
   *  signatures; call sites filter to those visible from their own position. */
  branch: BranchSignature;
}

export interface MacroDefineList {
  [macroName: string]: MacroDefineInfo[];
}

export class Preprocessor {
  // First branch swallows block comments so `#include` directives nested in
  // doc comments (e.g. FXAA3_11.glsl) aren't expanded.
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
