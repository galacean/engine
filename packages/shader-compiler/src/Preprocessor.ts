import { Logger } from "@galacean/engine";
/** @ts-ignore */
import { ShaderLib } from "@galacean/engine";
import type { ASTNode } from "./parser/AST";
import type { BranchSignature } from "./common/BaseToken";

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
  private static readonly _includeReg = /^[ \t]*#include +"([\w\d./]+)"/gm;
  // Caches the post-include-expansion output keyed by include name. `#define`
  // registration is no longer pre-scanned here — the Lexer fills
  // `macroDefineList` while it tokenizes the cached output.
  private static readonly _chunkOutputCache = new Map<string, string>();

  /**
   * @internal
   */
  static _repeatIncludeSet = new Set<string>();

  static parse(source: string): string {
    // Preprocessor only handles `#include` expansion. `#define` registration
    // and `#ifdef` branch tracking are done by the Lexer in a single pass
    // over the same token stream it tokenizes.
    return source.replace(this._includeReg, (_, includeName) => this._replace(includeName));
  }

  private static _replace(includeName: string): string {
    const chunk = (ShaderLib as any)[includeName];
    if (!chunk) {
      Logger.error(`Shader slice "${includeName}" not founded.`);
      return "";
    }

    if (this._repeatIncludeSet.has(includeName)) {
      Logger.warn(`Shader slice "${includeName}" is included multiple times.`);
    }
    this._repeatIncludeSet.add(includeName);

    let cached = this._chunkOutputCache.get(includeName);
    if (cached === undefined) {
      cached = this.parse(chunk);
      this._chunkOutputCache.set(includeName, cached);
    }
    return cached;
  }
}
