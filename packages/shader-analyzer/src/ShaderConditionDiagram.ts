import type {
  BranchCondition,
  BranchConstraint,
  BranchCoverage,
  BranchReachability,
  BranchSignature
} from "@galacean/engine-shader-parser/internal/analyzer";

type SourceArm = NonNullable<BranchConstraint["sourceArm"]>;
type SourceCondition = NonNullable<SourceArm["predicates"]>[number]["condition"];
type Operator = "and" | "or";

interface Variable {
  readonly opaque: boolean;
  readonly points: readonly number[];
  readonly indices: ReadonlyMap<number, number>;
  readonly size: number;
}

interface DecisionNode {
  readonly variable: number;
  readonly ends: readonly number[];
  readonly children: readonly number[];
}

const INTEGER_MINIMUM = -0x80000000;
const INTEGER_END = 0x80000000;

/**
 * Request-owned symbolic macro conditions shared by call-graph reachability and coverage.
 * @internal
 */
export class ShaderConditionDiagram {
  static readonly FALSE = 0;
  static readonly TRUE = 1;

  private readonly _variables: Variable[] = [];
  private readonly _variableIds = new Map<string, number>();
  private readonly _nodes: DecisionNode[] = [
    { variable: Infinity, ends: [], children: [] },
    { variable: Infinity, ends: [], children: [] }
  ];
  private readonly _unique = new Map<string, number>();
  private readonly _operations = new Map<string, number>();
  private readonly _negations = new Map<number, number>([
    [0, 1],
    [1, 0]
  ]);
  private readonly _knownConditions = new Map<number, number>([
    [0, 0],
    [1, 1]
  ]);
  private readonly _conditions = new WeakMap<BranchCondition, number>();
  private readonly _sources = new WeakMap<SourceCondition, number>();
  private readonly _sourceFacts = new Map<SourceCondition, BranchCondition>();
  private readonly _sourceKeys = new Map<SourceCondition, string>();
  private readonly _constraints = new Map<BranchConstraint, number>();
  private readonly _groups = new Map<number, Map<number, BranchConstraint>>();
  private readonly _groupRoots = new Map<number, ReadonlyMap<number, number>>();
  private readonly _branches = [new WeakMap<BranchSignature, number>(), new WeakMap<BranchSignature, number>()];

  /**
   * Registers every condition before partitioning macro values into equivalent integer intervals.
   * @param branches - All source and expanded-macro branches used by this pass's analysis.
   */
  constructor(branches: Iterable<BranchSignature>) {
    for (const branch of branches) {
      for (const constraint of branch) {
        if (this._constraints.has(constraint)) continue;
        this._constraints.set(constraint, this._constraints.size);
        const { condition, sourceArm, conditionalGroup, conditionalArm } = constraint;
        const current = sourceArm?.predicates?.[sourceArm.predicates.length - 1];
        if (condition && condition.kind !== "constant" && current && !current.negated) {
          this._sourceFacts.set(current.condition, condition);
        }
        if (conditionalGroup !== undefined && conditionalArm !== undefined) {
          let arms = this._groups.get(conditionalGroup);
          if (!arms) this._groups.set(conditionalGroup, (arms = new Map()));
          const previous = arms.get(conditionalArm);
          if (!previous || (!previous.sourceArm && sourceArm)) arms.set(conditionalArm, constraint);
        }
      }
    }

    const domains = new Map<string, { opaque: boolean; points: Set<number> }>();
    const register = (key: string, opaque: boolean) => {
      let domain = domains.get(key);
      if (!domain) domains.set(key, (domain = { opaque, points: new Set([INTEGER_MINIMUM, INTEGER_END]) }));
      return domain;
    };
    const collect = (condition: BranchCondition): void => {
      if (condition.kind === "constant") return;
      if (condition.kind === "expression" && !condition.opaque) {
        condition.operands.forEach(collect);
      } else if (condition.kind === "expression" || !isExactCondition(condition)) {
        register(opaqueConditionKey(condition), true);
      } else {
        const domain = register(macroKey(condition), false);
        if (condition.kind === "comparison") {
          domain.points.add(condition.value);
          domain.points.add(condition.value + 1);
        }
      }
    };
    for (const constraint of this._constraints.keys()) {
      if (constraint.condition) collect(constraint.condition);
      constraint.precedingConditions?.forEach(collect);
      for (const { condition } of constraint.sourceArm?.predicates ?? []) {
        const known = this._sourceFacts.get(condition);
        if (known) collect(known);
        else register(this._sourceKey(condition), true);
      }
      register(this._unknownConstraintKey(constraint), true);
    }
    for (const [group, arms] of this._groups) {
      const count = groupArmCount(arms);
      for (let arm = 0; arm < count; arm++) register(groupArmKey(group, arm), true);
    }
    for (const [key, domain] of domains) {
      const points = Array.from(domain.points).sort((left, right) => left - right);
      this._variableIds.set(key, this._variables.length);
      this._variables.push({
        opaque: domain.opaque,
        points,
        indices: new Map(points.map((point, index) => [point, index])),
        size: domain.opaque ? 2 : points.length
      });
    }
  }

