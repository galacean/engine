import { describe, expect, it } from "vitest";
import { ShaderMacroProcessor } from "../../core/src/shader/ShaderMacroProcessor";
import { RAW_GLSL_MACROS, rawGlslInstructions } from "../src/building/runtime/RawGlslInstructions";

const source = RAW_GLSL_MACROS.map((macro) => `#ifdef ${macro}\nvoid enabled_${macro}();\n#endif\n`).join("");
const evaluate = (instructions: ReturnType<typeof rawGlslInstructions>, active: readonly string[]) =>
  ShaderMacroProcessor.evaluate([...instructions], new Map(active.map((macro) => [macro, ""])));
const EMPTY_DIRECTIVE = /^[ \t]*#[ \t]*(?:define|ifdef|ifndef|undef)[ \t]*$/m;

describe("recovered GLSL instructions", () => {
  it.each(RAW_GLSL_MACROS)("keeps a complete directive when %s is active", (macro) => {
    const output = evaluate(rawGlslInstructions(RAW_GLSL_MACROS, source), [macro]);
    expect(output).not.toMatch(EMPTY_DIRECTIVE);
    expect(output).toContain(`#define BUILDING_RAW_${macro}\n`);
    expect(output).toContain(`#ifdef BUILDING_RAW_${macro}\n`);
  });

  it("keeps every directive complete when all macros are active", () => {
    expect(evaluate(rawGlslInstructions(RAW_GLSL_MACROS, source), RAW_GLSL_MACROS)).not.toMatch(EMPTY_DIRECTIVE);
  });

  it("does not define an inactive macro for the GL driver", () => {
    const output = evaluate(rawGlslInstructions(RAW_GLSL_MACROS, source), []);
    expect(output).not.toContain("#define");
    expect(output).toContain("#ifdef BUILDING_RAW_RENDERER_WORLD_PICK\n");
  });

  it("aliases macros that have no gate in this stage", () => {
    const output = evaluate(rawGlslInstructions(["RENDERER_MASONRY_ENTRANCE"], source), ["RENDERER_WORLD_PICK"]);
    expect(output).not.toMatch(EMPTY_DIRECTIVE);
    expect(output).not.toContain("#define");
  });

  it("uses absolute jumps after preceding instructions", () => {
    const prefix: ReturnType<typeof rawGlslInstructions> = [
      [0, "// a\n"],
      [0, "// b\n"],
      [0, "// c\n"]
    ];
    const instructions = [...prefix, ...rawGlslInstructions(RAW_GLSL_MACROS, source, prefix.length)];
    const output = evaluate(instructions, ["RENDERER_WORLD_PICK_DEPTH"]);
    expect(output).toContain("#define BUILDING_RAW_RENDERER_WORLD_PICK_DEPTH\n");
    expect(output).not.toContain("#define BUILDING_RAW_RENDERER_WORLD_PICK\n");
    expect(output).not.toContain("#define BUILDING_RAW_RENDERER_MASONRY_ENTRANCE\n");
  });
});
