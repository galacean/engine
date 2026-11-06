import type {
  BranchCondition,
  BranchConstraint,
  BranchSignature
} from "@galacean/engine-shader-parser/internal/analyzer";
import { describe, expect, it } from "vitest";
import { ShaderConditionDiagram } from "../../../packages/shader-analyzer/src/ShaderConditionDiagram";

function branch(condition?: BranchCondition): BranchSignature {
  return [{ name: "condition", defined: true, condition }];
}

function defined(name = "A", version = 0): BranchCondition {
  return { kind: "defined", name, version, defined: true };
}

function comparison(
  operator: Extract<BranchCondition, { kind: "comparison" }>["operator"],
  value: number,
  name = "MODE",
  version = 0
): BranchCondition {
  return { kind: "comparison", name, version, operator, value };
}

function opaque(expression = "UNKNOWN(1)", version = 0): BranchCondition {
  return {
    kind: "expression",
    expression,
    names: ["UNKNOWN"],
    versions: [version],
    operator: "&&",
    operands: [],
    negated: false,
    opaque: true
  };
}

describe("symbolic shader conditions", () => {
  it("keeps undefined distinct from defined zero while evaluating both numerically as zero", () => {
    const zero = branch(comparison("==", 0));
    const nonzero = branch(comparison("!=", 0));
    const present = branch(defined("MODE"));
    const diagram = new ShaderConditionDiagram([zero, nonzero, present]);
    const z = diagram.branch(zero),
      p = diagram.branch(present);
    expect(diagram.reachability(diagram.and(z, diagram.not(p)))).toBe("reachable");
    expect(diagram.reachability(diagram.and(z, p))).toBe("reachable");
    expect(diagram.reachability(diagram.and(diagram.branch(nonzero), diagram.not(p)))).toBe("unreachable");
    expect(diagram.or(z, diagram.branch(nonzero))).toBe(ShaderConditionDiagram.TRUE);
  });

  it.each([-0x80000000, -1, 0, 1, 0x7fffffff])("partitions exact comparisons at %i without rounding", (value) => {
    const branches = ["==", "!=", "<", "<=", ">", ">="].map((operator) =>
      branch(comparison(operator as Extract<BranchCondition, { kind: "comparison" }>["operator"], value))
    );
    const diagram = new ShaderConditionDiagram(branches);
    const [equal, unequal, less, atMost, greater, atLeast] = branches.map((value) => diagram.branch(value));
    expect(diagram.or(equal, unequal)).toBe(ShaderConditionDiagram.TRUE);
    expect(diagram.and(equal, unequal)).toBe(ShaderConditionDiagram.FALSE);
    expect(diagram.or(less, atLeast)).toBe(ShaderConditionDiagram.TRUE);
    expect(diagram.or(atMost, greater)).toBe(ShaderConditionDiagram.TRUE);
    expect(diagram.or(less, equal)).toBe(atMost);
    expect(diagram.or(greater, equal)).toBe(atLeast);
  });

  it("does not coerce unsupported numeric bounds or merge macro mutation versions", () => {
    const before = branch(defined("A", 0));
    const after = branch(defined("A", 1));
    const invalid = [-0x80000001, 0x80000000, 0.5, NaN].map((value) => branch(comparison("==", value)));
    const diagram = new ShaderConditionDiagram([before, after, ...invalid]);
    expect(diagram.reachability(diagram.and(diagram.branch(before), diagram.not(diagram.branch(after))))).toBe(
      "reachable"
    );
    for (const value of invalid) expect(diagram.reachability(diagram.branch(value))).toBe("unknown");
  });

  it("quantifies unresolved predicates after selecting one consistent known macro assignment", () => {
    const known = branch(defined());
    const unknown = branch(opaque());
    const later = branch(opaque("UNKNOWN(1)", 1));
    const diagram = new ShaderConditionDiagram([known, unknown, later]);
    const a = diagram.branch(known),
      q = diagram.branch(unknown);
    const matched = diagram.or(diagram.and(a, q), diagram.and(diagram.not(a), diagram.not(q)));
    expect(diagram.reachability(matched)).toBe("unknown");
    expect(diagram.knownWitness(matched)).toBe(ShaderConditionDiagram.FALSE);
    expect(diagram.reachability(diagram.or(a, q))).toBe("reachable");
    expect(diagram.or(q, diagram.not(q))).toBe(ShaderConditionDiagram.TRUE);
    expect(diagram.reachability(diagram.or(q, diagram.not(diagram.branch(later))))).toBe("unknown");
    expect(diagram.coverage(q)).toBe("unknown");
    expect(diagram.coverage(q, q)).toBe("covered");
  });

  it("retains unknown predecessors when a later source arm has a recognized numeric condition", () => {
    const unknown = { kind: "opaque", identity: "UNKNOWN(1):0" } as const;
    const numeric = { kind: "opaque", identity: "MODE > 3:0" } as const;
    const first: BranchSignature = [
      { name: "first", defined: true, sourceArm: { predicates: [{ condition: unknown, negated: false }] } }
    ];
    const second: BranchSignature = [
      {
        name: "second",
        defined: true,
        condition: comparison(">", 3),
        sourceArm: {
          predicates: [
            { condition: unknown, negated: true },
            { condition: numeric, negated: false }
          ]
        }
      }
    ];
    const last: BranchSignature = [
      {
        name: "last",
        defined: true,
        sourceArm: {
          predicates: [
            { condition: unknown, negated: true },
            { condition: numeric, negated: true }
          ]
        }
      }
    ];
    const atMost = branch(comparison("<=", 3));
    // Register the source's use before the arm that supplies its recognized meaning.
    const diagram = new ShaderConditionDiagram([last, first, second, atMost]);
    const f = diagram.branch(first),
      s = diagram.branch(second),
      l = diagram.branch(last);
    expect(diagram.reachability(s)).toBe("unknown");
    expect(diagram.and(s, diagram.branch(atMost))).toBe(ShaderConditionDiagram.FALSE);
    expect(diagram.or(f, diagram.or(s, l))).toBe(ShaderConditionDiagram.TRUE);
    expect(diagram.coverage(diagram.or(f, s))).toBe("unknown");
  });

  it("keeps unrepresented source conditions unknown while preserving complete lexical arms", () => {
    const arms: BranchSignature[] = [0, 1].map((arm) => [
      {
        name: "UNKNOWN",
        defined: true,
        sourceArm: {},
        conditionalGroup: 1,
        conditionalArm: arm,
        conditionalArmCount: 2,
        conditionalComplete: true
      }
    ]);
    const diagram = new ShaderConditionDiagram(arms);
    const [a, b] = arms.map((value) => diagram.branch(value));
    expect(diagram.reachability(a)).toBe("unknown");
    expect(diagram.reachability(b)).toBe("unknown");
    expect(diagram.and(a, b)).toBe(ShaderConditionDiagram.FALSE);
    expect(diagram.or(a, b)).toBe(ShaderConditionDiagram.TRUE);
  });

  it("retains known source truth and projects individual self guards only for coverage", () => {
    const guard: BranchConstraint = { name: "GUARD", defined: false, condition: defined("GUARD"), selfGuarding: true };
    const parent: BranchConstraint = { name: "PARENT", defined: true, condition: defined("PARENT") };
    const guarded = [parent, guard];
    const dead = [{ name: "dead", defined: true, sourceArm: { value: false } }];
    const diagram = new ShaderConditionDiagram([guarded, [parent], dead]);
    expect(diagram.coverage(diagram.branch(guarded), diagram.branch([parent]))).toBe("uncovered");
    expect(diagram.branch(guarded, true)).toBe(diagram.branch([parent]));
    expect(diagram.branch(dead)).toBe(ShaderConditionDiagram.FALSE);
  });

  it("selects witnesses for known variables omitted by a simplified condition", () => {
    const a = branch(defined("A")),
      b = branch(defined("B")),
      q = branch(opaque());
    const diagram = new ShaderConditionDiagram([a, b, q]);
    const witness = diagram.knownWitness(ShaderConditionDiagram.TRUE);
    expect(diagram.reachability(witness)).toBe("reachable");
    expect(diagram.coverage(diagram.not(diagram.branch(a)), witness)).toBe("covered");
    expect(diagram.coverage(diagram.not(diagram.branch(b)), witness)).toBe("covered");
    expect(diagram.coverage(diagram.branch(q), witness)).toBe("unknown");
    const reachable = diagram.or(diagram.branch(a), diagram.branch(q));
    expect(diagram.coverage(reachable, diagram.knownWitness(reachable))).toBe("covered");
  });

  it.each([257, 1024])("unions %i numeric alternatives without losing the last configuration", (count) => {
    const alternatives = Array.from({ length: count }, (_, index) => branch(comparison("==", index)));
    const first = branch(comparison(">=", 0)),
      end = branch(comparison("<", count));
    const diagram = new ShaderConditionDiagram([...alternatives, first, end]);
    let reached = ShaderConditionDiagram.FALSE;
    for (const alternative of alternatives) reached = diagram.or(reached, diagram.branch(alternative));
    expect(diagram.coverage(reached, diagram.branch(alternatives[count - 1]))).toBe("covered");
    expect(diagram.coverage(reached, diagram.and(diagram.branch(first), diagram.branch(end)))).toBe("covered");
    expect(diagram.coverage(reached)).toBe("uncovered");
  });

  it("collapses 256 complementary diamonds without enumerating their path product", () => {
    const choices = Array.from({ length: 256 }, (_, index) => branch(defined(`FEATURE_${index}`)));
    const diagram = new ShaderConditionDiagram(choices);
    let reached = ShaderConditionDiagram.TRUE;
    for (const choice of choices) {
      const condition = diagram.branch(choice);
      reached = diagram.or(diagram.and(reached, condition), diagram.and(reached, diagram.not(condition)));
    }
    expect(reached).toBe(ShaderConditionDiagram.TRUE);
  });

  it("unions independent alternatives in balanced batches", () => {
    const alternatives = Array.from({ length: 1024 }, (_, index) => branch(defined(`FEATURE_${index}`)));
    const diagram = new ShaderConditionDiagram(alternatives);
    const roots = alternatives.map((value) => diagram.branch(value));
    const any = diagram.orAll(roots);
    expect(diagram.orAll([])).toBe(ShaderConditionDiagram.FALSE);
    expect(diagram.orAll([any])).toBe(any);
    expect(diagram.orAll(roots.slice().reverse())).toBe(any);
    expect(diagram.coverage(any, roots[roots.length - 1])).toBe("covered");
    expect(diagram.coverage(any)).toBe("uncovered");
    expect(diagram.orAll([any, ShaderConditionDiagram.TRUE, ShaderConditionDiagram.FALSE])).toBe(
      ShaderConditionDiagram.TRUE
    );
  });

  it("traverses deep condition graphs without consuming the JavaScript call stack", () => {
    const alternatives = Array.from({ length: 8192 }, (_, index) => branch(defined(`FEATURE_${index}`)));
    const diagram = new ShaderConditionDiagram(alternatives);
    const roots = alternatives.map((value) => diagram.branch(value));
    const any = diagram.orAll(roots),
      last = roots[roots.length - 1];
    expect(diagram.reachability(any)).toBe("reachable");
    expect(diagram.reachability(diagram.not(any))).toBe("reachable");
    expect(diagram.and(any, last)).toBe(last);
    expect(diagram.or(any, diagram.not(last))).toBe(ShaderConditionDiagram.TRUE);
    expect(diagram.coverage(any, diagram.knownWitness(any))).toBe("covered");
  });
});
