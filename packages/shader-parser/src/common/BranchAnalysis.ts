import type { BranchSemantics } from "./BranchSemantics";
import type {
  BranchCondition,
  BranchConstraint,
  BranchCoverage,
  BranchSignature,
  DeclarationCoexistence
} from "./BaseToken";
import { sameBranch, sameCondition, sameExpression } from "./BranchIdentity";

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
  if (left.kind !== "comparison" || right.kind !== "comparison") return false;

  if (hasExactIntegerValue(left) && hasExactIntegerValue(right)) {
    return complementaryConditionKey(left) === simpleConditionKey(right);
  }
  if (left.value !== right.value) return false;

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
    if (!constraint.condition && required.length === 0) return false;
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
  return getDeclarationCoexistence(earlier, later) !== "exclusive";
}

/**
 * Classify whether two declarations can be emitted by one macro configuration.
 * @param earlier - Branch signature of an existing declaration.
 * @param later - Branch signature of the declaration currently being inserted.
 * @returns Proven coexistence, proven exclusivity, or an unresolved complex condition.
 */
export function getDeclarationCoexistence(earlier: BranchSignature, later: BranchSignature): DeclarationCoexistence {
  if (!canBranchesOverlap(earlier, later)) return "exclusive";

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
        if (!hasCompatibleGuardUndef(earlier, left, later, right)) return "exclusive";
      }
    }
  }

  const combined = [...earlier, ...later];
  if (!hasOnlyAtomicConditions(combined)) return "unknown";
  return isAtomicConjunctionSatisfiable(getConditions(combined)) ? "coexist" : "exclusive";
}

/**
 * Determines whether a lexical branch can be emitted by at least one macro configuration.
 * @param branch - Branch constraints to test.
 * @returns Whether the constraints are satisfiable.
 */
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

/**
 * Determines whether two lexical branches can be emitted by one macro configuration.
 * @param left - First branch signature.
 * @param right - Second branch signature.
 * @returns Whether the combined constraints are satisfiable.
 */
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
  return getBranchCoverage(candidates, callSiteBranch) === "covered";
}

/**
 * Classify declaration coverage without treating an incomplete symbolic proof as a definite error.
 *
 * `uncovered` is returned only when a concrete counterexample follows from atomic macro facts.
 * Complex or opaque expressions stay `unknown`, allowing diagnostic clients to warn without
 * blocking code generation.
 * @param candidates - Branch signatures of matching declarations in one lexical scope.
 * @param callSiteBranch - Branch signature at the reference.
 * @returns Whether coverage is proven, disproven, or unknown.
 */
export function getBranchCoverage(
  candidates: readonly BranchSignature[],
  callSiteBranch: BranchSignature
): BranchCoverage {
  const normalizedCandidates = candidates.map(removeSelfGuardingConstraints);
  const normalizedCallsite = removeSelfGuardingConstraints(callSiteBranch);
  if (canCandidateSetCoverCallsite(normalizedCandidates, normalizedCallsite)) return "covered";

  const uniqueCandidates: BranchSignature[] = [];
  for (let i = 0, n = normalizedCandidates.length; i < n; i++) {
    const candidate = normalizedCandidates[i];
    if (!uniqueCandidates.some((existing) => sameBranch(existing, candidate))) uniqueCandidates.push(candidate);
  }
  uniqueCandidates.sort(compareBranchSourceOrder);
  return hasAtomicCoverageCounterexample(uniqueCandidates, normalizedCallsite) ? "uncovered" : "unknown";
}

function compareBranchSourceOrder(left: BranchSignature, right: BranchSignature): number {
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const leftGroup = left[i].conditionalGroup ?? Number.MAX_SAFE_INTEGER;
    const rightGroup = right[i].conditionalGroup ?? Number.MAX_SAFE_INTEGER;
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    const leftArm = left[i].conditionalArm ?? Number.MAX_SAFE_INTEGER;
    const rightArm = right[i].conditionalArm ?? Number.MAX_SAFE_INTEGER;
    if (leftArm !== rightArm) return leftArm - rightArm;
  }
  return left.length - right.length;
}

