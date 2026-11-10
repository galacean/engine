import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderInstructionEncoder } from "@galacean/engine-shader-compiler/src/ShaderInstructionEncoder";
import { describe, expect, it } from "vitest";

function evaluate(source: string, names: string[], reserved: string[], macros: Record<string, string> = {}): string {
  const encoded = ShaderInstructionEncoder.generatedNames(source, names, reserved);
  const instructions = JSON.parse(JSON.stringify(ShaderInstructionEncoder.parse(encoded)));
  return ShaderMacroProcessor.evaluate(instructions, new Map(Object.entries(macros)));
}

describe("generated identifier hygiene", () => {
  for (const version of [1, 2] as const) {
    it(`renders the correct varying when runtime macros introduce a collision in WebGL${version}`, () => {
      const gl = document.createElement("canvas").getContext(version === 1 ? "webgl" : "webgl2") as
        | WebGLRenderingContext
        | WebGL2RenderingContext;
      expect(gl).not.toBeNull();
      const names = ["io_a", "output_color"];
      const reserved = ["DECLARE", "VALUE", "main", "gl_Position", "gl_PointSize", "gl_FragColor"];
      const validMacros = { DECLARE: "float io_a = 0.25;", VALUE: "io_a" };
      const header = `${version === 2 ? "#version 300 es\n" : ""}precision highp float;\n`;
      const vertex = evaluate(
        `${version === 1 ? "varying" : "out"} float io_a;\nvoid main() { DECLARE io_a = VALUE; gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }`,
        names,
        reserved,
        validMacros
      );
      const fragment = evaluate(
        `${version === 1 ? "varying" : "in"} float io_a;\n${version === 2 ? "out vec4 output_color;\n" : ""}void main() { ${version === 1 ? "gl_FragColor" : "output_color"} = vec4(io_a, 0.0, 0.0, 1.0); }`,
        names,
        reserved,
        validMacros
      );
      const shaders = [gl.createShader(gl.VERTEX_SHADER)!, gl.createShader(gl.FRAGMENT_SHADER)!];
      const program = gl.createProgram()!;
      try {
        for (let i = 0; i < shaders.length; i++) {
          gl.shaderSource(shaders[i], header + [vertex, fragment][i]);
          gl.compileShader(shaders[i]);
          expect(gl.getShaderInfoLog(shaders[i])).toBe("");
          expect(gl.getShaderParameter(shaders[i], gl.COMPILE_STATUS)).toBe(true);
          gl.attachShader(program, shaders[i]);
        }
        gl.linkProgram(program);
        expect(gl.getProgramParameter(program, gl.LINK_STATUS)).toBe(true);
        gl.useProgram(program);
        gl.viewport(0, 0, 1, 1);
        gl.drawArrays(gl.POINTS, 0, 1);
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        expect(Array.from(pixel)).toEqual([64, 0, 0, 255]);
      } finally {
        gl.deleteProgram(program);
        for (const shader of shaders) gl.deleteShader(shader);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    });
  }

  it("keeps the public source readable without leaking intermediate metadata", () => {
    const source = "out float io_position; void main() { io_position = position; }";
    const encoded = ShaderInstructionEncoder.generatedNames(source, ["io_position"], ["position"]);
    expect(ShaderInstructionEncoder.source(encoded)).toBe(source);
    expect(evaluate(source, ["io_position"], ["position"])).toBe(source);
  });

  it("does not expand runtime macros over generated identifiers", () => {
    const result = evaluate("float io_position; io_position = VALUE;", ["io_position"], ["VALUE"], {
      io_position: "1.0",
      VALUE: "0.25"
    });
    expect(result).toContain("float io_position_1;");
    expect(result).toContain("io_position_1 = 0.25;");
  });

  it("reserves identifiers introduced by external replacement lists", () => {
    const result = evaluate("float io_position; DECLARE io_position = VALUE;", ["io_position"], ["DECLARE", "VALUE"], {
      DECLARE: "float io_position = 0.25;",
      VALUE: "io_position"
    });
    expect(result).toContain("float io_position_1;");
    expect(result).toContain("float io_position = 0.25;");
    expect(result).toContain("io_position_1 = io_position;");
  });

  it("retains only relevant source suffixes without allowing runtime renames to shadow them", () => {
    const source = "float io_a; float io_a_2; float unrelated; io_a = VALUE;";
    const encoded = ShaderInstructionEncoder.generatedNames(source, ["io_a"], ["io_a_2", "unrelated", "VALUE"]);
    const instructions = ShaderInstructionEncoder.parse(encoded);
    expect(instructions[0][2]).toEqual(["io_a_2"]);
    const result = ShaderMacroProcessor.evaluate(
      instructions,
      new Map([
        ["io_a", "invalid"],
        ["VALUE", "0.25"]
      ])
    );
    expect(result).toContain("float io_a_3;");
    expect(result).toContain("float io_a_2;");
  });

  it("keeps default names when macros introduce only non-conflicting suffixes", () => {
    expect(evaluate("float io_a;", ["io_a"], [], { OTHER: "io_a_99" })).toBe("float io_a;");
  });

  it("allocates identical varying names despite stage-local identifier usage", () => {
    const names = ["io_position", "entry_vert", "entry_frag"];
    const reserved = ["position", "main"];
    const macros = { io_position: "entry_vert_9" };
    const vertex = evaluate("out float io_position; void entry_vert() {}", names, reserved, macros);
    const fragment = evaluate("in float io_position; void entry_frag() {}", names, reserved, macros);
    const varying = vertex.match(/out float (\w+);/)![1];
    expect(fragment).toContain(`in float ${varying};`);
    expect(vertex).not.toContain("out float entry_vert_9");
  });

  it("preserves protected identifiers through argument prescan and rescanning", () => {
    const result = evaluate(
      "#define ID(x) x\n#define ALIAS ID\nfloat io_position; ALIAS(io_position) = VALUE;",
      ["io_position"],
      ["ID", "ALIAS", "VALUE", "x"],
      { io_position: "bad", VALUE: "0.25" }
    );
    expect(result).toContain("io_position_1 = 0.25;");
    expect(result).not.toContain("bad");
  });

  it("keeps names protected in selected declaration-owned chunks", () => {
    const source = ShaderInstructionEncoder.declaration("float io_position;", { id: 1, group: 1, sourceScope: 0 });
    const result = evaluate(source, ["io_position"], [], { io_position: "bad" });
    expect(result).toContain("float io_position_1;");
    expect(result).not.toMatch(/[\x00-\x02]/);
  });
});
