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
    };

/**
 * Whether two simple macro conditions are exact logical negations.
 * @param left - First simple condition.
 * @param right - Second simple condition.
 * @returns Whether exactly one condition holds for every macro value.
 */
export function areConditionsComplementary(left?: BranchCondition, right?: BranchCondition): boolean {
  if (!left || !right) return false;
  if (left.kind === "constant" || right.kind === "constant") {
    return left.kind === "constant" && right.kind === "constant" && left.value !== right.value;
  }
  if (left.kind === "expression" || right.kind === "expression") {
    return (
      left.kind === "expression" &&
      right.kind === "expression" &&
      sameExpression(left, right) &&
      left.negated !== right.negated
    );
  }
  if (left.kind !== right.kind || left.name !== right.name || left.version !== right.version) return false;
  if (left.kind === "defined" && right.kind === "defined") return left.defined !== right.defined;
  if (left.kind !== "comparison" || right.kind !== "comparison" || left.value !== right.value) return false;

  return (
    (left.operator === "==" && right.operator === "!=") ||
    (left.operator === "!=" && right.operator === "==") ||
    (left.operator === ">" && right.operator === "<=") ||
    (left.operator === ">=" && right.operator === "<") ||
    (left.operator === "<" && right.operator === ">=") ||
    (left.operator === "<=" && right.operator === ">")
  );
}

/**
 * Whether a `#if`/`#elif` chain contains an arm that covers every remaining macro configuration.
 * @param constraints - Conditions in source order within one lexical conditional chain.
 * @returns Whether no implicit fall-through configuration remains.
 * @internal
 */
export function isConditionalChainExhaustive(constraints: readonly BranchConstraint[]): boolean {
  for (let i = 0, n = constraints.length; i < n; i++) {
    const condition = constraints[i].condition;
    if (condition?.kind === "constant" && condition.value) return true;
    if (condition && isConditionImplied(condition, constraints[i].precedingConditions ?? [])) return true;
    for (let j = 0; j < i; j++) {
      if (areConditionsComplementary(constraints[j].condition, condition)) return true;
    }
  }
  return false;
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
    const left = a[i];
    const right = b[i];
    if (left.name !== right.name || left.defined !== right.defined) return false;
    if (!sameCondition(left.condition, right.condition)) return false;
    const leftPreceding = left.precedingConditions;
    const rightPreceding = right.precedingConditions;
    if ((leftPreceding?.length ?? 0) !== (rightPreceding?.length ?? 0)) return false;
    for (let j = 0, m = leftPreceding?.length ?? 0; j < m; j++) {
      if (!sameCondition(leftPreceding![j], rightPreceding![j])) return false;
    }
  }
  return true;
}

/**
 * `defBranch` is visible from `callSiteBranch` when every macro configuration that reaches the
 * reference also reaches the declaration. Compatibility alone is not enough: a declaration in
 * `#ifdef A` is not visible from an unconditional reference, because `A` can be absent there.
 * Extracted from Lexer so common/SymbolTable can consume it without pulling the whole lexer in as
 * a dependency.
 * @param defBranch - Declaration-side branch signature.
 * @param callSiteBranch - Reference-side branch signature.
 * @returns Whether the declaration is visible from the reference branch.
 */
export function isBranchVisibleFrom(defBranch: BranchSignature, callSiteBranch: BranchSignature): boolean {
  if (!isBranchReachable(callSiteBranch) || !canBranchesOverlap(defBranch, callSiteBranch)) return false;

  const callConditions = getConditions(callSiteBranch);
  for (let i = 0, n = defBranch.length; i < n; i++) {
    const constraint = defBranch[i];
    if (constraint.conditionalGroup !== undefined) {
      const matchingArm = callSiteBranch.find(
        (candidate) =>
          candidate.conditionalGroup === constraint.conditionalGroup &&
          candidate.conditionalArm === constraint.conditionalArm
      );
      const otherArm = callSiteBranch.find(
        (candidate) =>
          candidate.conditionalGroup === constraint.conditionalGroup &&
          candidate.conditionalArm !== constraint.conditionalArm
      );
      if (otherArm) return false;
      if (matchingArm) continue;
    }

    const required = getConstraintConditions(constraint);
    for (let j = 0, m = required.length; j < m; j++) {
      if (!isConditionImplied(required[j], callConditions)) return false;
    }
  }
  return true;
}

