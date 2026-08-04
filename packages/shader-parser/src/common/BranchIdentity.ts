import type { BranchCondition, BranchSignature } from "./BaseToken";

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
