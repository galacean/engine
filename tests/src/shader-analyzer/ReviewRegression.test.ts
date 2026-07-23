import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderLanguage } from "@galacean/engine-core";
import { GSError, GSErrorName, ShaderSourceParser } from "@galacean/engine-shader-parser";
import { describe, expect, it } from "vitest";

function shader(declarations: string, fragmentBody = "gl_FragColor = vec4(1.0);"): string {
  return `Shader "review-regression" { SubShader "s" { Pass "p" {
struct Attributes { vec3 POSITION; };
${declarations}
void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
void frag() { ${fragmentBody} }
VertexShader = vert;
FragmentShader = frag;
} } }`;
}

function codes(source: string): string[] {
  return new ShaderAnalyzer().analyze(source).diagnostics.map((diagnostic) => diagnostic.code);
}

describe("review regressions", () => {
  it("accepts vector truncation constructors", () => {
    expect(codes(shader("vec3 shortValue = vec3(vec4(1.0));"))).to.not.include("ConstructorArgCount");
  });

  it("rejects incompatible vector and matrix arithmetic shapes", () => {
    const result = codes(
      shader(
        "",
        `
  vec2 a = vec2(0.0);
  vec3 b = vec3(0.0);
  mat2 m = mat2(1.0);
  a = a + b;
  a = m + a;
  gl_FragColor = vec4(a, 0.0, 1.0);`
      )
    );
    expect(result.filter((code) => code === "InvalidBinaryOperands")).to.have.lengthOf(2);
  });

  it("keeps valid matrix-vector multiplication valid", () => {
    expect(
      codes(
        shader(
          "",
          `
  vec2 value = mat2(1.0) * vec2(1.0);
  gl_FragColor = vec4(value, 0.0, 1.0);`
        )
      )
    ).to.not.include("InvalidBinaryOperands");
  });

  it("rejects a bare return from a non-void function", () => {
    expect(codes(shader("float missingValue() { return; }"))).to.include("InvalidReturnType");
  });

  it("recognizes bool literals as constant initializers", () => {
    expect(codes(shader("const bool enabled = true;"))).to.not.include("NonConstInitializer");
  });

  it("uses strict comparison facts to satisfy inclusive declaration guards", () => {
    expect(
      codes(
        shader(
          `
#if QUALITY >= 0
float guardedValue;
#endif
`,
          `
#if QUALITY > 0
  gl_FragColor = vec4(guardedValue);
#else
  gl_FragColor = vec4(0.0);
#endif`
        )
      )
    ).to.not.include("UseBeforeDeclaration");
  });

  it("does not infer mutual recursion from an unresolved overloaded call", () => {
    const result = codes(
      shader(`float first(float value) { return second(vec2(value)); }
float second(vec2 value) { return first(value.x); }`)
    );
    expect(result).to.include("UndefinedFunction");
    expect(result).to.not.include("RecursiveFunction");
  });

  it("reports missing includes as blocking diagnostics", () => {
    const result = new ShaderAnalyzer().analyze(shader('#include "missing.glsl"'));
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "error")).to.equal(true);
    expect(result.diagnostics[0].message).to.include("was not found");
    expect(result.passes).to.be.empty;
  });

  it("resolves relative includes from the supplied shader base path", () => {
    const result = new ShaderAnalyzer().analyze(shader('#include "./common.glsl"'), {
      basePathForIncludeKey: "shaders://root/folder/main.shader",
      includeMap: { "folder/common.glsl": "float includedValue;" }
    });
    expect(result.diagnostics).to.be.empty;
    expect(result.passes).to.have.lengthOf(1);
  });

  it("formats source-parser positions that are not pooled ShaderPosition instances", () => {
    const error = new GSError(
      GSErrorName.CompilationError,
      "entry is missing",
      { index: 0, line: 0, column: 0 },
      undefined
    );
    expect(() => error.toString()).to.not.throw();
  });

  it("does not retain an unresolved RenderQueueType binding", () => {
    const parsed = ShaderSourceParser.parse(`Shader "queue" { SubShader "s" {
RenderQueueType = MissingQueue;
Pass "p" {
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert;
FragmentShader = frag;
}
} }`);
    expect(ShaderSourceParser.errors.some((error) => error.message.includes("MissingQueue"))).to.equal(true);
    expect(Object.values(parsed.subShaders[0].renderStates.variableMap)).to.not.include("MissingQueue");
  });

  it("keeps the first entry binding and its source range", () => {
    const source = `Shader "entry" { SubShader "s" { Pass "p" {
VertexShader = firstVert;
VertexShader = secondVert;
FragmentShader = frag;
void firstVert() { gl_Position = vec4(0.0); }
void secondVert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
} } }`;
    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    expect(pass.vertexEntry).to.equal("firstVert");
    expect(pass.vertexEntryLocation!.start.index).to.equal(source.indexOf("firstVert"));
  });

  it("does not let a dead macro branch satisfy the vertex-position requirement", () => {
    const result = new ShaderAnalyzer().analyze(`Shader "dead-position" { SubShader "s" { Pass "p" {
struct Attributes { vec3 POSITION; };
void vert(Attributes attr) {
#if 0
  gl_Position = vec4(attr.POSITION, 1.0);
#endif
}
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("MissingVertexPosition");
  });

  it("does not treat a dead gl_FragColor write as an MRT conflict", () => {
    const result = new ShaderAnalyzer().analyze(`Shader "dead-frag-color" { SubShader "s" { Pass "p" {
struct MRT { vec4 color; };
void vert() { gl_Position = vec4(0.0); }
MRT frag() {
  MRT outputValue;
  outputValue.color = vec4(1.0);
#if 0
  gl_FragColor = vec4(1.0);
#endif
  return outputValue;
}
VertexShader = vert;
FragmentShader = frag;
} } }`);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.not.include("GlFragColorWithMrt");
  });

  it("does not apply an opposite-stage struct role to a local with the same name", () => {
    const result = new ShaderAnalyzer().analyze(`Shader "stage-local" { SubShader "s" { Pass "p" {
struct Attributes { vec3 POSITION; };
struct Varyings { vec4 color; };
Varyings vert(Attributes input) {
  Varyings outputValue;
  outputValue.color = vec4(input.POSITION, 1.0);
  gl_Position = vec4(input.POSITION, 1.0);
  return outputValue;
}
void frag(Varyings varyingInput) {
  float input = varyingInput.color.x;
  gl_FragColor = vec4(input.x);
}
VertexShader = vert;
FragmentShader = frag;
} } }`);
    expect(result.diagnostics).to.be.empty;
    const pass = result.passes[0];
    const generated = new ShaderCompiler().generate(pass.program, pass.vertexEntry, pass.fragmentEntry, ShaderLanguage.GLSLES100);
    expect(generated.fragment).to.include("input.x");
  });
});
