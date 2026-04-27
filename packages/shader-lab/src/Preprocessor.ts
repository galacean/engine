import { Logger, ShaderPass } from "@galacean/engine";
/** @ts-ignore */
import { ShaderLib } from "@galacean/engine";
import type { ASTNode } from "./parser/AST";

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
}

export interface MacroDefineList {
  [macroName: string]: MacroDefineInfo[];
}

export class Preprocessor {
  private static readonly _includeReg = /^[ \t]*#include +"([\w\d./]+)"/gm;
  // Caches the post-include-expansion output keyed by chunk path. `#define`
  // registration is no longer pre-scanned here — the Lexer fills
  // `macroDefineList` while it tokenizes the cached output.
  private static readonly _chunkOutputCache = new Map<string, string>();

  /**
   * @internal
   */
  static _repeatIncludeSet = new Set<string>();

  static parse(source: string, basePathForIncludeKey: string): string {
    // Preprocessor only handles `#include` expansion. `#define` registration
    // is done by the Lexer in a single pass over the same token stream it
    // tokenizes — eliminating the long-standing drift between two
    // independent analyzers (regex vs Lexer state machine) interpreting the
    // same source differently (comments, line-continuation, etc.).
    return source.replace(this._includeReg, (_, includeName) => this._replace(includeName, basePathForIncludeKey));
  }

  /** Collect unique `referenceName`s of `macroName`'s definitions, skipping
   *  names that shadow a macro parameter. */
  static getReferenceSymbolNames(macroDefineList: MacroDefineList, macroName: string, out: string[]): void {
    out.length = 0;
    const infos = macroDefineList[macroName];
    if (!infos) return;

    for (let i = 0, n = infos.length; i < n; i++) {
      const info = infos[i];
      const ref = info.referenceName;
      if (!ref) continue;
      if (info.params.indexOf(ref) !== -1) continue;
      if (out.indexOf(ref) === -1) out.push(ref);
    }
  }

  private static _replace(includeName: string, basePathForIncludeKey: string): string {
    let path: string;
    if (includeName[0] === ".") {
      // @ts-ignore
      path = new URL(includeName, basePathForIncludeKey).href.substring(ShaderPass._shaderRootPath.length);
    } else {
      path = includeName;
    }

    const chunk = (ShaderLib as any)[path];
    if (!chunk) {
      Logger.error(`Shader slice "${path}" not founded.`);
      return "";
    }

    if (this._repeatIncludeSet.has(path)) {
      Logger.warn(`Shader slice "${path}" is included multiple times.`);
    }
    this._repeatIncludeSet.add(path);

    let cached = this._chunkOutputCache.get(path);
    if (cached === undefined) {
      cached = this.parse(chunk, basePathForIncludeKey);
      this._chunkOutputCache.set(path, cached);
    }
    return cached;
  }
}