/**
 * Whether a later declaration can coexist with an earlier declaration in one preprocessed shader.
 * Besides ordinary mutually-exclusive conditional arms, an earlier self-defining `#ifndef` arm
 * suppresses later `#ifndef` arms for that macro unless a compatible intervening `#undef` reopened
 * the guard. Argument order therefore follows source/insertion order.
 * @param earlier - Branch signature of an existing declaration.
 * @param later - Branch signature of the declaration currently being inserted.
 * @returns Whether both declarations can be emitted by one macro configuration.
 */
export function canDeclarationsCoexist(earlier: BranchSignature, later: BranchSignature): boolean {
  if (!canBranchesOverlap(earlier, later)) return false;

  for (let i = 0, n = earlier.length; i < n; i++) {
    const left = earlier[i];
    if (left.defined || !left.selfGuarding) continue;
    for (let j = 0, m = later.length; j < m; j++) {
      const right = later[j];
      if (
        !right.defined &&
        right.name === left.name &&
        left.conditionalGroup !== undefined &&
        right.conditionalGroup !== undefined &&
        right.conditionalGroup > left.conditionalGroup
      ) {
        if (!hasCompatibleGuardUndef(earlier, left, later, right)) return false;
      }
    }
  }

  return true;
}

/** Whether this lexical branch can be emitted by at least one macro configuration. */
export function isBranchReachable(branch: BranchSignature): boolean {
  const conditions = getConditions(branch);
  for (let i = 0, n = conditions.length; i < n; i++) {
    const condition = conditions[i];
    if (condition.kind === "constant" && !condition.value) return false;
    for (let j = i + 1; j < n; j++) {
      if (areConditionsMutuallyExclusive(conditions[i], conditions[j])) return false;
    }
  }
  return true;
}

/** Whether two lexical branches can both be emitted by at least one macro configuration. */
export function canBranchesOverlap(left: BranchSignature, right: BranchSignature): boolean {
  for (let i = 0, n = left.length; i < n; i++) {
    const leftConstraint = left[i];
    for (let j = 0, m = right.length; j < m; j++) {
      const rightConstraint = right[j];
      if (
        leftConstraint.conditionalGroup !== undefined &&
        leftConstraint.conditionalGroup === rightConstraint.conditionalGroup &&
        leftConstraint.conditionalArm !== rightConstraint.conditionalArm
      ) {
        return false;
      }
    }
  }

  return isBranchReachable([...left, ...right]);
}

/**
 * Whether declarations from a complete set of conditional arms cover every configuration that can
 * reach `callSiteBranch`. A single declaration must be guaranteed by the call site; alternatively,
 * one declaration in every arm of an exhaustive conditional chain is sufficient.
 * @param candidates - Branch signatures of matching declarations in one lexical scope.
 * @param callSiteBranch - Branch signature at the reference.
 * @returns Whether the reference is backed by a declaration on every reachable macro path.
 */
export function canBranchesCoverCallsite(
  candidates: readonly BranchSignature[],
  callSiteBranch: BranchSignature
): boolean {
  return canCandidateSetCoverCallsite(candidates, callSiteBranch);
}

/** Whether this declaration is protected by a canonical `#ifndef` guard that defines itself. */
export function isSelfGuardingBranch(branch: BranchSignature): boolean {
  return branch.some((constraint) => constraint.selfGuarding);
}

