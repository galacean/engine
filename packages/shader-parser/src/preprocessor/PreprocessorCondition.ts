import {
  evaluatePartiallyKnownPreprocessorConditionResult,
  type Condition,
  type PartiallyKnownPreprocessorExpressionContext
} from "@galacean/engine-design";
import type { BranchSignature } from "../common/BaseToken";

// Limit exhaustive proof cost on user-authored formulas; exhaustion must retain the declaration
const MAX_PROOF_STATES = 512;

/**
 * A source condition whose parsed meaning or complete opaque identity is fixed at its directive.
 * @internal
 */
export type SourcePreprocessorCondition =
  | { readonly kind: "expression"; readonly expression: Condition; readonly versions: Readonly<Record<string, number>> }
  | { readonly kind: "opaque"; readonly identity: string };

/**
 * One required condition or its negation in a preprocessor arm.
 * @internal
 */
export interface PreprocessorConditionTerm {
  readonly condition: SourcePreprocessorCondition;
  readonly negated: boolean;
}

/**
 * Source-owned truth and conjunctive predicates for an entire arm, including earlier alternatives.
 * @internal
 */
export interface PreprocessorConditionalArm {
  /** Truth relative to the enclosing parent, when all macro configurations agree. */
  readonly value?: boolean;
  /** Required predicates; absent when the source condition cannot be represented safely. */
  readonly predicates?: readonly PreprocessorConditionTerm[];
}

/**
 * Captures definition versions for a fully expanded expression without changing its numeric semantics.
 * @param expression - Parsed expression containing only constants and definition checks.
 * @param versions - Current source macro mutation versions.
 * @returns The expression and an independent snapshot of its definition dependencies.
 * @internal
 */
export function capturePreprocessorCondition(
  expression: Condition,
  versions: Readonly<Record<string, number>>
): SourcePreprocessorCondition {
  const dependencies: Record<string, number> = Object.create(null);
  const pending = [expression];
  while (pending.length) {
    const condition = pending.pop()!;
    switch (condition.t) {
      case "def":
      case "ndef":
        dependencies[condition.m] = versions[condition.m] ?? 0;
        break;
      case "not":
      case "unary":
        pending.push(condition.c);
        break;
      case "and":
      case "or":
      case "binary":
        pending.push(condition.l, condition.r);
        break;
    }
  }
  return { kind: "expression", expression, versions: dependencies };
}

/**
 * Proves that a narrower ShaderLab declaration is present whenever an inherited declaration is present.
 * @param declaration - Guards of the narrower declaration that may replace the inherited one.
 * @param reference - Guards of the inherited declaration.
 * @returns True only when source-owned predicates prove complete coverage within the work bound.
 * @internal
 */
export function isInheritanceBranchVisibleFrom(declaration: BranchSignature, reference: BranchSignature): boolean {
  const required = getPredicates(declaration);
  const facts = getPredicates(reference);
  if (required === true || facts === false) return true;
  if (required === undefined || facts === undefined) return false;
  if (
    Array.isArray(required) &&
    Array.isArray(facts) &&
    required.every((term) => facts.some((fact) => sameTerm(term, fact)))
  ) {
    return true;
  }

  const assignments = new Map<string, boolean>();
  const variables = new Set<string>();
  for (const predicates of [facts, required]) {
    if (typeof predicates === "boolean") continue;
    for (const { condition } of predicates) {
      if (condition.kind === "opaque") variables.add(opaqueKey(condition.identity));
      else for (const name in condition.versions) variables.add(definedKey(name, condition.versions[name]));
    }
  }
  if (typeof facts !== "boolean") {
    for (const term of facts) {
      if (!assumeCondition(term.condition, !term.negated, assignments)) return true;
    }
  }
  const unassigned = Array.from(variables).filter((name) => !assignments.has(name));
  let remaining = MAX_PROOF_STATES;
  function prove(index: number): boolean {
    if (--remaining < 0) return false;
    const source = evaluatePredicates(facts!, assignments);
    if (source === false) return true;
    const target = evaluatePredicates(required!, assignments);
    if (target === true) return true;
    if ((source === true && target === false) || index === unassigned.length) return false;
    const name = unassigned[index];
    assignments.set(name, false);
    if (!prove(index + 1)) {
      assignments.delete(name);
      return false;
    }
    assignments.set(name, true);
    const covered = prove(index + 1);
    assignments.delete(name);
    return covered;
  }
  return prove(0);
}

