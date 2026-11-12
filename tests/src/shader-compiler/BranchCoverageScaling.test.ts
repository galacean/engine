import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import {
  getBranchCoverage,
  type BranchConstraint,
  type BranchSignature
} from "@galacean/engine-shader-parser/internal/analyzer";
import { describe, expect, it } from "vitest";

function arm(group: number, index: number, version = 0): BranchConstraint {
  return {
    name: `FEATURE_${group}`,
    defined: index === 0,
    condition: { kind: "defined", name: `FEATURE_${group}`, defined: index === 0, version },
    conditionalGroup: group,
    conditionalArm: index,
    conditionalArmCount: 2,
    conditionalComplete: true
  };
}

function countGroupReads(constraints: readonly BranchConstraint[], limit: number): () => number {
  let reads = 0;
  for (const constraint of constraints) {
    const group = constraint.conditionalGroup;
    Object.defineProperty(constraint, "conditionalGroup", {
      get() {
        if (++reads > limit) throw new Error("Branch coverage repeated equivalent group states.");
        return group;
      }
    });
  }
  return () => reads;
}

describe("branch coverage scaling", () => {
  it("rejects a missing arm without exploring nested group permutations", () => {
    const branch = Array.from({ length: 32 }, (_, group) => arm(group, 0));
    // Bound work rather than elapsed time, including on slower CI machines.
    const reads = countGroupReads(branch, 20000);
    expect(getBranchCoverage([branch], [])).toBe("uncovered");
    expect(reads()).toBeLessThan(20000);
  });

  it("reuses repeated subset proofs when correlated groups cannot use an independent split", () => {
    const groups = Array.from({ length: 8 }, (_, group) => [arm(group, 0), arm(group, 1)]);
    for (const constraint of groups[1]) {
      constraint.name = groups[0][0].name;
      constraint.condition = { kind: "defined", name: constraint.name, defined: constraint.defined, version: 0 };
    }
    const reads = countGroupReads(groups.flat(), 200000);
    const candidates = groups.map((_, selected) => groups.map((arms, index) => arms[Number(index === selected)]));
    expect(getBranchCoverage(candidates, [])).toBe("uncovered");
    expect(reads()).toBeLessThan(200000);
  });

  it("uses one shared split for independent Boolean partitions with incomplete coverage", () => {
    const groups = Array.from({ length: 16 }, (_, group) => [arm(group, 0), arm(group, 1)]);
    const reads = countGroupReads(groups.flat(), 100000);
    const candidates = groups.map((_, selected) => groups.map((arms, index) => arms[Number(index === selected)]));
    expect(getBranchCoverage(candidates, [])).toBe("uncovered");
    expect(reads()).toBeLessThan(100000);
  });

  it.each([
    ["==", "!=", 0],
    [">", "<=", 3]
  ] as const)("uses one shared split for independent %s / %s predicates", (first, second, value) => {
    const groups = Array.from({ length: 16 }, (_, group) => [arm(group, 0), arm(group, 1)]);
    for (const constraint of groups.flat()) {
      constraint.condition = {
        kind: "comparison",
        name: constraint.name,
        operator: constraint.defined ? first : second,
        value,
        version: 0
      };
    }
    const reads = countGroupReads(groups.flat(), 100000);
    const candidates = groups.map((_, selected) => groups.map((arms, index) => arms[Number(index === selected)]));
    expect(getBranchCoverage(candidates, [])).toBe("uncovered");
    expect(reads()).toBeLessThan(100000);
  });

  it("retains complete product coverage and exact call-site arms", () => {
    const groups = Array.from({ length: 4 }, (_, group) => [arm(group, 0), arm(group, 1)]);
    const candidates = Array.from({ length: 16 }, (_, bits) => groups.map((arms, index) => arms[(bits >>> index) & 1]));
    expect(getBranchCoverage(candidates, [])).toBe("covered");
    expect(getBranchCoverage(candidates.slice(1), candidates[0])).toBe("uncovered");
    expect(getBranchCoverage(candidates.slice(1), candidates[1])).toBe("covered");
    expect(getBranchCoverage(candidates.slice(1).reverse(), [])).toBe("unknown");
  });

  it("retains unknown coverage for opaque conditions", () => {
    const opaque: BranchSignature = [{ name: "OPAQUE", defined: true }];
    expect(getBranchCoverage([opaque], [])).toBe("unknown");
    expect(getBranchCoverage([], [])).toBe("unknown");
  });

  it("keeps macro versions independent", () => {
    const first = arm(0, 0, 0);
    const later = arm(1, 1, 1);
    later.name = first.name;
    later.condition = { kind: "defined", name: first.name, defined: false, version: 1 };
    expect(getBranchCoverage([[first], [later]], [])).toBe("uncovered");
    later.condition = { ...later.condition, version: 0 };
    expect(getBranchCoverage([[first], [later]], [])).toBe("covered");
  });

  it("retains self-guard removal and unreachable-arm coverage", () => {
    const guarded = arm(0, 0);
    guarded.selfGuarding = true;
    expect(getBranchCoverage([[guarded]], [])).toBe("covered");
    const reachable = arm(1, 0);
    reachable.conditionalReachableArms = [true, false];
    expect(getBranchCoverage([[reachable]], [])).toBe("covered");
    reachable.conditionalReachableArms = [true, true];
    expect(getBranchCoverage([[reachable]], [])).toBe("uncovered");
  });

  it("preserves the diagnostic for a deeply nested declaration", () => {
    const depth = 10;
    const source = `Shader "nested" { SubShader "s" { Pass "p" {
${Array.from({ length: depth }, (_, index) => `#ifdef FEATURE_${index}`).join("\n")}
float value;
${Array.from({ length: depth }, (_, index) => `#else\nfloat unused${index};\n#endif`).join("\n")}
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(value); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    const { diagnostics } = ShaderAnalyzer.analyze(source);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["UseBeforeDeclaration"]);
    expect(diagnostics[0].message).toContain("'value' is unavailable");
    expect(source.slice(diagnostics[0].range.start.offset, diagnostics[0].range.end.offset)).toBe("value");
  });
});
