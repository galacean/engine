import type { ASTNode } from "./parser/AST";
import type { BranchSignature } from "./common/BaseToken";

// Mirrors `ShaderPass._shaderRootPath` in `@galacean/engine-core`.
// Inlined to keep shader-compiler standalone (see `enums/README.md`).
const SHADER_ROOT_PATH = "shaders://root/";

/** Read-only `#include "path" -> chunk source` lookup. */
export type IncludeMap = { readonly [includeName: string]: string | undefined };

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
  // First branch swallows block comments so include directives written inside
  // documentation comments (e.g. FXAA3_11.glsl) aren't expanded as live includes.
  private static readonly _includeReg = /\/\*[\s\S]*?\*\/|^[ \t]*#include +"([\w\d./]+)"/gm;
  // Caches the post-include-expansion output keyed by include name. `#define`
  // registration is no longer pre-scanned here — the Lexer fills
  // `macroDefineList` while it tokenizes the cached output.
  private static readonly _chunkOutputCache = new Map<string, string>();

  /**
   * @internal
   */
  static _repeatIncludeSet = new Set<string>();

  static parse(source: string, basePathForIncludeKey: string, includeMap: IncludeMap): string {
    // Per-shader scope: warning fires on intra-shader repeats, not cross-shader.
    this._repeatIncludeSet.clear();
    return this._parseInternal(source, basePathForIncludeKey, includeMap);
  }

  private static _parseInternal(source: string, basePathForIncludeKey: string, includeMap: IncludeMap): string {
    return source.replace(this._includeReg, (match, includeName) =>
      includeName ? this._replace(includeName, basePathForIncludeKey, includeMap) : match
    );
  }

  private static _replace(includeName: string, basePathForIncludeKey: string, includeMap: IncludeMap): string {
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

    if (this._repeatIncludeSet.has(path)) {
      console.warn(`Shader slice "${path}" is included multiple times.`);
    }
    this._repeatIncludeSet.add(path);

    let cached = this._chunkOutputCache.get(path);
    if (cached === undefined) {
      cached = this._parseInternal(chunk, basePathForIncludeKey, includeMap);
      this._chunkOutputCache.set(path, cached);
    }
    return cached;
  }
}
