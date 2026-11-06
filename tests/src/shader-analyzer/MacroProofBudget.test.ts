import { DiagnosticType, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import {
  canBranchesOverlap,
  getBranchReachability,
  getDeclarationCoexistence,
  isBranchReachable,
  type BranchCondition,
  type BranchSignature
} from "@galacean/engine-shader-parser/internal/analyzer";
import { describe, expect, it } from "vitest";

function comparison(value: number): BranchCondition {
  return { kind: "comparison", name: "MODE", version: 0, operator: "==", value };
}

function branch(condition: BranchCondition): BranchSignature {
  return [{ name: "MODE", defined: true, condition }];
}

function values(count: number, reverse = false): number[] {
  const result = Array.from({ length: count }, (_, index) => index);
  return reverse ? result.reverse() : result;
}

function expression(count: number, reverse = false): string {
  return values(count, reverse)
    .map((value) => `MODE == ${value}`)
    .join(" || ");
}

function alternatives(count: number): BranchSignature {
  return branch({
    kind: "expression",
    expression: expression(count),
    names: ["MODE"],
    versions: [0],
    operator: "||",
    operands: values(count).map(comparison),
    negated: false
  });
}

function shader(declarations: string, vertex = "gl_Position = vec4(0.0);"): string {
  return `Shader "macro-proof-budget" { SubShader "s" { Pass "p" {
${declarations}
void vert() {
${vertex}
}
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function duplicateDeclarations(count: number, reverse = false, selected = count - 1): string {
  return shader(`#if ${expression(count, reverse)}
float value;
#endif
#if MODE == ${selected}
float value;
#endif`);
}

describe("parser macro proof budget", () => {
  it.each([1, 255])("proves the final alternative and excludes an absent value in %i flat predicates", (count) => {
    const choices = alternatives(count);
    const present = branch(comparison(count - 1));
    const absent = branch(comparison(-1));
    expect(getBranchReachability([...choices, ...present])).toBe("reachable");
    expect(getDeclarationCoexistence(choices, present)).toBe("coexist");
    expect(getBranchReachability([...choices, ...absent])).toBe("unreachable");
    expect(getDeclarationCoexistence(choices, absent)).toBe("exclusive");
  });

  it.each([256, 257, 512, 1024])("does not turn an incomplete %i-predicate proof into a false verdict", (count) => {
    const choices = alternatives(count);
    const present = branch(comparison(count - 1));
    const absent = branch(comparison(-1));
    // A future complete solver may refine unknown; neither incorrect definite verdict is allowed.
    expect(getBranchReachability([...choices, ...present])).not.toBe("unreachable");
    expect(getDeclarationCoexistence(choices, present)).not.toBe("exclusive");
    expect(isBranchReachable([...choices, ...present])).toBe(true);
    expect(canBranchesOverlap(choices, present)).toBe(true);
    expect(getBranchReachability([...choices, ...absent])).not.toBe("reachable");
    expect(getDeclarationCoexistence(choices, absent)).not.toBe("coexist");
  });

  it("keeps a previous exhausted proof from affecting a later independent proof", () => {
    getBranchReachability([...alternatives(1024), ...branch(comparison(1023))]);
    expect(getBranchReachability(branch(comparison(3)))).toBe("reachable");
    expect(getBranchReachability([...branch(comparison(3)), ...branch(comparison(4))])).toBe("unreachable");
  });

  it.each([129, 257, 512])("retains the final stage-error witness after a %i-term parser condition", (count) => {
    const source = shader(
      `void leaf() {
#if MODE == ${count - 1}
discard;
#endif
}`,
      `#if ${expression(count)}
leaf();
#endif
gl_Position = vec4(0.0);`
    );
    const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([DiagnosticType.MisplacedControlFlow]);
    expect(source.slice(diagnostics[0].range.start.offset, diagnostics[0].range.end.offset)).toBe("discard;");
  });

  it("reports a local witness below the source-expression boundary in either order", () => {
    for (const reverse of [false, true]) {
      expect(
        ShaderAnalyzer.analyze(duplicateDeclarations(128, reverse)).diagnostics.map((diagnostic) => diagnostic.code)
      ).toEqual([DiagnosticType.Redefinition]);
    }
  });

  it("reports an early witness in a larger source expression", () => {
    expect(
      ShaderAnalyzer.analyze(duplicateDeclarations(256, true)).diagnostics.map((diagnostic) => diagnostic.code)
    ).toEqual([DiagnosticType.Redefinition]);
  });

  it("does not report mutually exclusive declarations after a large proof", () => {
    expect(ShaderAnalyzer.analyze(duplicateDeclarations(257, false, -1)).diagnostics).toEqual([]);
  });

  // These assertions state the required behavior. The parser's remaining proof budget still hides it.
  it.fails.each([129, 257])("known limitation: reports the final redefinition witness in %i source terms", (count) => {
    const source = duplicateDeclarations(count);
    const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([DiagnosticType.Redefinition]);
    expect(source.slice(diagnostics[0].range.start.offset, diagnostics[0].range.end.offset)).toBe("value");
  });
});