function canCandidateSetCoverCallsite(
  candidates: readonly BranchSignature[],
  callSiteBranch: BranchSignature
): boolean {
  if (!isBranchReachable(callSiteBranch)) return true;
  const compatible = candidates.filter((candidate) => canBranchesOverlap(candidate, callSiteBranch));
  for (let i = 0, n = compatible.length; i < n; i++) {
    if (isBranchVisibleFrom(compatible[i], callSiteBranch)) return true;
  }

  const groups = new Set<number>();
  for (let i = 0, n = compatible.length; i < n; i++) {
    const candidate = compatible[i];
    for (let j = 0, m = candidate.length; j < m; j++) {
      const constraint = candidate[j];
      if (
        constraint.conditionalComplete &&
        constraint.conditionalGroup !== undefined &&
        constraint.conditionalArmCount !== undefined
      ) {
        groups.add(constraint.conditionalGroup);
      }
    }
  }

  for (const group of groups) {
    const callSiteConstraint = callSiteBranch.find((constraint) => constraint.conditionalGroup === group);
    if (callSiteConstraint?.conditionalArm !== undefined) {
      const inCurrentArm = compatible
        .filter(
          (candidate) =>
            candidate.find((constraint) => constraint.conditionalGroup === group)?.conditionalArm ===
            callSiteConstraint.conditionalArm
        )
        .map((candidate) => removeConditionalGroup(candidate, group));
      if (
        inCurrentArm.length &&
        canCandidateSetCoverCallsite(inCurrentArm, removeConditionalGroup(callSiteBranch, group))
      ) {
        return true;
      }
      continue;
    }

    const representative = compatible
      .map((candidate) => candidate.find((constraint) => constraint.conditionalGroup === group))
      .find((constraint) => constraint?.conditionalArmCount !== undefined);
    const armCount = representative?.conditionalArmCount;
    if (armCount === undefined) continue;

    let everyArmCovered = true;
    for (let arm = 0; arm < armCount; arm++) {
      const armReachable = representative?.conditionalReachableArms?.[arm] ?? true;
      if (!armReachable) continue;
      const armCandidates = compatible
        .filter(
          (candidate) => candidate.find((constraint) => constraint.conditionalGroup === group)?.conditionalArm === arm
        )
        .map((candidate) => removeConditionalGroup(candidate, group));
      if (!armCandidates.length || !canCandidateSetCoverCallsite(armCandidates, callSiteBranch)) {
        everyArmCovered = false;
        break;
      }
    }
    if (everyArmCovered) return true;
  }

  if (canComplementarySimpleCandidatesCoverCallsite(compatible, callSiteBranch)) return true;
  if (canDefinedBooleanCandidatesCoverCallsite(compatible, callSiteBranch)) return true;
  return false;
}

/**
 * Cover a reference with branch declarations when each involved condition is a bounded boolean
 * expression over `defined(MACRO)`. This resolves repeated lexical conditionals such as
 * `#if A` / `#elif B` being referenced from a later `#if A || B`, without evaluating arbitrary
 * numeric preprocessor expressions or expanding the analysis cost beyond 64 configurations.
 */
function canDefinedBooleanCandidatesCoverCallsite(
  candidates: readonly BranchSignature[],
  callSiteBranch: BranchSignature
): boolean {
  const atomKeys: string[] = [];
  const branches = [...candidates, callSiteBranch];
  for (let i = 0, n = branches.length; i < n; i++) {
    const branch = branches[i];
    for (let j = 0, m = branch.length; j < m; j++) {
      const constraint = branch[j];
      if (constraint.name.startsWith("__if_") && !constraint.condition && !constraint.precedingConditions?.length) {
        return false;
      }
      const conditions = getConstraintConditions(constraint);
      for (let k = 0, o = conditions.length; k < o; k++) {
        if (!collectDefinedBooleanAtoms(conditions[k], atomKeys)) return false;
      }
    }
  }
  if (!atomKeys.length || atomKeys.length > 6) return false;

  const values = new Map<string, boolean>();
  const configurations = 1 << atomKeys.length;
  for (let mask = 0; mask < configurations; mask++) {
    for (let i = 0, n = atomKeys.length; i < n; i++) values.set(atomKeys[i], !!(mask & (1 << i)));
    if (!matchesDefinedBooleanBranch(callSiteBranch, values)) continue;
    if (!candidates.some((candidate) => matchesDefinedBooleanBranch(candidate, values))) return false;
  }
  return true;
}