  /**
   * Projects source branch constraints into one shared graph root.
   * @param signature - A branch registered when this diagram was constructed.
   * @param ignoreSelfGuarding - Omits canonical include guards for declaration/write coverage.
   * @returns The canonical condition node ID.
   */
  branch(signature: BranchSignature, ignoreSelfGuarding = false): number {
    const cache = this._branches[Number(ignoreSelfGuarding)];
    const cached = cache.get(signature);
    if (cached !== undefined) return cached;
    let root = ShaderConditionDiagram.TRUE;
    for (const constraint of signature) {
      if (ignoreSelfGuarding && constraint.selfGuarding) continue;
      root = this.and(root, this._constraint(constraint));
    }
    cache.set(signature, root);
    return root;
  }

  /**
   * Intersects two represented sets of macro configurations.
   * @param left - First condition node ID.
   * @param right - Second condition node ID.
   * @returns Their canonical conjunction.
   */
  and(left: number, right: number): number {
    return this._apply("and", left, right);
  }

  /**
   * Unions two represented sets of macro configurations.
   * @param left - First condition node ID.
   * @param right - Second condition node ID.
   * @returns Their canonical disjunction.
   */
  or(left: number, right: number): number {
    return this._apply("or", left, right);
  }

  /**
   * Unions alternatives without retaining every successively longer prefix of the result.
   * @param roots - Alternative condition node IDs.
   * @returns Their canonical disjunction, or FALSE for no alternatives.
   */
  orAll(roots: readonly number[]): number {
    const pending = roots.slice();
    while (pending.length > 1) {
      let count = 0;
      for (let index = 0; index < pending.length; index += 2) {
        pending[count++] = index + 1 < pending.length ? this.or(pending[index], pending[index + 1]) : pending[index];
      }
      pending.length = count;
    }
    return pending[0] ?? ShaderConditionDiagram.FALSE;
  }

  /**
   * Complements a represented set of macro configurations.
   * @param root - Condition node ID.
   * @returns Its canonical negation.
   */
  not(root: number): number {
    return this._transform(root, "not");
  }

  /**
   * Classifies existence of a configuration without guessing unresolved predicates.
   * @param root - Condition node ID.
   * @returns Proven reachability, proven absence, or dependence on unresolved predicates.
   */
  reachability(root: number): BranchReachability {
    return root === 0 ? "unreachable" : this._transform(root, "known") !== 0 ? "reachable" : "unknown";
  }

  /**
   * Classifies whether writes cover every configuration that reaches a reference.
   * @param writes - Union of all writing conditions.
   * @param reference - Condition under which coverage is required.
   * @returns Proven coverage, a concrete missing configuration, or unresolved coverage.
   */
  coverage(writes: number, reference = ShaderConditionDiagram.TRUE): BranchCoverage {
    const missing = this.and(reference, this.not(writes));
    return missing === 0 ? "covered" : this._transform(missing, "known") !== 0 ? "uncovered" : "unknown";
  }

