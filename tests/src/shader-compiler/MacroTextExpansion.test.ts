import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { expandPreprocessorExpressionMacros, expandShaderMacros } from "@galacean/engine-design";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { ShaderInstructionEncoder } from "../../../packages/shader-compiler/src/ShaderInstructionEncoder";
import { ShaderSourceParser } from "@galacean/engine-shader-parser/internal";
import { describe, expect, it } from "vitest";

function evaluate(source: string): string {
  return ShaderMacroProcessor.evaluate(ShaderInstructionEncoder.parse(source), new Map());
}

describe("shader text macro expansion", () => {
  it.each([
    ["nested arguments", "#define ID(x) x", "ID(ID(1.0))", "1.0"],
    ["object alias calls", "#define ID(x) x\n#define ALIAS ID", "ALIAS(1.0)", "1.0"],
    ["returned function calls", "#define ID(x) x\n#define GET() ID", "GET()(1.0)", "1.0"],
    ["simultaneous parameters", "#define SUB(a,b) a-b", "SUB(b,1.0)", "b-1.0"],
    ["independent calls", "#define ID(x) x", "ID(1.0)+ID(2.0)", "1.0+2.0"],
    ["empty object macros", "#define EMPTY", "left EMPTY right", "leftright"],
    ["empty function macros", "#define EMPTY()", "left EMPTY() right", "leftright"],
    ["direct recursion", "#define SELF SELF", "SELF", "SELF"],
    ["mutual recursion", "#define A B\n#define B A", "A", "A"],
    ["recursive functions", "#define SELF(x) SELF(x)", "SELF(1.0)", "SELF(1.0)"]
  ])("handles %s", (_name, definitions, expression, expected) => {
    expect(evaluate(`${definitions}\n${expression}`).replace(/\s/g, "")).toBe(expected);
  });

  it("preserves complete GLSL numbers, operators and member access during replacement", () => {
    const source = "#define ONE 1.0\nfloat x=ONE+.5e-2; x++; x+=2.0f; x<<=1; x>>=1; value.xy=x;";
    expect(evaluate(source).trim()).toBe("float x=1.0+.5e-2; x++; x+=2.0f; x<<=1; x>>=1; value.xy=x;");
  });

  it("removes argument padding while preserving replacement-list spacing", () => {
    expect(evaluate("#define SAMPLE(tex, coord) textureLod(tex, coord, 0.0)\nSAMPLE(myTex, uv)\n")).toBe(
      "textureLod(myTex, uv, 0.0)\n"
    );
    expect(
      evaluate(
        "#define TRANSFORM_UV(uv) APPLY_TILING(uv, offset)\n#define APPLY_TILING(uv, to) ((uv) * (to).xy)\nTRANSFORM_UV(v_uv)\n"
      )
    ).toBe("((v_uv) * (offset).xy)\n");
    expect(evaluate("#define PLUS(x) +x\nPLUS(  +value  )").trim()).toBe("+ +value");
  });

  it("keeps branch-selected macro output stable with padded arguments", () => {
    const instructions = ShaderInstructionEncoder.parse(
      "#ifdef GRAPHICS_API_WEBGL2\n#define SAMPLE(tex, coord) textureLod(tex, coord, 0.0)\n#else\n#define SAMPLE(tex, coord) texture2D(tex, coord)\n#endif\nSAMPLE(myTex, uv)\n"
    );
    expect(ShaderMacroProcessor.evaluate(instructions, new Map([["GRAPHICS_API_WEBGL2", ""]]))).toBe(
      "textureLod(myTex, uv, 0.0)\n"
    );
    expect(ShaderMacroProcessor.evaluate(instructions, new Map())).toBe("texture2D(myTex, uv)\n");
  });

  it("preserves argument comments and line breaks when trimming padding", () => {
    const macro = { body: "x", parameters: ["x"] };
    expect(expandShaderMacros("ID( \n 1.0 \n )", (name) => (name === "ID" ? macro : undefined)).source).toBe(
      "\n 1.0 \n"
    );
    expect(expandShaderMacros("ID( /* note */ 1.0 )", (name) => (name === "ID" ? macro : undefined)).source).toBe(
      "/* note */ 1.0"
    );
  });

  it("does not form new preprocessing tokens at replacement boundaries", () => {
    expect(evaluate("#define PLUS +\nPLUS+1").trim()).toBe("+ +1");
    expect(evaluate("#define PLUS +\nPLUS++x").trim()).toBe("+ ++x");
    expect(evaluate("#define LEFT <\nLEFT<=x").trim()).toBe("< <=x");
    expect(evaluate("#define SLASH /\nSLASH/=x").trim()).toBe("/ /=x");
    expect(evaluate("#define SLASH /\nSLASH*=x").trim()).toBe("/ *=x");
    expect(evaluate("#define EXP 1e\nEXP+2").trim()).toBe("1e +2");
    expect(evaluate("#define EMPTY\na EMPTY b").trim()).toBe("a  b");
  });

  it("preserves comments, strings and newlines without expanding their names", () => {
    const macros = new Map([
      ["ID", { body: "x", parameters: ["x"] }],
      ["VALUE", { body: "1.0" }]
    ]);
    const source = '// VALUE\n/* VALUE\nID(VALUE) */\n"VALUE"\nID /* invocation */\n(VALUE)';
    const expanded = expandShaderMacros(source, (name) => macros.get(name));
    expect(expanded.error).toBeUndefined();
    expect(expanded.source).toBe('// VALUE\n/* VALUE\nID(VALUE) */\n"VALUE"\n1.0');
  });

  it("uses the same expansion rules in shader text and integer conditions", () => {
    const macros = new Map([
      ["ID", { body: "x", parameters: ["x"] }],
      ["ALIAS", { body: "ID" }],
      ["GET", { body: "ALIAS", parameters: [] }]
    ]);
    const source = "GET()(ID(ID(1)))";
    expect(expandShaderMacros(source, (name) => macros.get(name)).source).toBe("1");
    expect(expandPreprocessorExpressionMacros(source, (name) => macros.get(name)).expression).toBe("1");
  });

  it("treats comments in replacement lists as whitespace", () => {
    const macros = new Map([
      ["VALUE", { body: "1.0 // VALUE" }],
      ["ID", { body: "x /* x */", parameters: ["x"] }]
    ]);
    expect(expandShaderMacros("ID(VALUE)+2.0", (name) => macros.get(name)).source.replace(/\s/g, "")).toBe("1.0+2.0");
  });

  it("preserves source on the no-macro and no-match paths", () => {
    const source = "float value = .5;\nvalue += 1.0;\n";
    expect(evaluate(source)).toBe(source);
    expect(evaluate(`#define UNUSED 1.0\n${source}`).trim()).toBe(source.trim());
  });

  it.each([
    ["nested arguments", "#define ID(x) x", "ID(ID(1.0))"],
    ["object alias calls", "#define ID(x) x\n#define ALIAS ID", "ALIAS(1.0)"]
  ])("expands %s in analyzer handoff, live compilation and offline artifacts", (_name, definitions, expression) => {
    const source = `Shader "macro-text" { SubShader "s" { Pass "p" {
${definitions}
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(${expression}); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).toEqual([]);
    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    const compiler = new ShaderCompiler();
    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const programs = [
        compiler.generate(analysis.passes[0], target),
        compiler._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          target,
          "",
          pass.contentScopeStarts
        ),
        new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0]
      ];
      for (const program of programs) {
        expect(program).toBeDefined();
        if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected compiled pass.");
        const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map());
        expect(fragment).toMatch(/vec4\s*\(\s*1\.0\s*\)/);
        expect(fragment).not.toMatch(/\b(?:ID|ALIAS)\b/);
      }
    }
  });
});
