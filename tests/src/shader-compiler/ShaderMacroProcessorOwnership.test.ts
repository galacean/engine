import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderPreprocessorDirective as Op } from "@galacean/engine-core/src/shader/enums/ShaderPreprocessorDirective";
import type { Condition, ShaderInstruction } from "@galacean/engine-design";
import { describe, expect, it } from "vitest";

function evaluate(instructions: ShaderInstruction[], macros: Record<string, string> = {}): string {
  return ShaderMacroProcessor.evaluate(instructions, new Map(Object.entries(macros)));
}

const divideByZero: Condition = { t: "binary", op: "/", l: { t: "num", v: 1 }, r: { t: "num", v: 0 } };
const excessiveMacros = Array.from(
  { length: 300 },
  (_, index): ShaderInstruction => [Op.DefineVal, `CHAIN_${index}`, `CHAIN_${index + 1}`]
);

describe("runtime declaration ownership", () => {
  it("preserves serialized legacy opcodes alongside the appended ownership instructions", () => {
    const instructions: ShaderInstruction[] = [
      [0, "before VALUE\n"],
      [8, "VALUE", "2"],
      [0, "after VALUE\n"],
      [7, "FLAG"],
      [1, "FLAG", 7],
      [0, "present\n"],
      [6],
      [10, "FLAG"],
      [2, "FLAG", 11],
      [0, "missing\n"],
      [6],
      [11, 0, 0, 0],
      [12, "owned VALUE\n", 0]
    ];
    expect(evaluate(JSON.parse(JSON.stringify(instructions)), { VALUE: "1" })).toBe(
      "before 1\nafter 2\npresent\nmissing\nowned 2\n"
    );
  });

  it("keeps the highest active scope independently for each group, regardless of activation order", () => {
    expect(
      evaluate([
        [Op.Declaration, 30, 0, 2],
        [Op.OwnedText, "pass\n", 30],
        [Op.Declaration, 10, 0, 0],
        [Op.OwnedText, "shader\n", 10],
        [Op.Declaration, 20, 0, 1],
        [Op.OwnedText, "subshader\n", 20],
        [Op.Declaration, 40, 1, 0],
        [Op.OwnedText, "independent\n", 40],
        [Op.Text, "ordinary\n"]
      ])
    ).toBe("pass\nindependent\nordinary\n");
  });

  it("retains every active owner at the winning scope and all of each owner's text chunks", () => {
    expect(
      evaluate([
        [Op.Declaration, 1, 0, 0],
        [Op.OwnedText, "ancestor\n", 1],
        [Op.Declaration, 2, 0, 1],
        [Op.OwnedText, "first-start\n", 2],
        [Op.Declaration, 3, 0, 1],
        [Op.OwnedText, "second\n", 3],
        [Op.OwnedText, "first-end\n", 2]
      ])
    ).toBe("first-start\nsecond\nfirst-end\n");
  });

  it("expands text at its original macro state even when its owner activates later", () => {
    expect(
      evaluate([
        [Op.DefineVal, "VALUE", "early"],
        [Op.OwnedText, "VALUE\n", 1],
        [Op.Undef, "VALUE"],
        [Op.DefineVal, "VALUE", "late"],
        [Op.Declaration, 1, 0, 1],
        [Op.OwnedText, "VALUE\n", 1]
      ])
    ).toBe("early\nlate\n");
  });

  it("executes definitions and undefinitions between discarded and retained declaration bodies", () => {
    expect(
      evaluate([
        [Op.Declaration, 1, 0, 0],
        [Op.DefineVal, "VALUE", "1"],
        [Op.OwnedText, "discard VALUE\n", 1],
        [Op.DefineFunc, "TWICE", ["x"], "(x+x)"],
        [Op.Declaration, 2, 0, 1],
        [Op.OwnedText, "TWICE(VALUE)\n", 2],
        [Op.Undef, "VALUE"],
        [Op.DefineVal, "VALUE", "2"],
        [Op.OwnedText, "TWICE(VALUE)\n", 2],
        [Op.Undef, "TWICE"],
        [Op.OwnedText, "TWICE(VALUE)\n", 2]
      ])
    ).toBe("(1+1)\n(2+2)\nTWICE(2)\n");
  });

  it("only activates owners reached through the current macro branch and resets between variants", () => {
    const instructions: ShaderInstruction[] = [
      [Op.Declaration, 1, 0, 0],
      [Op.OwnedText, "fallback\n", 1],
      [Op.OwnedText, "override\n", 2],
      [Op.IfDef, "ACTIVE", 5],
      [Op.Declaration, 2, 0, 1],
      [Op.Endif]
    ];
    const snapshot = JSON.stringify(instructions);
    expect(evaluate(instructions, { ACTIVE: "0" })).toBe("override\n");
    expect(evaluate(instructions)).toBe("fallback\n");
    expect(evaluate(instructions, { ACTIVE: "0" })).toBe("override\n");
    expect(JSON.stringify(instructions)).toBe(snapshot);
  });

  it("drops text and expansion failures from owners that never activate", () => {
    expect(
      evaluate([...excessiveMacros, [Op.OwnedText, "CHAIN_0", 1], [Op.OwnedText, "unowned", 2], [Op.Text, "ordinary"]])
    ).toBe("ordinary");
  });

  it("keeps activation decisions made before a later macro undefinition", () => {
    expect(
      evaluate([
        [Op.Define, "ACTIVE"],
        [Op.IfDef, "ACTIVE", 4],
        [Op.Declaration, 1, 0, 1],
        [Op.Endif],
        [Op.Undef, "ACTIVE"],
        [Op.IfDef, "ACTIVE", 8],
        [Op.Declaration, 2, 0, 2],
        [Op.Endif],
        [Op.OwnedText, "first", 1],
        [Op.OwnedText, "second", 2]
      ])
    ).toBe("first");
  });

  it.each(["1", "2"])("selects comparison/else owners using MODE=%s before later macro mutations", (mode) => {
    const instructions: ShaderInstruction[] = [
      [Op.IfCmp, "MODE", ">=", 2, 4],
      [Op.Declaration, 1, 0, 1],
      [Op.OwnedText, "first VALUE\n", 1],
      [Op.Else, 7],
      [Op.Declaration, 2, 0, 1],
      [Op.OwnedText, "second VALUE\n", 2],
      [Op.Endif],
      [Op.DefineVal, "MODE", "99"],
      [Op.DefineVal, "VALUE", "late"],
      [Op.OwnedText, "tail VALUE\n", 1],
      [Op.OwnedText, "tail VALUE\n", 2]
    ];
    expect(evaluate(instructions, { MODE: mode, VALUE: "early" })).toBe(
      `${mode === "2" ? "first" : "second"} early\ntail late\n`
    );
  });

  it("suppresses expansion failures from an overridden body but throws when that body wins", () => {
    const ancestor: ShaderInstruction[] = [...excessiveMacros, [Op.OwnedText, "CHAIN_0", 1], [Op.Declaration, 1, 0, 0]];
    expect(evaluate([...ancestor, [Op.Declaration, 2, 0, 1], [Op.OwnedText, "replacement", 2]])).toBe("replacement");
    expect(() => evaluate(ancestor)).toThrow(/nested replacements/i);
    expect(() => evaluate([...excessiveMacros, [Op.Text, "CHAIN_0"]])).toThrow(/nested replacements/i);
  });

  it("propagates active conditional errors even after a higher scope has won", () => {
    expect(() =>
      evaluate([
        [Op.Declaration, 2, 0, 2],
        [Op.OwnedText, "winner", 2],
        [Op.Declaration, 1, 0, 0],
        [Op.IfExpr, divideByZero, 6],
        [Op.OwnedText, "discarded", 1],
        [Op.Endif]
      ])
    ).toThrow("Division by zero");
  });

  it("preserves conditional short-circuiting and ignores skipped activations and text errors", () => {
    expect(
      evaluate([
        ...excessiveMacros,
        [Op.Declaration, 1, 0, 0],
        [Op.OwnedText, "fallback", 1],
        [Op.IfExpr, { t: "and", l: { t: "num", v: 0 }, r: divideByZero }, excessiveMacros.length + 6],
        [Op.Declaration, 2, 0, 1],
        [Op.OwnedText, "CHAIN_0", 2],
        [Op.Endif]
      ])
    ).toBe("fallback");
  });

  it("clears all ownership and macro state after text and conditional failures", () => {
    expect(() => evaluate([...excessiveMacros, [Op.Declaration, 1, 0, 9], [Op.OwnedText, "CHAIN_0", 1]])).toThrow();
    expect(evaluate([[Op.Text, "legacy"]])).toBe("legacy");
    expect(() =>
      evaluate([
        [Op.Declaration, 1, 0, 9],
        [Op.IfExpr, divideByZero, 2]
      ])
    ).toThrow();
    expect(
      evaluate([
        [Op.Declaration, 1, 0, 0],
        [Op.OwnedText, "CHAIN_0", 1]
      ])
    ).toBe("CHAIN_0");
    expect(evaluate([[Op.OwnedText, "no stale activation", 1]])).toBe("");
  });

  it("keeps a shared diamond dependency once and drops an unreferenced active declaration", () => {
    const instructions: ShaderInstruction[] = [
      [13, 0, 1],
      [13, 1, 2],
      [13, 1, 3],
      [13, 2, 4],
      [13, 3, 4],
      ...[1, 2, 3, 4, 5].flatMap((owner): ShaderInstruction[] => [
        [Op.Declaration, owner, owner, 0],
        [Op.OwnedText, `${owner}\n`, owner]
      ])
    ];
    expect(evaluate(JSON.parse(JSON.stringify(instructions)))).toBe("1\n2\n3\n4\n");
  });

  it("terminates cyclic dependencies and drops cycles with no stage root", () => {
    expect(
      evaluate([
        [Op.Reference, 0, 1],
        [Op.Reference, 1, 2],
        [Op.Reference, 2, 1],
        [Op.Reference, 2, 2],
        [Op.Reference, 3, 4],
        [Op.Reference, 4, 3],
        ...[1, 2, 3, 4].flatMap((owner): ShaderInstruction[] => [
          [Op.Declaration, owner, owner, 0],
          [Op.OwnedText, `${owner}\n`, owner]
        ])
      ])
    ).toBe("1\n2\n");
  });

  it("never follows the dependencies of inactive or overridden callers", () => {
    expect(
      evaluate([
        [Op.Reference, 0, 1],
        [Op.Reference, 0, 2],
        [Op.Reference, 0, 3],
        [Op.Reference, 1, 4],
        [Op.Reference, 3, 5],
        [Op.Reference, 2, 6],
        [Op.Declaration, 1, 0, 0],
        [Op.Declaration, 2, 0, 1],
        [Op.OwnedText, "old\n", 1],
        [Op.OwnedText, "selected\n", 2],
        ...[4, 5, 6].flatMap((owner): ShaderInstruction[] => [
          [Op.Declaration, owner, owner, 0],
          [Op.OwnedText, `dependency ${owner}\n`, owner]
        ])
      ])
    ).toBe("selected\ndependency 6\n");
  });

  it("retains shared text for any selected reachable owner and preserves expansion timing", () => {
    expect(
      evaluate([
        [Op.Reference, 0, 2],
        [Op.Reference, 0, 4],
        [Op.DefineVal, "VALUE", "early"],
        [Op.OwnedText, "shared VALUE\n", 1, 2],
        [Op.OwnedText, "unreachable\n", 1, 3],
        [Op.OwnedText, "empty owner set\n"],
        [Op.DefineVal, "VALUE", "late"],
        [Op.Declaration, 1, 0, 0],
        [Op.Declaration, 2, 0, 1],
        [Op.Declaration, 3, 1, 0],
        [Op.Declaration, 4, 2, 0],
        [Op.OwnedText, "both VALUE\n", 2, 4]
      ])
    ).toBe("shared early\nboth late\n");
    expect(
      evaluate([
        [Op.Declaration, 1, 0, 0],
        [Op.OwnedText, "legacy ownership union", 2, 1]
      ])
    ).toBe("legacy ownership union");
  });

  it("suppresses unreachable text errors while retaining macro effects and clearing graph state", () => {
    const instructions: ShaderInstruction[] = [
      ...excessiveMacros,
      [Op.Reference, 0, 2],
      [Op.Declaration, 1, 1, 0],
      [Op.OwnedText, "CHAIN_0", 1],
      [Op.DefineVal, "VALUE", "from discarded body"],
      [Op.Declaration, 2, 2, 0],
      [Op.OwnedText, "VALUE", 2]
    ];
    expect(evaluate(instructions)).toBe("from discarded body");
    expect(() => evaluate([...instructions, [Op.Reference, 0, 1]])).toThrow(/nested replacements/i);
    expect(
      evaluate([
        [Op.Declaration, 1, 1, 0],
        [Op.OwnedText, "no graph survives", 1]
      ])
    ).toBe("no graph survives");
    expect(
      evaluate([
        [Op.Reference, 0, 2],
        [Op.Declaration, 1, 1, 0],
        [Op.OwnedText, "no prior reachability", 1]
      ])
    ).toBe("");
  });

  it("walks a deep dependency chain without recursive stack growth", () => {
    const instructions: ShaderInstruction[] = [];
    const count = 12000;
    for (let owner = 1; owner <= count; owner++) {
      instructions.push([Op.Reference, owner - 1, owner], [Op.Declaration, owner, owner, 0]);
    }
    instructions.push([Op.OwnedText, "last dependency", count]);
    expect(evaluate(instructions)).toBe("last dependency");
  });
});