  /**
   * Selects one known macro assignment that satisfies the condition for every unresolved predicate.
   * @param root - Condition for which a concrete witness is required.
   * @returns A cube fixing known macro variables, or FALSE when no definite witness exists.
   */
  knownWitness(root: number): number {
    let known = this._transform(root, "known");
    if (known === 0) return 0;
    const choices: [number, number][] = [];
    for (let variable = 0; variable < this._variables.length; variable++) {
      if (this._variables[variable].opaque) continue;
      const node = this._nodes[known];
      let choice = 0;
      if (node.variable === variable) {
        const edge = node.children.findIndex((child) => child !== 0);
        choice = edge ? node.ends[edge - 1] : 0;
        known = node.children[edge];
      }
      choices.push([variable, choice]);
    }
    let cube = 1;
    for (let index = choices.length - 1; index >= 0; index--) {
      const [variable, choice] = choices[index];
      const size = this._variables[variable].size;
      const ends: number[] = [],
        children: number[] = [];
      if (choice) {
        ends.push(choice);
        children.push(0);
      }
      ends.push(choice + 1);
      children.push(cube);
      if (choice + 1 < size) {
        ends.push(size);
        children.push(0);
      }
      cube = this._node(variable, ends, children);
    }
    return cube;
  }

  private _constraint(constraint: BranchConstraint): number {
    if (hasSourceFacts(constraint.sourceArm)) return this._sourceArm(constraint.sourceArm);
    const group = constraint.conditionalGroup;
    const arm = constraint.conditionalArm;
    if (group !== undefined && arm !== undefined) {
      let roots = this._groupRoots.get(group);
      if (!roots) this._groupRoots.set(group, (roots = this._group(group)));
      return roots.get(arm)!;
    }
    const conditions = constraint.precedingConditions ?? [];
    let root = constraint.condition
      ? this._condition(constraint.condition)
      : conditions.length
        ? 1
        : this._opaque(this._unknownConstraintKey(constraint));
    for (const condition of conditions) root = this.and(root, this._condition(condition));
    return root;
  }

  private _sourceArm(arm: SourceArm): number {
    if (arm.value !== undefined) return Number(arm.value);
    let root = 1;
    for (const term of arm.predicates ?? []) {
      let condition = this._sources.get(term.condition);
      if (condition === undefined) {
        const known = this._sourceFacts.get(term.condition);
        condition = known ? this._condition(known) : this._opaque(this._sourceKey(term.condition));
        this._sources.set(term.condition, condition);
      }
      root = this.and(root, term.negated ? this.not(condition) : condition);
    }
    return root;
  }

  private _group(group: number): ReadonlyMap<number, number> {
    const arms = this._groups.get(group)!;
    const count = groupArmCount(arms);
    const representative = arms.values().next().value as BranchConstraint;
    const roots = new Map<number, number>();
    let remaining = 1;
    for (let arm = 0; arm < count; arm++) {
      const constraint = arms.get(arm);
      if (representative.conditionalReachableArms?.[arm] === false) {
        roots.set(arm, 0);
        continue;
      }
      const last = representative.conditionalComplete && arm === count - 1;
      let condition = last
        ? 1
        : hasSourceFacts(constraint?.sourceArm)
          ? this._sourceArm(constraint.sourceArm)
          : constraint?.condition
            ? this._condition(constraint.condition)
            : this._opaque(groupArmKey(group, arm));
      for (const preceding of constraint?.precedingConditions ?? [])
        condition = this.and(condition, this._condition(preceding));
      roots.set(arm, this.and(remaining, condition));
      remaining = this.and(remaining, this.not(condition));
    }
    return roots;
  }