function collectDefinedBooleanAtoms(condition: BranchCondition, out: string[]): boolean {
  if (condition.kind === "constant") return true;
  if (condition.kind === "comparison") return false;
  if (condition.kind === "defined") {
    const key = `${condition.name}:${condition.version}`;
    if (out.indexOf(key) === -1) out.push(key);
    return true;
  }
  for (let i = 0, n = condition.operands.length; i < n; i++) {
    if (!collectDefinedBooleanAtoms(condition.operands[i], out)) return false;
  }
  return true;
}

function matchesDefinedBooleanBranch(branch: BranchSignature, values: ReadonlyMap<string, boolean>): boolean {
  for (let i = 0, n = branch.length; i < n; i++) {
    const conditions = getConstraintConditions(branch[i]);
    for (let j = 0, m = conditions.length; j < m; j++) {
      if (!evaluateDefinedBooleanCondition(conditions[j], values)) return false;
    }
  }
  return true;
}

function evaluateDefinedBooleanCondition(condition: BranchCondition, values: ReadonlyMap<string, boolean>): boolean {
  if (condition.kind === "constant") return condition.value;
  if (condition.kind === "comparison") return false;
  if (condition.kind === "defined") {
    return values.get(`${condition.name}:${condition.version}`) === condition.defined;
  }
  const valuesForOperands = condition.operands.map((operand) => evaluateDefinedBooleanCondition(operand, values));
  const value = condition.operator === "&&" ? valuesForOperands.every(Boolean) : valuesForOperands.some(Boolean);
  return condition.negated ? !value : value;
}

function canComplementarySimpleCandidatesCoverCallsite(
  candidates: readonly BranchSignature[],
  callSiteBranch: BranchSignature
): boolean {
  const seen = new Set<string>();
  for (let i = 0, n = candidates.length; i < n; i++) {
    const candidate = candidates[i];
    for (let j = 0, m = candidate.length; j < m; j++) {
      const constraint = candidate[j];
      const condition = constraint.condition;
      if (!condition || constraint.precedingConditions?.length) continue;

      const remaining = [...candidate.slice(0, j), ...candidate.slice(j + 1)];
      if (!isBranchVisibleFrom(remaining, callSiteBranch)) continue;

      const remainderKey = branchKey(remaining);
      const conditionKey = simpleConditionKey(condition);
      const complementKey = complementaryConditionKey(condition);
      if (complementKey && seen.has(`${remainderKey}|${complementKey}`)) return true;
      seen.add(`${remainderKey}|${conditionKey}`);
    }
  }
  return false;
}

function removeConditionalGroup(branch: BranchSignature, group: number): BranchSignature {
  return branch.filter((constraint) => constraint.conditionalGroup !== group);
}

function branchKey(branch: BranchSignature): string {
  return branch
    .map((constraint) => [
      constraint.name,
      constraint.defined,
      simpleConditionKey(constraint.condition),
      constraint.precedingConditions?.map(simpleConditionKey).join(",")
    ])
    .join("|");
}

function simpleConditionKey(condition?: BranchCondition): string {
  if (!condition) return "";
  if (condition.kind === "constant") return `constant:${condition.value}`;
  if (condition.kind === "defined") return `defined:${condition.name}:${condition.version}:${condition.defined}`;
  if (condition.kind === "expression") {
    return `expression:${condition.expression}:${condition.names.map((name, i) => `${name}:${condition.versions[i]}`).join(",")}:${condition.negated}`;
  }
  return `comparison:${condition.name}:${condition.version}:${condition.operator}:${condition.value}`;
}

