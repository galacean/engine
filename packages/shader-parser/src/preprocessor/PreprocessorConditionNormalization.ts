import { evaluateContextFreePreprocessorCondition, type Condition } from "@galacean/engine-design";

type Range = readonly [number, number];
type RangeCache = WeakMap<Condition, Range | undefined>;
type Comparison = "<" | "<=" | ">" | ">=" | "==" | "!=";

const INT_MIN = -0x80000000;
const INT_MAX = 0x7fffffff;
const INTEGER_RANGE: Range = [INT_MIN, INT_MAX];
const BOOLEAN_RANGE: Range = [0, 1];

/**
 * Normalizes the truth of a fully expanded condition while preserving integer and short-circuit semantics.
 * @param condition - Expression containing constants and definition checks.
 * @returns An equivalent condition without modifying the input tree.
 * @internal
 */
export function normalizePreprocessorCondition(condition: Condition): Condition {
  return normalize(condition, new WeakMap());
}

/**
 * Bounds every result of a fully expanded expression over all definition configurations.
 * @param condition - Expression containing constants and definition checks.
 * @param cache - Optional memoization shared within one call over unchanged expression trees.
 * @returns Inclusive signed integer bounds, or undefined when total evaluation cannot be established.
 * @internal
 */
export function getPreprocessorConditionRange(
  condition: Condition,
  cache: WeakMap<Condition, Range | undefined> = new WeakMap()
): Range | undefined {
  return getRange(condition, cache);
}

function getRange(condition: Condition, cache: RangeCache): Range | undefined {
  if (cache.has(condition)) return cache.get(condition);
  const result = computeRange(condition, cache);
  cache.set(condition, result);
  return result;
}

function computeRange(condition: Condition, cache: RangeCache): Range | undefined {
  switch (condition.t) {
    case "num":
      return [condition.v, condition.v];
    case "bool":
      return [Number(condition.v), Number(condition.v)];
    case "def":
    case "ndef":
      return BOOLEAN_RANGE;
    case "not": {
      const child = getRange(condition.c, cache);
      return child && (excludesZero(child) ? [0, 0] : child[0] === child[1] ? [1, 1] : BOOLEAN_RANGE);
    }
    case "and":
    case "or": {
      const left = getRange(condition.l, cache);
      if (!left) return;
      const conjunction = condition.t === "and";
      if (conjunction && left[0] === 0 && left[1] === 0) return [0, 0];
      if (!conjunction && excludesZero(left)) return [1, 1];
      const right = getRange(condition.r, cache);
      if (!right) return;
      if (conjunction && right[0] === 0 && right[1] === 0) return [0, 0];
      if (!conjunction && excludesZero(right)) return [1, 1];
      if (excludesZero(left) && excludesZero(right)) return [1, 1];
      if (left[0] === 0 && left[1] === 0 && right[0] === 0 && right[1] === 0) return [0, 0];
      return BOOLEAN_RANGE;
    }
    case "unary": {
      const child = getRange(condition.c, cache);
      if (!child) return;
      if (child[0] === child[1]) return constantRange({ ...condition, c: numeric(child[0]) });
      if (condition.op === "+") return child;
      if (condition.op === "~") return [~child[1], ~child[0]];
      return child[0] === INT_MIN ? INTEGER_RANGE : [-child[1], -child[0]];
    }
    case "binary": {
      const left = getRange(condition.l, cache);
      const right = getRange(condition.r, cache);
      if (!left || !right) return;
      if (left[0] === left[1] && right[0] === right[1]) {
        return constantRange({ ...condition, l: numeric(left[0]), r: numeric(right[0]) });
      }
      if (isComparison(condition.op)) return BOOLEAN_RANGE;
      switch (condition.op) {
        case "+":
          return boundedRange(left[0] + right[0], left[1] + right[1]);
        case "-":
          return boundedRange(left[0] - right[1], left[1] - right[0]);
        case "*": {
          const products = [left[0] * right[0], left[0] * right[1], left[1] * right[0], left[1] * right[1]];
          return boundedRange(Math.min(...products), Math.max(...products));
        }
        case "/":
        case "%":
          return excludesZero(right) ? INTEGER_RANGE : undefined;
        case "<<":
        case ">>":
          return right[0] >= 0 && right[1] <= 31 ? INTEGER_RANGE : undefined;
        default:
          return left[0] >= 0 && left[1] <= 1 && right[0] >= 0 && right[1] <= 1 ? BOOLEAN_RANGE : INTEGER_RANGE;
      }
    }
    default:
      return;
  }
}

function normalize(condition: Condition, cache: RangeCache): Condition {
  const range = getRange(condition, cache);
  if (!range) return condition;
  if (excludesZero(range)) return boolean(true);
  if (range[0] === 0 && range[1] === 0) return boolean(false);
  switch (condition.t) {
    case "not":
      return negate(normalize(condition.c, cache));
    case "and":
    case "or":
      return combine(condition.t, normalize(condition.l, cache), normalize(condition.r, cache));
    case "binary":
      if (isComparison(condition.op)) {
        const left = getRange(condition.l, cache)!;
        const right = getRange(condition.r, cache)!;
        if (right[0] === right[1]) return compare(condition.l, condition.op, right[0], cache);
        if (left[0] === left[1]) return compare(condition.r, reverse(condition.op), left[0], cache);
      }
      break;
  }
  return arithmeticTruth(condition, cache) ?? condition;
}