  private _condition(condition: BranchCondition): number {
    const cached = this._conditions.get(condition);
    if (cached !== undefined) return cached;
    let result: number;
    if (condition.kind === "constant") result = Number(condition.value);
    else if (condition.kind === "expression" && !condition.opaque) {
      const conjunction = condition.operator === "&&";
      result = Number(conjunction);
      for (const operand of condition.operands)
        result = this._apply(conjunction ? "and" : "or", result, this._condition(operand));
      if (condition.negated) result = this.not(result);
    } else if (condition.kind === "expression" || !isExactCondition(condition)) {
      result = this._opaque(opaqueConditionKey(condition));
      if (condition.kind === "expression" && condition.negated) result = this.not(result);
    } else {
      const variable = this._variableIds.get(macroKey(condition))!;
      const domain = this._variables[variable];
      let ranges: [number, number][];
      if (condition.kind === "defined") ranges = condition.defined ? [[1, domain.size]] : [[0, 1]];
      else {
        const start = domain.indices.get(condition.value)! + 1;
        const end = domain.indices.get(condition.value + 1)! + 1;
        switch (condition.operator) {
          case "==":
            ranges = [[start, end]];
            break;
          case "!=":
            ranges = [
              [1, start],
              [end, domain.size]
            ];
            break;
          case "<":
            ranges = [[1, start]];
            break;
          case "<=":
            ranges = [[1, end]];
            break;
          case ">":
            ranges = [[end, domain.size]];
            break;
          case ">=":
            ranges = [[start, domain.size]];
            break;
        }
        if (compareZero(condition.operator, condition.value)) ranges.push([0, 1]);
      }
      result = this._ranges(variable, ranges);
    }
    this._conditions.set(condition, result);
    return result;
  }

  private _sourceKey(condition: SourceCondition): string {
    let key = this._sourceKeys.get(condition);
    if (key === undefined) {
      key =
        condition.kind === "opaque"
          ? `source-opaque:${condition.identity}`
          : `source-expression:${JSON.stringify([condition.expression, condition.versions])}`;
      this._sourceKeys.set(condition, key);
    }
    return key;
  }

  private _unknownConstraintKey(constraint: BranchConstraint): string {
    return `constraint:${this._constraints.get(constraint)}`;
  }
  private _opaque(key: string): number {
    return this._ranges(this._variableIds.get(key)!, [[1, 2]]);
  }

  private _ranges(variable: number, ranges: readonly (readonly [number, number])[]): number {
    const size = this._variables[variable].size;
    const boundaries = Array.from(new Set([0, size, ...ranges.flat()])).sort((left, right) => left - right);
    const ends: number[] = [],
      children: number[] = [];
    for (let index = 0; index < boundaries.length - 1; index++) {
      const start = boundaries[index];
      ends.push(boundaries[index + 1]);
      children.push(Number(ranges.some(([left, right]) => left <= start && start < right)));
    }
    return this._node(variable, ends, children);
  }

  private _node(variable: number, ends: readonly number[], children: readonly number[]): number {
    const compactEnds: number[] = [],
      compactChildren: number[] = [];
    for (let index = 0; index < children.length; index++) {
      if (compactChildren[compactChildren.length - 1] === children[index])
        compactEnds[compactEnds.length - 1] = ends[index];
      else {
        compactEnds.push(ends[index]);
        compactChildren.push(children[index]);
      }
    }
    if (compactChildren.length === 1) return compactChildren[0];
    const key = `${variable}|${compactEnds.join(",")}|${compactChildren.join(",")}`;
    let result = this._unique.get(key);
    if (result === undefined) {
      result = this._nodes.length;
      this._nodes.push({ variable, ends: compactEnds, children: compactChildren });
      this._unique.set(key, result);
    }
    return result;
  }