function hasAtomicCoverageCounterexample(
  candidates: readonly BranchSignature[],
  callSiteBranch: BranchSignature
): boolean {
  if (candidates.length === 0) return false;
  if (candidates.every((candidate) => !canBranchesOverlap(candidate, callSiteBranch))) return true;
  if (!hasOnlyAtomicConditions(callSiteBranch) || candidates.some((candidate) => !hasOnlyAtomicConditions(candidate))) {
    return false;
  }

  const counterexampleFacts = getConditions(callSiteBranch);
  if (!isAtomicConjunctionSatisfiable(counterexampleFacts)) return false;
  // This greedily keeps the first satisfiable negation; failure is unknown, not proof that no witness exists.
  for (let i = 0, n = candidates.length; i < n; i++) {
    const candidateConditions = getConditions(candidates[i]);
    if (!isAtomicConjunctionSatisfiable([...counterexampleFacts, ...candidateConditions])) continue;

    let excluded = false;
    for (let j = 0, m = candidateConditions.length; j < m; j++) {
      const negated = negateCondition(candidateConditions[j]);
      if (isAtomicConjunctionSatisfiable([...counterexampleFacts, negated])) {
        counterexampleFacts.push(negated);
        excluded = true;
        break;
      }
    }
    if (!excluded) return false;
  }
  return true;
}

function hasOnlyAtomicConditions(branch: BranchSignature): boolean {
  for (let i = 0, n = branch.length; i < n; i++) {
    const constraint = branch[i];
    if (!constraint.condition || constraint.condition.kind === "expression") return false;
    if (!hasExactIntegerValue(constraint.condition)) return false;
    if (constraint.precedingConditions?.some((condition) => condition.kind === "expression")) return false;
    if (constraint.precedingConditions?.some((condition) => !hasExactIntegerValue(condition))) return false;
  }
  return true;
}

function hasExactIntegerValue(condition: BranchCondition): boolean {
  return (
    condition.kind !== "comparison" ||
    (Number.isSafeInteger(condition.value) && Math.abs(condition.value) < Number.MAX_SAFE_INTEGER)
  );
}

function isAtomicConjunctionSatisfiable(conditions: readonly BranchCondition[]): boolean {
  const states = new Map<
    string,
    {
      defined?: boolean;
      comparisons: Extract<BranchCondition, { kind: "comparison" }>[];
    }
  >();
  for (let i = 0, n = conditions.length; i < n; i++) {
    const condition = conditions[i];
    if (condition.kind === "constant") {
      if (!condition.value) return false;
      continue;
    }
    if (condition.kind === "expression") return false;

    const key = `${condition.name}:${condition.version}`;
    const state = states.get(key) ?? { comparisons: [] };
    states.set(key, state);
    if (condition.kind === "defined") {
      if (state.defined !== undefined && state.defined !== condition.defined) return false;
      state.defined = condition.defined;
    } else {
      state.comparisons.push(condition);
    }
  }

  for (const state of states.values()) {
    if (state.defined === false) {
      if (state.comparisons.some((comparison) => !matchesComparison(0, comparison))) return false;
      continue;
    }

    let exact: number | undefined;
    let minimum = Number.NEGATIVE_INFINITY;
    let maximum = Number.POSITIVE_INFINITY;
    const excluded = new Set<number>();
    for (let i = 0, n = state.comparisons.length; i < n; i++) {
      const comparison = state.comparisons[i];
      if (comparison.operator === "==") {
        if (exact !== undefined && exact !== comparison.value) return false;
        exact = comparison.value;
      } else if (comparison.operator === "!=") {
        excluded.add(comparison.value);
      } else {
        const candidateLower = lowerBound(comparison);
        if (candidateLower) {
          minimum = Math.max(minimum, candidateLower.value + (candidateLower.inclusive ? 0 : 1));
        }
        const candidateUpper = upperBound(comparison);
        if (candidateUpper) {
          maximum = Math.min(maximum, candidateUpper.value - (candidateUpper.inclusive ? 0 : 1));
        }
      }
    }

    if (exact !== undefined) {
      if (excluded.has(exact)) return false;
      if (state.comparisons.some((comparison) => !matchesComparison(exact!, comparison))) return false;
      continue;
    }
    if (minimum > maximum) return false;
    if (Number.isFinite(minimum) && Number.isFinite(maximum)) {
      let excludedInRange = 0;
      for (const value of excluded) {
        if (value >= minimum && value <= maximum) excludedInRange++;
      }
      if (maximum - minimum + 1 <= excludedInRange) return false;
    }
  }
  return true;
}