function complementaryConditionKey(condition: BranchCondition): string | undefined {
  if (condition.kind === "constant") return `constant:${!condition.value}`;
  if (condition.kind === "defined") return `defined:${condition.name}:${condition.version}:${!condition.defined}`;
  if (condition.kind === "expression") {
    return `expression:${condition.expression}:${condition.names.map((name, i) => `${name}:${condition.versions[i]}`).join(",")}:${!condition.negated}`;
  }

  const operator =
    condition.operator === "=="
      ? "!="
      : condition.operator === "!="
        ? "=="
        : condition.operator === ">"
          ? "<="
          : condition.operator === ">="
            ? "<"
            : condition.operator === "<"
              ? ">="
              : ">";
  return `comparison:${condition.name}:${condition.version}:${operator}:${condition.value}`;
}

function hasCompatibleGuardUndef(
  earlier: BranchSignature,
  earlierGuard: BranchConstraint,
  later: BranchSignature,
  laterGuard: BranchConstraint
): boolean {
  const events = laterGuard.guardUndefBranches;
  if (!events) return false;

  const start = earlierGuard.guardUndefStart ?? 0;
  const end = laterGuard.guardUndefStart ?? 0;
  for (let i = start; i < end; i++) {
    const event = events[i];
    if (canBranchesOverlap(earlier, event) && canBranchesOverlap(event, later)) return true;
  }
  return false;
}

function getConditions(branch: BranchSignature): BranchCondition[] {
  const conditions: BranchCondition[] = [];
  for (let i = 0, n = branch.length; i < n; i++) conditions.push(...getConstraintConditions(branch[i]));
  return conditions;
}

function getConstraintConditions(constraint: BranchConstraint): readonly BranchCondition[] {
  const conditions = constraint.precedingConditions ? [...constraint.precedingConditions] : [];
  if (constraint.condition) conditions.push(constraint.condition);
  return conditions;
}

function sameCondition(left?: BranchCondition, right?: BranchCondition): boolean {
  if (!left || !right) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === "constant") return right.kind === "constant" && left.value === right.value;
  if (right.kind === "constant") return false;
  if (left.kind === "expression")
    return right.kind === "expression" && sameExpression(left, right) && left.negated === right.negated;
  if (right.kind === "expression") return false;
  if (left.name !== right.name || left.version !== right.version) return false;
  if (left.kind === "defined" && right.kind === "defined") return left.defined === right.defined;
  return (
    left.kind === "comparison" &&
    right.kind === "comparison" &&
    left.operator === right.operator &&
    left.value === right.value
  );
}

function sameExpression(
  left: Extract<BranchCondition, { kind: "expression" }>,
  right: Extract<BranchCondition, { kind: "expression" }>
): boolean {
  if (left.expression !== right.expression || left.names.length !== right.names.length) return false;
  for (let i = 0, n = left.names.length; i < n; i++) {
    if (left.names[i] !== right.names[i] || left.versions[i] !== right.versions[i]) return false;
  }
  return true;
}

function isConditionImplied(required: BranchCondition, facts: readonly BranchCondition[]): boolean {
  if (required.kind === "constant") return required.value;
  if (required.kind === "expression") return facts.some((fact) => sameCondition(fact, required));
  for (let i = 0, n = facts.length; i < n; i++) {
    const fact = facts[i];
    if (fact.kind === "constant" || fact.kind === "expression") continue;
    if (fact.name !== required.name || fact.version !== required.version) continue;
    if (conditionImplies(fact, required)) return true;
  }
  return false;
}