  private _apply(operator: Operator, left: number, right: number): number {
    const cached = this._operationResult(operator, left, right);
    if (cached !== undefined) return cached;
    const pending: [number, number][] = [[left, right]];
    while (pending.length) {
      const [left, right] = pending[pending.length - 1];
      if (this._operationResult(operator, left, right) !== undefined) {
        pending.pop();
        continue;
      }
      const a = this._nodes[left],
        b = this._nodes[right];
      const variable = Math.min(a.variable, b.variable),
        size = this._variables[variable].size;
      const aEnds = a.variable === variable ? a.ends : [size],
        aChildren = a.variable === variable ? a.children : [left];
      const bEnds = b.variable === variable ? b.ends : [size],
        bChildren = b.variable === variable ? b.children : [right];
      const ends: number[] = [],
        children: number[] = [];
      let ready = true,
        i = 0,
        j = 0;
      while (i < aEnds.length && j < bEnds.length) {
        const end = Math.min(aEnds[i], bEnds[j]);
        const child = this._operationResult(operator, aChildren[i], bChildren[j]);
        if (child === undefined) {
          pending.push([aChildren[i], bChildren[j]]);
          ready = false;
        }
        ends.push(end);
        children.push(child!);
        if (aEnds[i] === end) i++;
        if (bEnds[j] === end) j++;
      }
      if (!ready) continue;
      this._operations.set(operationKey(operator, left, right), this._node(variable, ends, children));
      pending.pop();
    }
    return this._operationResult(operator, left, right)!;
  }

  private _operationResult(operator: Operator, left: number, right: number): number | undefined {
    if (left === right) return left;
    if (operator === "and") {
      if (!left || !right) return 0;
      if (left === 1) return right;
      if (right === 1) return left;
    } else {
      if (left === 1 || right === 1) return 1;
      if (!left) return right;
      if (!right) return left;
    }
    return this._operations.get(operationKey(operator, left, right));
  }

  private _transform(root: number, mode: "not" | "known"): number {
    const cache = mode === "not" ? this._negations : this._knownConditions;
    const cached = cache.get(root);
    if (cached !== undefined) return cached;
    const pending = [root];
    while (pending.length) {
      const current = pending[pending.length - 1];
      if (cache.has(current)) {
        pending.pop();
        continue;
      }
      const node = this._nodes[current];
      let ready = true;
      for (const child of node.children) {
        if (cache.has(child)) continue;
        pending.push(child);
        ready = false;
      }
      if (!ready) continue;
      const children = node.children.map((child) => cache.get(child)!);
      const result =
        mode === "known" && this._variables[node.variable].opaque
          ? children.reduce((left, right) => this.and(left, right), 1)
          : this._node(node.variable, node.ends, children);
      cache.set(current, result);
      if (mode === "not") cache.set(result, current);
      pending.pop();
    }
    return cache.get(root)!;
  }
}

function operationKey(operator: Operator, left: number, right: number): string {
  return left < right ? `${operator}:${left}:${right}` : `${operator}:${right}:${left}`;
}
function macroKey(condition: Extract<BranchCondition, { kind: "defined" | "comparison" }>): string {
  return `macro:${condition.name}:${condition.version}`;
}
function hasSourceFacts(arm: SourceArm | undefined): arm is SourceArm {
  return arm !== undefined && (arm.value !== undefined || arm.predicates !== undefined);
}
function groupArmKey(group: number, arm: number): string {
  return `group:${group}:${arm}`;
}
function groupArmCount(arms: ReadonlyMap<number, BranchConstraint>): number {
  let count = 0;
  for (const [arm, constraint] of arms) count = Math.max(count, arm + 1, constraint.conditionalArmCount ?? 0);
  return count;
}
function isExactCondition(condition: Extract<BranchCondition, { kind: "defined" | "comparison" }>): boolean {
  return (
    condition.kind === "defined" ||
    (Number.isInteger(condition.value) && condition.value >= INTEGER_MINIMUM && condition.value < INTEGER_END)
  );
}
function opaqueConditionKey(condition: Exclude<BranchCondition, { kind: "constant" }>): string {
  return condition.kind === "expression"
    ? `expression:${JSON.stringify([condition.expression, condition.names, condition.versions])}`
    : `invalid:${condition.name}:${condition.version}:${condition.kind === "comparison" ? `${condition.operator}:${condition.value}` : condition.defined}`;
}
function compareZero(operator: Extract<BranchCondition, { kind: "comparison" }>["operator"], value: number): boolean {
  switch (operator) {
    case "==":
      return value === 0;
    case "!=":
      return value !== 0;
    case "<":
      return value > 0;
    case "<=":
      return value >= 0;
    case ">":
      return value < 0;
    case ">=":
      return value <= 0;
  }
}
