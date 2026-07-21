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
  /** Lexical conditional-chain identity. All `#if/#elif/#else` arms in one chain share it. */
  conditionalGroup?: number;
  /** Lexical arm within `conditionalGroup`; different arms cannot execute together. */
  conditionalArm?: number;
  /**
   * `#undef` generation at the current source position in a canonical `#ifndef` arm.
   * @internal
   */
  guardGeneration?: number;
  /** Whether this arm has directly defined its own guard macro before the current source position. */
  selfGuarding?: boolean;
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
 * Whether two signatures express the same macro conditions. Lexical group/arm identity is
 * intentionally ignored: repeated include-guard blocks have different lexical identities but
 * the same condition, and macro-definition deduplication relies on that equivalence.
 * @param a - First branch signature.
 * @param b - Second branch signature.
 * @returns Whether both signatures contain the same ordered macro conditions.
 */
export function sameBranch(a: BranchSignature, b: BranchSignature): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0, n = a.length; i < n; i++) {
    if (a[i].name !== b[i].name || a[i].defined !== b[i].defined) return false;
  }
  return true;
}

/**
 * `defBranch` is visible from `callSiteBranch` when there is no mutually-exclusive constraint
 * between them — i.e. no shared name whose `defined` flags differ. Same or nested branch is
 * always visible; unconditional (empty) `defBranch` is visible everywhere. Extracted from Lexer
 * so common/SymbolTable can consume it without pulling the whole lexer in as a dependency.
 * @param defBranch - Declaration-side branch signature.
 * @param callSiteBranch - Reference-side branch signature.
 * @returns Whether the declaration is visible from the reference branch.
 */
export function isBranchVisibleFrom(defBranch: BranchSignature, callSiteBranch: BranchSignature): boolean {
  for (let i = 0, n = defBranch.length; i < n; i++) {
    const d = defBranch[i];
    for (let j = 0, m = callSiteBranch.length; j < m; j++) {
      const c = callSiteBranch[j];
      if (
        d.conditionalGroup !== undefined &&
        d.conditionalGroup === c.conditionalGroup &&
        d.conditionalArm !== c.conditionalArm
      ) {
        return false;
      }
      if (d.name === c.name && d.defined !== c.defined) return false;
    }
  }
  return true;
}

/**
 * Whether a later declaration can coexist with an earlier declaration in one preprocessed shader.
 * Besides ordinary mutually-exclusive conditional arms, an earlier self-defining `#ifndef` arm
 * suppresses every later same-generation `#ifndef` arm for that macro. Argument order therefore
 * follows source/insertion order.
 * @param earlier - Branch signature of an existing declaration.
 * @param later - Branch signature of the declaration currently being inserted.
 * @returns Whether both declarations can be emitted by one macro configuration.
 */
export function canDeclarationsCoexist(earlier: BranchSignature, later: BranchSignature): boolean {
  if (!isBranchVisibleFrom(earlier, later)) return false;

  for (let i = 0, n = earlier.length; i < n; i++) {
    const left = earlier[i];
    if (left.defined || !left.selfGuarding) continue;
    for (let j = 0, m = later.length; j < m; j++) {
      const right = later[j];
      if (
        !right.defined &&
        right.name === left.name &&
        right.guardGeneration === left.guardGeneration &&
        left.conditionalGroup !== undefined &&
        right.conditionalGroup !== undefined &&
        right.conditionalGroup > left.conditionalGroup
      ) {
        return false;
      }
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