function conditionImplies(
  fact: Exclude<BranchCondition, { kind: "constant" }>,
  required: Exclude<BranchCondition, { kind: "constant" }>
): boolean {
  if (fact.kind === "expression" || required.kind === "expression") return sameCondition(fact, required);
  if (fact.kind === "defined") {
    if (required.kind === "defined") return fact.defined === required.defined;
    return !fact.defined && matchesComparison(0, required);
  }
  if (required.kind === "defined") {
    return required.defined && !matchesComparison(0, fact);
  }

  if (fact.operator === "==") return matchesComparison(fact.value, required);
  if (required.operator === "!=") return !matchesComparison(required.value, fact);

  const factLower = lowerBound(fact);
  const factUpper = upperBound(fact);
  const requiredLower = lowerBound(required);
  const requiredUpper = upperBound(required);
  if (requiredLower && (!factLower || !isLowerBoundAtLeast(factLower, requiredLower))) return false;
  if (requiredUpper && (!factUpper || !isUpperBoundAtMost(factUpper, requiredUpper))) return false;
  return !!(requiredLower || requiredUpper);
}

function areConditionsMutuallyExclusive(left?: BranchCondition, right?: BranchCondition): boolean {
  if (!left || !right) return false;
  if (left.kind === "constant" || right.kind === "constant") {
    return (left.kind === "constant" && !left.value) || (right.kind === "constant" && !right.value);
  }
  if (left.kind === "expression" || right.kind === "expression") {
    return (
      left.kind === "expression" &&
      right.kind === "expression" &&
      sameExpression(left, right) &&
      left.negated !== right.negated
    );
  }
  if (left.name !== right.name || left.version !== right.version) return false;

  if (left.kind === "defined") {
    if (right.kind === "defined") return left.defined !== right.defined;
    return !left.defined && !matchesComparison(0, right);
  }
  if (right.kind === "defined") return !right.defined && !matchesComparison(0, left);

  if (left.operator === "==") return !matchesComparison(left.value, right);
  if (right.operator === "==") return !matchesComparison(right.value, left);

  const leftLower = lowerBound(left);
  const rightLower = lowerBound(right);
  const leftUpper = upperBound(left);
  const rightUpper = upperBound(right);
  return (
    (leftLower !== undefined && rightUpper !== undefined && isEmptyInterval(leftLower, rightUpper)) ||
    (rightLower !== undefined && leftUpper !== undefined && isEmptyInterval(rightLower, leftUpper))
  );
}

function isLowerBoundAtLeast(
  actual: { value: number; inclusive: boolean },
  required: { value: number; inclusive: boolean }
): boolean {
  return (
    actual.value > required.value || (actual.value === required.value && (actual.inclusive || !required.inclusive))
  );
}

function isUpperBoundAtMost(
  actual: { value: number; inclusive: boolean },
  required: { value: number; inclusive: boolean }
): boolean {
  return (
    actual.value < required.value || (actual.value === required.value && (actual.inclusive || !required.inclusive))
  );
}

function matchesComparison(value: number, comparison: Extract<BranchCondition, { kind: "comparison" }>): boolean {
  switch (comparison.operator) {
    case "==":
      return value === comparison.value;
    case "!=":
      return value !== comparison.value;
    case ">":
      return value > comparison.value;
    case ">=":
      return value >= comparison.value;
    case "<":
      return value < comparison.value;
    case "<=":
      return value <= comparison.value;
  }
}

function lowerBound(
  comparison: Extract<BranchCondition, { kind: "comparison" }>
): { value: number; inclusive: boolean } | undefined {
  switch (comparison.operator) {
    case ">":
      return { value: comparison.value, inclusive: false };
    case ">=":
      return { value: comparison.value, inclusive: true };
    default:
      return undefined;
  }
}

function upperBound(
  comparison: Extract<BranchCondition, { kind: "comparison" }>
): { value: number; inclusive: boolean } | undefined {
  switch (comparison.operator) {
    case "<":
      return { value: comparison.value, inclusive: false };
    case "<=":
      return { value: comparison.value, inclusive: true };
    default:
      return undefined;
  }
}

function isEmptyInterval(
  lower: { value: number; inclusive: boolean },
  upper: { value: number; inclusive: boolean }
): boolean {
  return lower.value > upper.value || (lower.value === upper.value && (!lower.inclusive || !upper.inclusive));
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