function getPredicates(branch: BranchSignature): readonly PreprocessorConditionTerm[] | boolean | undefined {
  const predicates: PreprocessorConditionTerm[] = [];
  for (const { sourceArm } of branch) {
    if (sourceArm?.value === true) continue;
    if (sourceArm?.value === false) return false;
    if (!sourceArm?.predicates) return;
    predicates.push(...sourceArm.predicates);
  }
  return predicates.length ? predicates : true;
}

function evaluatePredicates(
  predicates: readonly PreprocessorConditionTerm[] | boolean,
  assignments: ReadonlyMap<string, boolean>
): boolean | undefined {
  if (typeof predicates === "boolean") return predicates;
  let unknown = false;
  for (const { condition, negated } of predicates) {
    let value: boolean | undefined;
    if (condition.kind === "opaque") value = assignments.get(opaqueKey(condition.identity));
    else {
      const context: PartiallyKnownPreprocessorExpressionContext = {
        resolveIdentifier: () => ({}),
        isDefined: (name) => assignments.get(definedKey(name, condition.versions[name]))
      };
      const result = evaluatePartiallyKnownPreprocessorConditionResult(condition.expression, context);
      if (result.error) return;
      value = result.value === undefined ? undefined : result.value !== 0;
    }
    if (value === undefined) unknown = true;
    else if (value === negated) return false;
  }
  return unknown ? undefined : true;
}

function assumeCondition(
  condition: SourcePreprocessorCondition,
  value: boolean,
  assignments: Map<string, boolean>
): boolean {
  function assign(name: string, value: boolean): boolean {
    if (assignments.has(name)) return assignments.get(name) === value;
    assignments.set(name, value);
    return true;
  }
  if (condition.kind === "opaque") return assign(opaqueKey(condition.identity), value);
  const versions = condition.versions;
  function visit(expression: Condition, value: boolean): boolean {
    switch (expression.t) {
      case "def":
      case "ndef":
        return assign(definedKey(expression.m, versions[expression.m]), expression.t === "def" ? value : !value);
      case "not":
        return visit(expression.c, !value);
      case "and":
      case "or":
        if (value === (expression.t === "and")) return visit(expression.l, value) && visit(expression.r, value);
        break;
    }
    return true;
  }
  return visit(condition.expression, value);
}

function sameTerm(left: PreprocessorConditionTerm, right: PreprocessorConditionTerm): boolean {
  if (left.negated !== right.negated) return false;
  const a = left.condition;
  const b = right.condition;
  if (a === b) return true;
  if (a.kind === "opaque") return b.kind === "opaque" && a.identity === b.identity;
  if (b.kind === "opaque") return false;
  return sameExpression(a.expression, b.expression, a.versions, b.versions);
}

function sameExpression(
  left: Condition,
  right: Condition,
  leftVersions: Readonly<Record<string, number>>,
  rightVersions: Readonly<Record<string, number>>
): boolean {
  if (left.t !== right.t) return false;
  switch (left.t) {
    case "def":
    case "ndef":
      return (
        (right.t === "def" || right.t === "ndef") &&
        left.m === right.m &&
        leftVersions[left.m] === rightVersions[right.m]
      );
    case "num":
    case "bool":
      return (right.t === "num" || right.t === "bool") && left.v === right.v;
    case "not":
    case "unary":
      return (
        (right.t === "not" || right.t === "unary") &&
        (left.t !== "unary" || (right.t === "unary" && left.op === right.op)) &&
        sameExpression(left.c, right.c, leftVersions, rightVersions)
      );
    case "and":
    case "or":
    case "binary":
      return (
        (right.t === "and" || right.t === "or" || right.t === "binary") &&
        (left.t !== "binary" || (right.t === "binary" && left.op === right.op)) &&
        sameExpression(left.l, right.l, leftVersions, rightVersions) &&
        sameExpression(left.r, right.r, leftVersions, rightVersions)
      );
    default:
      return false;
  }
}

function definedKey(name: string, version: number): string {
  return `defined:${name}:${version}`;
}

function opaqueKey(identity: string): string {
  return `opaque:${identity}`;
}
