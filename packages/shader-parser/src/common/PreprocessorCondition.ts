import {
  evaluateContextFreePreprocessorCondition,
  parsePreprocessorExpression,
  type Condition,
  type PreprocessorExpressionParseResult
} from "@galacean/engine-design";
import type { BoolCondition, CompareCondition, DefinedCondition } from "@galacean/engine-design";

/**
 * Parsed condition subset used for static branch reasoning and compact runtime instructions.
 */
export type PreprocessorCondition =
  | BoolCondition
  | CompareCondition
  | DefinedCondition
  | { t: "and"; l: PreprocessorCondition; r: PreprocessorCondition }
  | { t: "or"; l: PreprocessorCondition; r: PreprocessorCondition }
  | { t: "not"; c: PreprocessorCondition };

/**
 * Parses a condition that can be represented by the branch-reasoning model.
 * @param expression - Text following an `#if` or `#elif` directive.
 * @returns Parsed branch condition.
 * @throws Error when the complete expression is malformed or exceeds the reasoning subset.
 */
export function parsePreprocessorCondition(expression: string): PreprocessorCondition {
  const condition = tryParsePreprocessorCondition(expression);
  if (!condition) throw new Error(`Unsupported or malformed preprocessor condition '${expression}'.`);
  return condition;
}

/**
 * Parses a condition without throwing when static branch reasoning cannot represent it.
 * @param expression - Text following an `#if` or `#elif` directive.
 * @param parsedExpression - Complete parser result already produced while lexing.
 * @returns Parsed branch condition, or `undefined` for malformed or richer expressions.
 * @internal
 */
export function tryParsePreprocessorCondition(
  expression: string,
  parsedExpression: PreprocessorExpressionParseResult = parsePreprocessorExpression(expression)
): PreprocessorCondition | undefined {
  const result = parsedExpression;
  if (!result.ok) return undefined;
  const constantValue = evaluateContextFreePreprocessorCondition(result.condition);
  if (constantValue !== undefined) return { t: "bool", v: constantValue !== 0 };
  return result.requiresFullIntegerSemantics ? undefined : toPreprocessorCondition(result.condition);
}

/**
 * Projects a complete expression tree into the static branch-reasoning subset.
 * @param condition - Complete parsed expression tree.
 * @returns Compact branch condition, or `undefined` when the subset cannot represent it.
 * @internal
 */
export function toPreprocessorCondition(condition: Condition): PreprocessorCondition | undefined {
  switch (condition.t) {
    case "def":
      return condition;
    case "and": {
      const left = toPreprocessorCondition(condition.l);
      const right = toPreprocessorCondition(condition.r);
      return left && right ? { t: "and", l: left, r: right } : undefined;
    }
    case "or": {
      const left = toPreprocessorCondition(condition.l);
      const right = toPreprocessorCondition(condition.r);
      return left && right ? { t: "or", l: left, r: right } : undefined;
    }
    case "not": {
      const child = toPreprocessorCondition(condition.c);
      return child ? { t: "not", c: child } : undefined;
    }
    case "id":
      return { t: "cmp", m: condition.m, op: "!=", v: 0 };
    case "binary":
      return toComparisonCondition(condition);
    case "num":
      return { t: "bool", v: condition.v !== 0 };
    case "bool":
    case "cmp":
      return condition;
    case "ndef":
      return { t: "not", c: { t: "def", m: condition.m } };
    case "unary":
    case "select":
      return undefined;
    case "deferred":
      return undefined;
  }
}

function toComparisonCondition(
  condition: Extract<Condition, { t: "binary" }>
): CompareCondition | BoolCondition | undefined {
  if (
    condition.l.t === "id" &&
    condition.r.t === "num" &&
    (condition.op === "==" ||
      condition.op === "!=" ||
      condition.op === ">" ||
      condition.op === ">=" ||
      condition.op === "<" ||
      condition.op === "<=")
  ) {
    return { t: "cmp", m: condition.l.m, op: condition.op, v: condition.r.v };
  }
  if (
    condition.l.t === "num" &&
    condition.r.t === "num" &&
    (condition.op === "==" ||
      condition.op === "!=" ||
      condition.op === ">" ||
      condition.op === ">=" ||
      condition.op === "<" ||
      condition.op === "<=")
  ) {
    return evaluateStaticCondition(condition);
  }
  return undefined;
}

function evaluateStaticCondition(condition: Condition): BoolCondition | undefined {
  const value = evaluateContextFreePreprocessorCondition(condition);
  return value === undefined ? undefined : { t: "bool", v: value !== 0 };
}
