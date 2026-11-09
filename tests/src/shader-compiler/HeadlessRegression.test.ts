import { expandPreprocessorExpressionMacros } from "@galacean/engine-design";
import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderInstructionEncoder } from "@galacean/engine-shader-compiler/src/ShaderInstructionEncoder";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/src/ShaderPrecompiler";
import { ShaderSourceParser } from "@galacean/engine-shader-parser/internal";
import { describe, expect, it } from "vitest";

function shader(declarations: string, fragment = "gl_FragColor = vec4(1.0);"): string {
  return `Shader "headless-regression" { SubShader "s" { Pass "p" {
${declarations}
void vert() { gl_Position = vec4(0.0); }
void frag() { ${fragment} }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function fragments(source: string, macros: Map<string, string> = new Map()): string[] {
  const analysis = ShaderAnalyzer.analyze(source);
  expect(analysis.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
  const compiler = new ShaderCompiler();
  const results: string[] = [];
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
      results.push(ShaderMacroProcessor.evaluate(program!.fragmentShaderInstructions, new Map(macros)));
    }
  }
  return results;
}

describe("headless and runtime adversarial regressions", () => {
  it("preserves ShaderLab function overrides in all compilation paths", () => {
    const source = `Shader "scope" {
vec4 color() { return vec4(0.25); }
SubShader "s" {
vec4 color() { return vec4(0.375); }
Pass "p" {
vec4 color() { return vec4(0.5); }
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const variant of [source, source.replace("0.25", "0.2\\\n5")]) {
      for (const fragment of fragments(variant)) {
        expect(fragment).toMatch(/vec4\s*\(\s*0\.5\s*\)/);
        expect(fragment).not.toMatch(/0\.25|0\.375/);
      }
    }
  });

  it.each([
    ["nested identity", "#define ID(x) x", "ID(ID(1))"],
    ["function alias", "#define ID(x) x\n#define ALIAS ID", "ALIAS(1)"],
    ["empty argument", "#define CONST(x) 1", "CONST()"],
    ["closing delimiter", "#define CLOSE )", "(1 CLOSE"],
    ["infix operator", "#define AND &&", "(1 AND 1)"],
    ["empty fragment", "#define EMPTY", "(1 EMPTY)"],
    ["opening fragment", "#define OPEN (1", "OPEN + 1)"]
  ])("rescans %s macros before runtime condition evaluation", (_name, definitions, condition) => {
    const source = shader(
      `${definitions}
#if ${condition}
#define VALUE 1.0
#else
#define VALUE 0.0
#endif`,
      "gl_FragColor = vec4(VALUE);"
    );
    for (const fragment of fragments(source)) expect(fragment).toMatch(/vec4\s*\(\s*1\.0\s*\)/);
  });

  it("bounds duplicated macro arguments while retaining recursion suppression", () => {
    const macros = new Map([
      ["ID", { body: "x", parameters: ["x"] }],
      ["DUP", { body: "x + x", parameters: ["x"] }],
      ["SELF", { body: "SELF(x)", parameters: ["x"] }]
    ]);
    expect(expandPreprocessorExpressionMacros("SELF(ID(1))", (name) => macros.get(name)).expression).toBe("SELF ( 1 )");
    const expression = "DUP(".repeat(20) + "1" + ")".repeat(20);
    expect(expandPreprocessorExpressionMacros(expression, (name) => macros.get(name)).error).toContain(
      "replacement tokens"
    );
  });

  it.each(["\n", "\r\n"])("splices tokens before preprocessing across %j line breaks", (newline) => {
    const continuation = "\\" + newline;
    const definitions = `#de${continuation}fine V${continuation}ALUE 1${continuation}0.0`;
    const source = shader(definitions, "gl_FragColor = vec4(VALUE);");
    for (const fragment of fragments(source)) expect(fragment).toMatch(/vec4\s*\(\s*10\.0\s*\)/);
    expect(
      ShaderMacroProcessor.evaluate(ShaderInstructionEncoder.parse(definitions + "\nvec4(VALUE);"), new Map())
    ).toContain("vec4(10.0)");
  });

  it("retains original include ranges after line splicing", () => {
    const chunk = "#define VALUE 1\\\n0.0\nfloat broken = ;";
    const result = ShaderAnalyzer.analyze(shader('#include "chunk.glsl"'), { includeMap: { "chunk.glsl": chunk } });
    const error = result.diagnostics.find((d) => d.code === "SyntaxError")!;
    expect(error.sourceFile).toBe("chunk.glsl");
    expect(error.relatedSource).toBe(chunk);
    expect(error.range.start.line).toBe(3);
    expect(chunk.slice(error.range.start.offset, error.range.end.offset)).toBe(";");
  });

  it("does not interpret block-comment delimiters inside line comments", () => {
    const source = shader(
      `#define FLAG 0
// /*
#undef FLAG
#define FLAG 1
// */
#if FLAG
#define VALUE 1.0
#else
#define VALUE 0.0
#endif`,
      "gl_FragColor = vec4(VALUE);"
    );
    for (const fragment of fragments(source)) expect(fragment).toMatch(/vec4\s*\(\s*1\.0\s*\)/);
  });

  it("accepts directive whitespace and skips unreachable missing includes", () => {
    for (const fragment of fragments(shader('# if 0\n# include "missing.glsl"\n# endif'))) {
      expect(fragment).toMatch(/vec4\s*\(\s*1\.0\s*\)/);
    }
  });

  it.each([
    ["sibling function", "#ifdef USE_IO\n#define OWNER(x) x\n#else\n#define OWNER(x) (x)\n#endif", "OWNER(v).uv"],
    ["sibling object", "#ifdef USE_IO\n#define OWNER a\n#else\n#define OWNER b\n#endif", "OWNER.uv"],
    ["mutated guard", "#define FLAG\n#ifdef FLAG\n#define OWNER(x) x\n#endif\n#undef FLAG", "OWNER(v).uv"]
  ])("keeps %s member ownership consistent with runtime macro selection", (_name, definitions, member) => {
    const expression =
      _name === "mutated guard"
        ? `#ifndef FLAG\ngl_FragColor = vec4(${member}, 0.0, 1.0);\n#endif`
        : `gl_FragColor = vec4(${member}, 0.0, 1.0);`;
    const source = `Shader "owners" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
Varyings v; Varyings a; Varyings b;
${definitions}
Varyings vert() { Varyings outputValue; outputValue.uv = vec2(0.5); gl_Position = vec4(0.0); return outputValue; }
void frag() {
${expression}
}
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const macros of [new Map<string, string>(), new Map([["USE_IO", "1"]])]) {
      for (const fragment of fragments(source, macros)) {
        expect(fragment).toMatch(/(?:varying|in)\s+vec2\s+uv\s*;/);
        expect(fragment).toMatch(/vec4\s*\(\s*uv\s*,/);
        expect(fragment).not.toMatch(/\b(?:v|a|b)\s*\.\s*uv/);
      }
    }
  });

  it.each([
    "return 1.0; float unreachable = 0.0;",
    "return 1.0;\n#if 0\nfloat unreachable = 0.0;\n#endif",
    "#if 1\nreturn 1.0;\n#endif",
    "#ifdef USE\nreturn 1.0;\n#else\nreturn 0.0;\n#endif",
    "if (flag) { return 1.0; float unreachable = 0.0; } else { return 0.0; }"
  ])("accepts complete return paths: %s", (body) => {
    const source = shader(`bool flag; float f() {\n${body}\n}`, "gl_FragColor = vec4(f());");
    expect(ShaderAnalyzer.analyze(source).diagnostics).toEqual([]);
  });

  it.each(["", "#if 0\nreturn 1.0;\n#endif", "if (flag) return 1.0;", "#ifdef USE\nreturn 1.0;\n#endif"])(
    "reports a proven missing return: %s",
    (body) => {
      const source = shader(`bool flag; float f() {\n${body}\n}`, "gl_FragColor = vec4(f());");
      expect(ShaderAnalyzer.analyze(source).diagnostics.map((d) => d.code)).toContain("MissingReturn");
    }
  );

  it("recognizes parenthesized fragment-output indexing", () => {
    expect(ShaderAnalyzer.analyze(shader("", "(gl_FragData)[0] = vec4(1.0);")).diagnostics).toEqual([]);
  });

  it.each([
    ["vec4 value = vec4(1.0); float x = value[ivec2(0)];", "NonIntegerIndex"],
    ["vec4 value = vec4(1.0); float x = value[uvec2(0)];", "NonIntegerIndex"],
    ["bvec2 value = bvec2(true); bvec2 x = !value;", "InvalidUnaryOperand"]
  ])("rejects vector operands for scalar-only operators", (body, code) => {
    expect(
      ShaderAnalyzer.analyze(shader("", body + " gl_FragColor = vec4(1.0);")).diagnostics.map((d) => d.code)
    ).toContain(code);
  });
});
