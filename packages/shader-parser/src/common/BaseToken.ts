import { ETokenType } from "./types";
import { ShaderRange, ShaderPosition } from ".";
import type { IPoolElement } from "@galacean/engine-core";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";

/**
 * One condition in a branch signature: `defined: true` for `#ifdef X` (the
 * branch is active when `X` is defined), `defined: false` for `#ifndef X` /
 * after `#else` (active when `X` is undefined).
 */
export interface BranchConstraint {
  name: string;
  defined: boolean;
}

/**
 * Snapshot of the `#ifdef`/`#ifndef`/`#else` stack at a source position. An
 * empty signature means unconditional (top-level). Constraints are conjunctive:
 * the position is active iff every constraint holds. Produced by the Lexer
 * (the sole branch-stack maintainer) and stamped onto every emitted token +
 * every registered `MacroDefineInfo`.
 */
export type BranchSignature = readonly BranchConstraint[];

// Canonical empty branch signature shared by all default tokens — avoids
// per-token allocation. The Lexer overwrites `branch` after `scanToken()`
// for tokens that are inside an `#ifdef`.
export const EMPTY_BRANCH: BranchSignature = [];

/**
 * `defBranch` is visible from `callSiteBranch` when there is no mutually-exclusive constraint
 * between them — i.e. no shared name whose `defined` flags differ. Same or nested branch is
 * always visible; unconditional (empty) `defBranch` is visible everywhere. Extracted from Lexer
 * so common/SymbolTable can consume it without pulling the whole lexer in as a dependency.
 */
export function isBranchVisibleFrom(defBranch: BranchSignature, callSiteBranch: BranchSignature): boolean {
  for (let i = 0, n = defBranch.length; i < n; i++) {
    const d = defBranch[i];
    for (let j = 0, m = callSiteBranch.length; j < m; j++) {
      const c = callSiteBranch[j];
      if (d.name === c.name && d.defined !== c.defined) return false;
    }
  }
  return true;
}

export class BaseToken<T extends number = number> implements IPoolElement {
  static pool = ShaderCompilerUtils.createObjectPool(BaseToken);

  type: T;
  lexeme: string;
  location: ShaderRange;
  /** Branch signature snapshot at the point this token was emitted. Empty
   *  signature (default) means top-level / unconditional. The Lexer tags
   *  every token; downstream code (AST nodes built from tokens) can read
   *  the field directly to know which `#ifdef` branch they're inside. */
  branch: BranchSignature = EMPTY_BRANCH;

  set(type: T, lexeme: string, start?: ShaderPosition);
  set(type: T, lexeme: string, location?: ShaderRange);
  set(type: T, lexeme: string, arg?: ShaderRange | ShaderPosition) {
    this.type = type;
    this.lexeme = lexeme;
    this.branch = EMPTY_BRANCH;
    if (arg) {
      if (arg instanceof ShaderRange) {
        this.location = arg as ShaderRange;
      } else {
        const end = ShaderCompilerUtils.createPosition(arg.index + lexeme.length, arg.line, arg.column + lexeme.length);
        this.location = ShaderCompilerUtils.createRange(arg, end);
      }
    }
  }

  dispose(): void {}
}

export const EOF = new BaseToken();
EOF.set(ETokenType.EOF, "/EOF");
