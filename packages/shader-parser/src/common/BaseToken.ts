import { ETokenType } from "./types";
import { ShaderRange, ShaderPosition } from ".";
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
  /** Whether this conditional chain covers every configuration. */
  conditionalComplete?: boolean;
  /** Number of arms in this complete conditional chain. */
  conditionalArmCount?: number;
  /** Reachability of each arm in this complete conditional chain. */
  conditionalReachableArms?: readonly boolean[];
  /** A recognized `#if` condition; unsupported expressions stay undefined. */
  condition?: BranchCondition;
  /** Conditions of earlier arms that must be false for this `#elif`/`#else` arm to run. */
  precedingConditions?: readonly BranchCondition[];
  /**
   * Shared `#undef` events for this guard macro. Each guard records the event index at its entry
   * (and again when it defines itself) so conflict checks only consider invalidations between two
   * guard occurrences.
   * @internal
   */
  guardUndefBranches?: readonly BranchSignature[];
  /** @internal */
  guardUndefStart?: number;
  /** Whether this arm has directly defined its own guard macro before the current source position. */
  selfGuarding?: boolean;
}

/** A single-macro condition that can be compared without evaluating a macro configuration. */
export type BranchCondition =
  | { kind: "constant"; value: boolean }
  | { kind: "defined"; name: string; defined: boolean; version: number }
  | {
      kind: "comparison";
      name: string;
      operator: "==" | "!=" | ">" | ">=" | "<" | "<=";
      value: number;
      version: number;
    }
  | {
      /** Canonicalized conjunction/disjunction of simple macro conditions. */
      kind: "expression";
      expression: string;
      operator: "&&" | "||";
      operands: readonly BranchCondition[];
      names: readonly string[];
      versions: readonly number[];
      negated: boolean;
      /** Whether the expression preserves a canonical comparison that this layer must not evaluate. */
      opaque?: boolean;
    };

/**
 * Snapshot of the `#ifdef`/`#ifndef`/`#else` stack at a source position. An
 * empty signature means unconditional (top-level). Constraints are conjunctive:
 * the position is active iff every constraint holds. Produced by the Lexer
 * (the sole branch-stack maintainer) and stamped onto every emitted token +
 * every registered `MacroDefineInfo`.
 */
export type BranchSignature = readonly BranchConstraint[];

/** Result of checking whether macro-guarded declarations cover a reference site. */
export type BranchCoverage = "covered" | "uncovered" | "unknown";

/** Whether two declarations are proven to coexist, proven exclusive, or unresolved. */
export type DeclarationCoexistence = "coexist" | "exclusive" | "unknown";

// Canonical empty branch signature shared by all default tokens — avoids
// per-token allocation. The Lexer overwrites `branch` after `scanToken()`
// for tokens that are inside an `#ifdef`.
export const EMPTY_BRANCH: BranchSignature = Object.freeze([]);

export { sameBranch } from "./BranchIdentity";

/**
 * Token retained by parser AST and parsed-pass results.
 *
 * Instances are pass-owned because their ranges and lexemes can outlive the parse call. A reusable
 * allocator must therefore be scoped to the lifetime of the whole parsed pass, not globally cleared.
 */
export class BaseToken<T extends number = number> {
  type: T;
  lexeme: string;
  location: ShaderRange;
  /** Branch signature snapshot at the point this token was emitted. Empty
   *  signature (default) means top-level / unconditional. The Lexer tags
   *  every token; downstream code (AST nodes built from tokens) can read
   *  the field directly to know which `#ifdef` branch they're inside. */
  branch: BranchSignature = EMPTY_BRANCH;
  inMacroDefinition = false;

  set(type: T, lexeme: string, start?: ShaderPosition);
  set(type: T, lexeme: string, location?: ShaderRange);
  set(type: T, lexeme: string, arg?: ShaderRange | ShaderPosition) {
    this.type = type;
    this.lexeme = lexeme;
    this.branch = EMPTY_BRANCH;
    this.inMacroDefinition = false;
    if (arg) {
      if (arg instanceof ShaderRange) {
        this.location = arg as ShaderRange;
      } else {
        const end = ShaderCompilerUtils.createPosition(arg.index + lexeme.length, arg.line, arg.column + lexeme.length);
        this.location = ShaderCompilerUtils.createRange(arg, end);
      }
    }
  }
}

export const EOF = new BaseToken();
EOF.set(ETokenType.EOF, "/EOF");