function arithmeticTruth(condition: Condition, cache: RangeCache): Condition | undefined {
  if (condition.t === "def" || condition.t === "ndef") return condition;
  if (condition.t === "unary" && condition.op !== "~") return normalize(condition.c, cache);
  if (condition.t !== "binary") return;
  const left = getRange(condition.l, cache)!;
  const right = getRange(condition.r, cache)!;
  if (condition.op === "+" && unwrappedSum(left, right)) {
    if ((left[0] >= 0 && right[0] >= 0) || (left[1] <= 0 && right[1] <= 0)) {
      return combine("or", normalize(condition.l, cache), normalize(condition.r, cache));
    }
  }
  if (condition.op === "|") {
    return combine("or", normalize(condition.l, cache), normalize(condition.r, cache));
  }
  if (condition.op === "&" && left[0] >= 0 && left[1] <= 1 && right[0] >= 0 && right[1] <= 1) {
    return combine("and", normalize(condition.l, cache), normalize(condition.r, cache));
  }
}

function compare(expression: Condition, operator: Comparison, value: number, cache: RangeCache): Condition {
  switch (operator) {
    case "<":
      return lessThan(expression, value, cache);
    case "<=":
      return lessThan(expression, value + 1, cache);
    case ">":
      return negate(lessThan(expression, value + 1, cache));
    case ">=":
      return negate(lessThan(expression, value, cache));
    case "==":
      return combine("and", negate(lessThan(expression, value, cache)), lessThan(expression, value + 1, cache));
    case "!=":
      return combine("or", lessThan(expression, value, cache), negate(lessThan(expression, value + 1, cache)));
  }
}

function lessThan(expression: Condition, value: number, cache: RangeCache): Condition {
  const range = getRange(expression, cache)!;
  // Bounds are checked before constructing a literal, since MAX + 1 is outside signed 32 bits
  if (range[1] < value) return boolean(true);
  if (range[0] >= value) return boolean(false);
  if ((range[0] === 0 && value === 1) || (range[1] === 0 && value === 0)) {
    const truth = arithmeticTruth(expression, cache);
    if (truth) return range[0] === 0 ? negate(truth) : truth;
  }
  if (value === range[0] + 1 || value === range[1]) {
    const maximum = value === range[1];
    const endpoint = sumEndpoint(expression, maximum, cache);
    if (endpoint) return maximum ? negate(endpoint) : endpoint;
  }
  return { t: "binary", op: "<", l: expression, r: numeric(value) };
}

function sumEndpoint(expression: Condition, maximum: boolean, cache: RangeCache): Condition | undefined {
  if (expression.t !== "binary" || expression.op !== "+") return;
  const left = getRange(expression.l, cache)!;
  const right = getRange(expression.r, cache)!;
  if (!unwrappedSum(left, right)) return;
  const bound = maximum ? 1 : 0;
  return combine(
    "and",
    compare(expression.l, "==", left[bound], cache),
    compare(expression.r, "==", right[bound], cache)
  );
}

function combine(operator: "and" | "or", left: Condition, right: Condition): Condition {
  if (left.t === "bool") return left.v === (operator === "and") ? right : left;
  if (right.t === "bool") return right.v === (operator === "and") ? left : right;
  return { t: operator, l: left, r: right };
}

function negate(condition: Condition): Condition {
  switch (condition.t) {
    case "bool":
      return boolean(!condition.v);
    case "def":
      return { t: "ndef", m: condition.m };
    case "ndef":
      return { t: "def", m: condition.m };
    case "not":
      return condition.c;
    case "and":
    case "or":
      return combine(condition.t === "and" ? "or" : "and", negate(condition.l), negate(condition.r));
    default:
      return { t: "not", c: condition };
  }
}

function unwrappedSum(left: Range, right: Range): boolean {
  return left[0] + right[0] >= INT_MIN && left[1] + right[1] <= INT_MAX;
}

function boundedRange(minimum: number, maximum: number): Range {
  return minimum >= INT_MIN && maximum <= INT_MAX ? [minimum, maximum] : INTEGER_RANGE;
}

function constantRange(condition: Condition): Range | undefined {
  const value = evaluateContextFreePreprocessorCondition(condition);
  return value === undefined ? undefined : [value, value];
}

function excludesZero(range: Range): boolean {
  return range[0] > 0 || range[1] < 0;
}

function numeric(value: number): Condition {
  return { t: "num", v: value };
}

function boolean(value: boolean): Condition {
  return { t: "bool", v: value };
}

function isComparison(operator: string): operator is Comparison {
  return ["<", "<=", ">", ">=", "==", "!="].includes(operator);
}

function reverse(operator: Comparison): Comparison {
  switch (operator) {
    case "<":
      return ">";
    case "<=":
      return ">=";
    case ">":
      return "<";
    case ">=":
      return "<=";
    default:
      return operator;
  }
}
