import { evaluateContextFreePreprocessorCondition, type Condition } from "@galacean/engine-design";
import type { PreprocessorConditionTerm, SourcePreprocessorCondition } from "./PreprocessorCondition";

type Predicates = readonly PreprocessorConditionTerm[] | boolean;
type Operator =
  | "truth"
  | "not"
  | "positive"
  | "negative"
  | "complement"
  | "and"
  | "or"
  | (Condition & { t: "binary" })["op"];
type Node = { variable: number; low: number; high: number; value?: number };

// Count apply states as well as nodes: many distinct operand pairs can reduce to the same leaf.
const MAX_DIAGRAM_WORK = 16384;
const EXHAUSTED = Symbol("condition diagram budget");

/**
 * Proves union coverage using shared numeric decision nodes instead of enumerating macro assignments.
 * @param declarations - Alternative declaration guards, each expressed as a conjunction.
 * @param reference - Guard of the inherited declaration.
 * @returns Whether coverage is proven, or undefined when the bounded diagram cannot establish it.
 * @internal
 */
export function provePreprocessorConditionCoverage(
  declarations: readonly Predicates[],
  reference: Predicates
): boolean | undefined {
  const diagram = new ConditionDiagram();
  try {
    const source = diagram.predicates(reference);
    let target = diagram.constant(0);
    for (const declaration of declarations) {
      target = diagram.apply("or", target, diagram.predicates(declaration));
    }
    return diagram.apply("or", diagram.apply("not", source), target) === diagram.constant(1);
  } catch (error) {
    if (error !== EXHAUSTED) throw error;
    return undefined;
  }
}

class ConditionDiagram {
  private readonly _nodes: Node[] = [];
  private readonly _constants = new Map<number | undefined, number>();
  private readonly _variables = new Map<string, number>();
  private readonly _branches = new Map<string, number>();
  private readonly _operations = new Map<string, number>();
  private readonly _expressions = new Map<SourcePreprocessorCondition, Map<Condition, number>>();
  private _remaining = MAX_DIAGRAM_WORK;

  constant(value?: number): number {
    let id = this._constants.get(value);
    if (id === undefined) {
      this._spend();
      id = this._nodes.length;
      this._nodes.push({ variable: Infinity, low: 0, high: 0, value });
      this._constants.set(value, id);
    }
    return id;
  }

  predicates(predicates: Predicates): number {
    if (typeof predicates === "boolean") return this.constant(Number(predicates));
    let value = this.constant(1);
    for (const { condition, negated } of predicates) {
      const expression =
        condition.kind === "opaque"
          ? this._variable(`opaque:${condition.identity}`)
          : this._expression(condition.expression, condition);
      value = this.apply("and", value, this.apply(negated ? "not" : "truth", expression));
    }
    return value;
  }

  apply(operator: Operator, left: number, right = left): number {
    const key = `${operator}:${left}:${right}`;
    const cached = this._operations.get(key);
    if (cached !== undefined) return cached;
    this._spend();
    const a = this._nodes[left];
    const b = this._nodes[right];
    let result: number;
    if (a.variable === Infinity && a.value === undefined) {
      result = left;
    } else if (a.variable === Infinity && operator === "and" && a.value === 0) {
      result = this.constant(0);
    } else if (a.variable === Infinity && operator === "or" && a.value !== 0) {
      result = this.constant(1);
    } else if (a.variable === Infinity && b.variable === Infinity) {
      result = this._evaluate(operator, a.value!, b.value);
    } else {
      const variable = Math.min(a.variable, b.variable);
      result = this._branch(
        variable,
        this.apply(operator, a.variable === variable ? a.low : left, b.variable === variable ? b.low : right),
        this.apply(operator, a.variable === variable ? a.high : left, b.variable === variable ? b.high : right)
      );
    }
    this._operations.set(key, result);
    return result;
  }

  private _expression(expression: Condition, owner: SourcePreprocessorCondition & { kind: "expression" }): number {
    let cache = this._expressions.get(owner);
    if (!cache) this._expressions.set(owner, (cache = new Map()));
    const cached = cache.get(expression);
    if (cached !== undefined) return cached;
    let result: number;
    switch (expression.t) {
      case "bool":
        result = this.constant(Number(expression.v));
        break;
      case "num":
        result = this.constant(expression.v);
        break;
      case "def":
      case "ndef":
        result = this._variable(`defined:${expression.m}:${owner.versions[expression.m]}`);
        if (expression.t === "ndef") result = this.apply("not", result);
        break;
      case "not":
        result = this.apply("not", this._expression(expression.c, owner));
        break;
      case "unary":
        result = this.apply(
          expression.op === "+" ? "positive" : expression.op === "-" ? "negative" : "complement",
          this._expression(expression.c, owner)
        );
        break;
      case "and":
      case "or":
      case "binary": {
        const operator = expression.t === "binary" ? expression.op : expression.t;
        result = ["and", "or", "+", "*", "&", "|", "^"].includes(operator)
          ? this._associativeExpression(expression, owner, operator)
          : this.apply(operator, this._expression(expression.l, owner), this._expression(expression.r, owner));
        break;
      }
      default:
        result = this.constant();
        break;
    }
    cache.set(expression, result);
    return result;
  }

  private _associativeExpression(
    expression: Condition,
    owner: SourcePreprocessorCondition & { kind: "expression" },
    operator: Operator
  ): number {
    const pending = [expression];
    const operands: number[] = [];
    while (pending.length) {
      const node = pending.pop()!;
      if (
        (node.t === "binary" && node.op === operator) ||
        ((node.t === "and" || node.t === "or") && node.t === operator)
      ) {
        pending.push(node.r, node.l);
      } else {
        operands.push(this._expression(node, owner));
      }
    }
    // Balanced groups avoid constructing every prefix diagram; source order preserves short-circuit errors
    while (operands.length > 1) {
      let count = 0;
      for (let index = 0; index < operands.length; index += 2) {
        operands[count++] =
          index + 1 < operands.length ? this.apply(operator, operands[index], operands[index + 1]) : operands[index];
      }
      operands.length = count;
    }
    return operands[0];
  }

  private _variable(identity: string): number {
    let variable = this._variables.get(identity);
    if (variable === undefined) this._variables.set(identity, (variable = this._variables.size));
    return this._branch(variable, this.constant(0), this.constant(1));
  }

  private _branch(variable: number, low: number, high: number): number {
    if (low === high) return low;
    const key = `${variable}:${low}:${high}`;
    let id = this._branches.get(key);
    if (id === undefined) {
      this._spend();
      id = this._nodes.length;
      this._nodes.push({ variable, low, high });
      this._branches.set(key, id);
    }
    return id;
  }

  private _evaluate(operator: Operator, left: number, right?: number): number {
    if (operator === "truth") return this.constant(Number(left !== 0));
    if (operator === "not") return this.constant(Number(left === 0));
    const l: Condition = { t: "num", v: left };
    let expression: Condition;
    if (operator === "positive" || operator === "negative" || operator === "complement") {
      expression = { t: "unary", op: operator === "positive" ? "+" : operator === "negative" ? "-" : "~", c: l };
    } else {
      if (right === undefined) return this.constant();
      const r: Condition = { t: "num", v: right };
      expression =
        operator === "and" || operator === "or" ? { t: operator, l, r } : { t: "binary", op: operator, l, r };
    }
    let value: number | undefined;
    try {
      value = evaluateContextFreePreprocessorCondition(expression);
    } catch {
      value = undefined;
    }
    return this.constant(value);
  }

  private _spend(): void {
    if (--this._remaining < 0) throw EXHAUSTED;
  }
}