/**
 * A canonical include guard only controls whether its own chunk is emitted. Once the lexer has
 * proved that the arm defines that same macro, the guard must not become an additional requirement
 * for references outside the chunk. Other enclosing constraints still describe real visibility.
 */
function removeSelfGuardingConstraints(branch: BranchSignature): BranchSignature {
  return branch.some((constraint) => constraint.selfGuarding)
    ? branch.filter((constraint) => !constraint.selfGuarding)
    : branch;
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
  return false;
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
  const normalized = normalizeIntegerComparison(condition);
  return `comparison:${normalized.name}:${normalized.version}:${normalized.operator}:${normalized.value}`;
}

function complementaryConditionKey(condition: BranchCondition): string | undefined {
  if (condition.kind === "constant") return `constant:${!condition.value}`;
  if (condition.kind === "defined") return `defined:${condition.name}:${condition.version}:${!condition.defined}`;
  if (condition.kind === "expression") {
    return `expression:${condition.expression}:${condition.names.map((name, i) => `${name}:${condition.versions[i]}`).join(",")}:${!condition.negated}`;
  }

  if (!hasExactIntegerValue(condition)) {
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

  const normalized = normalizeIntegerComparison(condition);
  const operator =
    normalized.operator === "=="
      ? "!="
      : normalized.operator === "!="
        ? "=="
        : normalized.operator === ">="
          ? "<="
          : ">=";
  const value =
    normalized.operator === ">="
      ? normalized.value - 1
      : normalized.operator === "<="
        ? normalized.value + 1
        : normalized.value;
  return `comparison:${normalized.name}:${normalized.version}:${operator}:${value}`;
}

function normalizeIntegerComparison(
  condition: Extract<BranchCondition, { kind: "comparison" }>
): Extract<BranchCondition, { kind: "comparison" }> {
  if (!hasExactIntegerValue(condition)) return condition;
  if (condition.operator === ">") return { ...condition, operator: ">=", value: condition.value + 1 };
  if (condition.operator === "<") return { ...condition, operator: "<=", value: condition.value - 1 };
  return condition;
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

function isConditionImplied(required: BranchCondition, facts: readonly BranchCondition[]): boolean {
  if (required.kind === "constant") return required.value;
  if (facts.some((fact) => sameCondition(fact, required))) return true;

  if (required.kind === "expression") {
    if (required.opaque) return false;
    if (!required.negated && required.operator === "&&") {
      if (required.operands.every((operand) => isConditionImplied(operand, facts))) return true;
    }
    if (!required.negated && required.operator === "||") {
      if (required.operands.some((operand) => isConditionImplied(operand, facts))) return true;
    }
    if (required.negated && required.operator === "||") {
      if (required.operands.every((operand) => isConditionImplied(negateCondition(operand), facts))) return true;
    }
    if (required.negated && required.operator === "&&") {
      if (required.operands.some((operand) => isConditionImplied(negateCondition(operand), facts))) return true;
    }
    return facts.length > 1 && doDefinedBooleanFactsImply(required, facts);
  }

  for (let i = 0, n = facts.length; i < n; i++) {
    const fact = facts[i];
    if (fact.kind === "constant") continue;
    if (fact.kind === "expression") {
      if (expressionImpliesCondition(fact, required)) return true;
      continue;
    }
    if (fact.name !== required.name || fact.version !== required.version) continue;
    if (conditionImplies(fact, required)) return true;
  }
  return facts.length > 1 && doDefinedBooleanFactsImply(required, facts);
}

/**
 * Propagates `defined(MACRO)` facts through conjunctions and disjunctions,
 * such as `(A || B) && !A => B`, without enumerating macro configurations.
 */
function doDefinedBooleanFactsImply(required: BranchCondition, facts: readonly BranchCondition[]): boolean {
  const known: BranchCondition[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0, n = facts.length; i < n; i++) {
      const simplified = simplifyDefinedBooleanCondition(facts[i], known);
      if (simplified.kind === "constant" && !simplified.value) return true;
      changed = collectGuaranteedDefinedFacts(simplified, known) || changed;
    }
  }
  const simplifiedRequired = simplifyDefinedBooleanCondition(required, known);
  return simplifiedRequired.kind === "constant" && simplifiedRequired.value;
}

function collectGuaranteedDefinedFacts(condition: BranchCondition, known: BranchCondition[]): boolean {
  if (condition.kind === "constant" || condition.kind === "comparison") return false;
  if (condition.kind === "defined") {
    if (known.some((candidate) => sameCondition(candidate, condition))) return false;
    known.push(condition);
    return true;
  }
  if (condition.opaque) return false;
  if (!condition.negated && condition.operator === "&&") {
    return condition.operands.reduce(
      (changed, operand) => collectGuaranteedDefinedFacts(operand, known) || changed,
      false
    );
  }
  if (condition.negated && condition.operator === "||") {
    return condition.operands.reduce(
      (changed, operand) => collectGuaranteedDefinedFacts(negateCondition(operand), known) || changed,
      false
    );
  }
  return false;
}

function simplifyDefinedBooleanCondition(
  condition: BranchCondition,
  known: readonly BranchCondition[]
): BranchCondition {
  if (condition.kind === "constant" || condition.kind === "comparison") return condition;
  if (condition.kind === "defined") {
    if (known.some((candidate) => sameCondition(candidate, condition))) return { kind: "constant", value: true };
    if (known.some((candidate) => areConditionsComplementary(candidate, condition))) {
      return { kind: "constant", value: false };
    }
    return condition;
  }
  if (condition.opaque) return condition;

  const operands = condition.operands.map((operand) => simplifyDefinedBooleanCondition(operand, known));
  const hasTrue = operands.some((operand) => operand.kind === "constant" && operand.value);
  const hasFalse = operands.some((operand) => operand.kind === "constant" && !operand.value);
  const remaining = operands.filter((operand) => operand.kind !== "constant");
  const innerValue =
    condition.operator === "&&"
      ? hasFalse
        ? false
        : remaining.length === 0
          ? true
          : undefined
      : hasTrue
        ? true
        : remaining.length === 0
          ? false
          : undefined;
  if (innerValue !== undefined) return { kind: "constant", value: condition.negated ? !innerValue : innerValue };
  if (!condition.negated && remaining.length === 1) return remaining[0];
  return { ...condition, operands: remaining };
}

function expressionImpliesCondition(
  fact: Extract<BranchCondition, { kind: "expression" }>,
  required: Exclude<BranchCondition, { kind: "constant" | "expression" }>
): boolean {
  if (fact.opaque) return false;
  if (!fact.negated && fact.operator === "&&") {
    return fact.operands.some((operand) => isConditionImplied(required, [operand]));
  }
  if (!fact.negated && fact.operator === "||") {
    return fact.operands.every((operand) => isConditionImplied(required, [operand]));
  }
  if (fact.negated && fact.operator === "||") {
    return fact.operands.some((operand) => isConditionImplied(required, [negateCondition(operand)]));
  }
  if (fact.negated && fact.operator === "&&") {
    return fact.operands.every((operand) => isConditionImplied(required, [negateCondition(operand)]));
  }
  return false;
}

function negateCondition(condition: BranchCondition): BranchCondition {
  if (condition.kind === "constant") return { kind: "constant", value: !condition.value };
  if (condition.kind === "defined") return { ...condition, defined: !condition.defined };
  if (condition.kind === "expression") return { ...condition, negated: !condition.negated };
  switch (condition.operator) {
    case "==":
      return { ...condition, operator: "!=" };
    case "!=":
      return { ...condition, operator: "==" };
    case ">":
      return { ...condition, operator: "<=" };
    case ">=":
      return { ...condition, operator: "<" };
    case "<":
      return { ...condition, operator: ">=" };
    case "<=":
      return { ...condition, operator: ">" };
  }
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
    actual.value > required.value || (actual.value === required.value && (required.inclusive || !actual.inclusive))
  );
}

function isUpperBoundAtMost(
  actual: { value: number; inclusive: boolean },
  required: { value: number; inclusive: boolean }
): boolean {
  return (
    actual.value < required.value || (actual.value === required.value && (required.inclusive || !actual.inclusive))
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

/** Analyzer-grade branch reasoning kept outside the runtime parser module graph. @internal */
/** Analyzer branch-proof implementation injected into analyzer parser instances. @internal */
export const branchAnalysis: BranchSemantics = {
  canBranchesOverlap,
  canDeclarationsCoexist,
  getBranchCoverage,
  getDeclarationCoexistence,
  isBranchReachable,
  isBranchVisibleFrom
};
