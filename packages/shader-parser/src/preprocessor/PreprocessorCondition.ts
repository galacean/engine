import { evaluateContextFreePreprocessorCondition, type Condition } from "@galacean/engine-design";
import type { BranchSignature } from "../common/BaseToken";
import { getPreprocessorConditionRange, normalizePreprocessorCondition } from "./PreprocessorConditionNormalization";
import { provePreprocessorConditionCoverage } from "./PreprocessorConditionDiagram";

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
 * Proves that a set of narrower declarations collectively covers an inherited declaration.
 * @param declarations - Alternative guards from narrower ShaderLab scopes.
 * @param reference - Guard of the inherited declaration.
 * @returns Whether the inherited declaration can be removed in every macro configuration.
 * @internal
 */
export function canInheritanceBranchesCover(
  declarations: readonly BranchSignature[],
  reference: BranchSignature
): boolean {
  let facts = getPredicates(reference);
  const alternatives = declarations.map(getPredicates);
  if (alternatives.includes(true) || facts === false) return true;
  if (facts === undefined) return false;
  let required = alternatives.filter(
    (predicates): predicates is readonly PreprocessorConditionTerm[] | boolean => predicates !== undefined
  );
  // Normalize only when declarations compete for ownership, rather than every preprocessor directive
  const normalized = new Map<SourcePreprocessorCondition, SourcePreprocessorCondition>();
  function normalize(predicates: readonly PreprocessorConditionTerm[] | boolean) {
    if (typeof predicates === "boolean") return predicates;
    return predicates.map(({ condition, negated }) => {
      let canonical = normalized.get(condition);
      if (!canonical) {
        canonical =
          condition.kind === "opaque"
            ? condition
            : { ...condition, expression: normalizePreprocessorCondition(condition.expression) };
        normalized.set(condition, canonical);
      }
      return { condition: canonical, negated };
    });
  }
  required = required.map(normalize);
  facts = normalize(facts);
  const rangeCache = new WeakMap<Condition, IntegerRange | undefined>();
  if (required.some((alternative) => proveCanonicalCoverage(alternative, facts!, rangeCache))) return true;
  return provePreprocessorConditionCoverage(required, facts) === true;
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

type IntegerRange = readonly [number, number];

function proveCanonicalCoverage(
  required: readonly PreprocessorConditionTerm[] | boolean,
  facts: readonly PreprocessorConditionTerm[] | boolean,
  rangeCache: WeakMap<Condition, IntegerRange | undefined>
): boolean {
  const known = new Set<number>();
  const ranges = new Map<number, IntegerRange>();
  const keys = new Map<SourcePreprocessorCondition, Map<Condition, number>>();
  const identities = new Map<string, number>();
  const rangeOf = (expression: Condition) => getPreprocessorConditionRange(expression, rangeCache);
  let impossible = facts === false;

  // Share structural IDs across owners without embedding complete child expressions in every parent key
  function intern(signature: string): number {
    let identity = identities.get(signature);
    if (identity === undefined) identities.set(signature, (identity = identities.size + 1));
    return identity;
  }

  function key(expression: Condition, owner: SourcePreprocessorCondition): number {
    let cache = keys.get(owner);
    if (!cache) keys.set(owner, (cache = new Map()));
    let result = cache.get(expression);
    if (result === undefined) {
      result = canonicalExpressionKey(
        expression,
        owner.kind === "expression" ? owner.versions : {},
        (child) => key(child, owner),
        rangeOf,
        intern
      );
      cache.set(expression, result);
    }
    return result;
  }

  function interval(expression: Condition, negated: boolean, owner: SourcePreprocessorCondition) {
    let numeric = expression;
    let allowed: IntegerRange;
    if (expression.t === "binary" && expression.op === "<" && expression.r.t === "num") {
      numeric = expression.l;
      allowed = negated ? [expression.r.v, 0x7fffffff] : [-0x80000000, expression.r.v - 1];
    } else if (negated) {
      allowed = [0, 0];
    } else {
      const domain = rangeOf(numeric);
      if (!domain || (domain[0] < 0 && domain[1] > 0)) return;
      allowed = domain[0] >= 0 ? [1, 0x7fffffff] : [-0x80000000, -1];
    }
    const domain = rangeOf(numeric);
    if (!domain) return;
    return {
      key: key(numeric, owner),
      domain,
      allowed: [Math.max(domain[0], allowed[0]), Math.min(domain[1], allowed[1])] as IntegerRange
    };
  }

  function visit(
    owner: SourcePreprocessorCondition,
    expression: Condition | undefined,
    negated: boolean,
    record: boolean
  ): boolean {
    if (owner.kind === "opaque") {
      const identity = (negated ? -1 : 1) * intern(opaqueKey(owner.identity));
      if (record) known.add(identity);
      return known.has(identity);
    }
    if (!expression) return false;
    if (expression.t === "not") return visit(owner, expression.c, !negated, record);
    if (expression.t === "bool" || expression.t === "num") {
      const value = Boolean(expression.v) !== negated;
      if (record && !value) impossible = true;
      return value;
    }
    const identity = (negated ? -1 : 1) * key(expression, owner);
    if (record) known.add(identity);
    else if (known.has(identity)) return true;

    if (expression.t === "and" || expression.t === "or") {
      // A reordered Boolean proof must not skip an operand that can fail before short-circuiting
      if (!rangeOf(expression)) return false;
      const conjunction = (expression.t === "and") !== negated;
      if (record && !conjunction) return false;
      const left = visit(owner, expression.l, negated, record);
      const right = visit(owner, expression.r, negated, record);
      return conjunction ? left && right : left || right;
    }
    const constraint = interval(expression, negated, owner);
    if (!constraint) return false;
    const previous = ranges.get(constraint.key) ?? constraint.domain;
    const allowed = constraint.allowed;
    if (record) {
      const narrowed: IntegerRange = [Math.max(previous[0], allowed[0]), Math.min(previous[1], allowed[1])];
      if (narrowed[0] > narrowed[1]) impossible = true;
      ranges.set(constraint.key, narrowed);
      return true;
    }
    return previous[0] >= allowed[0] && previous[1] <= allowed[1];
  }

  if (typeof facts !== "boolean") {
    for (const { condition, negated } of facts) {
      visit(condition, condition.kind === "expression" ? condition.expression : undefined, negated, true);
    }
  }
  return (
    impossible ||
    (typeof required === "boolean"
      ? required
      : required.every(({ condition, negated }) =>
          visit(condition, condition.kind === "expression" ? condition.expression : undefined, negated, false)
        ))
  );
}

function canonicalExpressionKey(
  expression: Condition,
  versions: Readonly<Record<string, number>>,
  key: (condition: Condition) => number,
  rangeOf: (condition: Condition) => IntegerRange | undefined,
  intern: (signature: string) => number
): number {
  const range = rangeOf(expression);
  if (range && range[0] === range[1]) return intern(`num:${range[0]}`);
  switch (expression.t) {
    case "def":
    case "ndef":
      return intern(`${expression.t}:${definedKey(expression.m, versions[expression.m])}`);
    case "not":
      return intern(`not(${key(expression.c)})`);
    case "unary":
      return intern(`${expression.op}(${key(expression.c)})`);
    case "and":
    case "or":
    case "binary": {
      const operator = expression.t === "binary" ? expression.op : expression.t;
      const numeric = ["+", "*", "&", "|", "^"].includes(operator);
      // These numeric operations are associative modulo 32 bits; Boolean reordering also needs total operands
      if (numeric || ((operator === "and" || operator === "or") && range)) {
        const terms: number[] = [];
        let constant: number | undefined;
        const collect = (node: Condition) => {
          if (
            (node.t === "binary" && node.op === operator) ||
            ((node.t === "and" || node.t === "or") && node.t === operator)
          ) {
            collect(node.l);
            collect(node.r);
          } else {
            const value = rangeOf(node);
            if (numeric && value && value[0] === value[1]) {
              constant =
                constant === undefined
                  ? value[0]
                  : evaluateContextFreePreprocessorCondition({
                      t: "binary",
                      op: operator as "+" | "*" | "&" | "|" | "^",
                      l: { t: "num", v: constant },
                      r: { t: "num", v: value[0] }
                    });
            } else terms.push(key(node));
          }
        };
        collect(expression);
        const identity = operator === "*" ? 1 : operator === "&" ? -1 : 0;
        if (numeric && constant !== undefined && (constant !== identity || !terms.length)) {
          terms.push(intern(`num:${constant}`));
        }
        terms.sort((left, right) => left - right);
        return terms.length === 1 ? terms[0] : intern(`${operator}(${terms.join(",")})`);
      }
      return intern(`${operator}(${key(expression.l)},${key(expression.r)})`);
    }
    default:
      return intern(JSON.stringify(expression));
  }
}

function definedKey(name: string, version: number): string {
  return `defined:${name}:${version}`;
}

function opaqueKey(identity: string): string {
  return `opaque:${identity}`;
}
