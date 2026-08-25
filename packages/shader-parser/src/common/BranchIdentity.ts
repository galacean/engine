import type { BranchCondition, BranchSignature, DeclarationCoexistence } from "./BaseToken";

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
 * Classifies only coexistence facts encoded directly in lexical branch identities.
 *
 * This intentionally does not evaluate `#if` expressions. The runtime compiler uses it to avoid
 * bundling the analyzer's bounded macro solver; offline validation supplies the full proof function.
 * @param earlier - Earlier declaration branch.
 * @param later - Later declaration branch.
 * @returns Proven coexistence, proven lexical exclusivity, or an unresolved relation.
 * @internal
 */
export function getLexicalDeclarationCoexistence(
  earlier: BranchSignature,
  later: BranchSignature
): DeclarationCoexistence {
  for (const left of earlier) {
    for (const right of later) {
      if (
        (left.conditionalGroup !== undefined &&
          left.conditionalGroup === right.conditionalGroup &&
          left.conditionalArm !== right.conditionalArm) ||
        (left.name === right.name && left.defined !== right.defined)
      ) {
        return "exclusive";
      }
    }
  }

  for (const constraint of earlier) {
    if (constraint.condition !== undefined) return "unknown";
  }
  for (const constraint of later) {
    if (constraint.condition !== undefined) return "unknown";
  }
  return "coexist";
}

/**
 * Compares two optional branch conditions structurally.
 * @param left - First condition, or no condition.
 * @param right - Second condition, or no condition.
 * @returns Whether both conditions encode the same predicate.
 * @internal
 */
export function sameCondition(left?: BranchCondition, right?: BranchCondition): boolean {
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

/**
 * Compares the normalized expression and macro-version dependencies of two expression conditions.
 * @param left - First expression condition.
 * @param right - Second expression condition.
 * @returns Whether both expression conditions have identical inputs.
 * @internal
 */
export function sameExpression(
  left: Extract<BranchCondition, { kind: "expression" }>,
  right: Extract<BranchCondition, { kind: "expression" }>
): boolean {
  if (
    left.expression !== right.expression ||
    left.opaque !== right.opaque ||
    left.names.length !== right.names.length
  ) {
    return false;
  }
  for (let i = 0, n = left.names.length; i < n; i++) {
    if (left.names[i] !== right.names[i] || left.versions[i] !== right.versions[i]) return false;
  }
  return true;
}
