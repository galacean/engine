import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderInstructionEncoder } from "@galacean/engine-shader-compiler/src/ShaderInstructionEncoder";
import { describe, expect, it } from "vitest";

describe("nested declaration ownership", () => {
  for (const outerSelected of [false, true]) {
    for (const innerSelected of [false, true]) {
      it(`requires outer=${outerSelected} and inner=${innerSelected} for nested text`, () => {
        const outer = { id: 1, group: 1, sourceScope: 0 };
        const inner = { id: 2, group: 2, sourceScope: 0 };
        const nested = ShaderInstructionEncoder.sharedDeclaration("nested\n", [inner]);
        const source =
          `#ifdef OUTER\n${ShaderInstructionEncoder.declaration("", outer)}#endif\n` +
          `#ifdef INNER\n${ShaderInstructionEncoder.declaration("", inner)}#endif\n` +
          ShaderInstructionEncoder.sharedDeclaration(`before\n${nested}after\n`, [outer]);
        const macros = new Map<string, string>();
        if (outerSelected) macros.set("OUTER", "");
        if (innerSelected) macros.set("INNER", "");
        const instructions = JSON.parse(JSON.stringify(ShaderInstructionEncoder.parse(source)));
        const result = ShaderMacroProcessor.evaluate(instructions, macros);
        expect(result.includes("before")).toBe(outerSelected);
        expect(result.includes("after")).toBe(outerSelected);
        expect(result.includes("nested")).toBe(outerSelected && innerSelected);
      });
    }
  }

  it("retains OR semantics within each ownership group", () => {
    const first = { id: 1, group: 1, sourceScope: 0 };
    const replacement = { id: 2, group: 1, sourceScope: 1 };
    const inner = { id: 3, group: 2, sourceScope: 0 };
    const source =
      ShaderInstructionEncoder.declaration("", first) +
      ShaderInstructionEncoder.declaration("", replacement) +
      ShaderInstructionEncoder.declaration("", inner) +
      ShaderInstructionEncoder.sharedDeclaration(ShaderInstructionEncoder.sharedDeclaration("selected", [inner]), [
        first,
        replacement
      ]);
    expect(ShaderMacroProcessor.evaluate(ShaderInstructionEncoder.parse(source), new Map())).toContain("selected");
  });

  it("requires each selected owner to be reachable", () => {
    const outer = { id: 1, group: 1, sourceScope: 0 };
    const inner = { id: 2, group: 2, sourceScope: 0 };
    const source =
      ShaderInstructionEncoder.declaration("", outer) +
      ShaderInstructionEncoder.declaration("", inner) +
      ShaderInstructionEncoder.reference(0, outer.id) +
      ShaderInstructionEncoder.sharedDeclaration(ShaderInstructionEncoder.sharedDeclaration("nested", [inner]), [
        outer
      ]);
    expect(ShaderMacroProcessor.evaluate(ShaderInstructionEncoder.parse(source), new Map())).not.toContain("nested");
    const reachable = source + ShaderInstructionEncoder.reference(outer.id, inner.id);
    expect(ShaderMacroProcessor.evaluate(ShaderInstructionEncoder.parse(reachable), new Map())).toContain("nested");
  });
});
