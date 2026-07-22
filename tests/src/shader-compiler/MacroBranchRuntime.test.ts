import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";

function shader(declarations: string, fragmentBody: string): string {
  return `Shader "macro-branch-runtime" { SubShader "s" { Pass "p" {
${declarations}
void vert() { gl_Position = vec4(0.0); }
void frag() {
${fragmentBody}
}
VertexShader = vert;
FragmentShader = frag;
} } }`;
}

function evaluate(source: string, macros: Array<[string, string]>) {
  const result = new ShaderAnalyzer().analyze(source);
  expect(result.diagnostics, "only clean analysis results may enter code generation").to.be.empty;
  const pass = result.passes[0];
  expect(pass).to.not.be.undefined;

  const generated = new ShaderCompiler().generate(
    pass.program,
    pass.vertexEntry,
    pass.fragmentEntry,
    ShaderLanguage.GLSLES100
  );
  expect(generated.vertexShaderInstructions).to.not.be.undefined;
  expect(generated.fragmentShaderInstructions).to.not.be.undefined;

  return {
    diagnostics: result.diagnostics.map((diagnostic) => diagnostic.code),
    vertex: ShaderMacroProcessor.evaluate(generated.vertexShaderInstructions!, new Map(macros)),
    fragment: ShaderMacroProcessor.evaluate(generated.fragmentShaderInstructions!, new Map(macros))
  };
}

interface DriverResult {
  ok: boolean;
  vertexLog: string;
  fragmentLog: string;
}

function compileInWebGL(vertex: string, fragment: string): DriverResult | "no-webgl" {
  const gl = document.createElement("canvas").getContext("webgl");
  if (!gl) return "no-webgl";

  const compile = (source: string, type: number): { ok: boolean; log: string } => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, type === gl.FRAGMENT_SHADER ? `precision mediump float;\n${source}` : source);
    gl.compileShader(shader);
    return {
      ok: gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean,
      log: gl.getShaderInfoLog(shader) || ""
    };
  };

  const vertexResult = compile(vertex, gl.VERTEX_SHADER);
  const fragmentResult = compile(fragment, gl.FRAGMENT_SHADER);
  return { ok: vertexResult.ok && fragmentResult.ok, vertexLog: vertexResult.log, fragmentLog: fragmentResult.log };
}

describe("macro branch runtime", () => {
  it("selects exactly one declaration after a mutually exclusive conditional #undef", () => {
    const source = shader(
      `#ifdef FIRST_PATH
  #ifndef CONDITIONAL_GUARD
    #define CONDITIONAL_GUARD
    float u_value;
  #endif
#else
  #undef CONDITIONAL_GUARD
#endif
#ifndef CONDITIONAL_GUARD
  #define CONDITIONAL_GUARD
  float u_value;
#endif`,
      "gl_FragColor = vec4(u_value);"
    );

    for (const macros of [[], [["FIRST_PATH", ""]]]) {
      const evaluated = evaluate(source, macros);
      expect(evaluated.diagnostics).to.be.empty;
      expect(evaluated.fragment.match(/uniform\s+float\s+u_value\s*;/g)).to.have.lengthOf(1);
      const compiled = compileInWebGL(evaluated.vertex, evaluated.fragment);
      if (compiled !== "no-webgl") {
        expect(compiled.ok, `vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog}`).to.be.true;
      }
    }
  });

  it("selects exactly one declaration for complementary numeric #if expressions", () => {
    const source = shader(
      `#if MODE == 1
float u_value;
#endif
#if MODE != 1
float u_value;
#endif`,
      "gl_FragColor = vec4(u_value);"
    );

    for (const macros of [[["MODE", "1"]], [["MODE", "2"]]]) {
      const evaluated = evaluate(source, macros);
      expect(evaluated.diagnostics).to.be.empty;
      expect(evaluated.fragment.match(/uniform\s+float\s+u_value\s*;/g)).to.have.lengthOf(1);
      const compiled = compileInWebGL(evaluated.vertex, evaluated.fragment);
      if (compiled !== "no-webgl") {
        expect(compiled.ok, `vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog}`).to.be.true;
      }
    }
  });

  it("selects exactly one declaration for complementary #ifndef/#elif defined arms", () => {
    const source = shader(
      `#ifndef DISABLE_VALUE
float u_value;
#elif defined(DISABLE_VALUE)
float u_value;
#endif`,
      "gl_FragColor = vec4(u_value);"
    );

    for (const macros of [[], [["DISABLE_VALUE", "1"]]]) {
      const evaluated = evaluate(source, macros);
      expect(evaluated.fragment.match(/uniform\s+float\s+u_value\s*;/g)).to.have.lengthOf(1);
      const compiled = compileInWebGL(evaluated.vertex, evaluated.fragment);
      if (compiled !== "no-webgl") {
        expect(compiled.ok, `vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog}`).to.be.true;
      }
    }
  });

  it("selects the first true #elif arm", () => {
    const source = shader(
      `#if 0
float u_value;
#elif 0
float u_value;
#elif 1
float u_value;
#elif 1
float u_value;
#else
float u_value;
#endif`,
      "gl_FragColor = vec4(u_value);"
    );

    const evaluated = evaluate(source, []);
    expect(evaluated.fragment.match(/uniform\s+float\s+u_value\s*;/g)).to.have.lengthOf(1);
    const compiled = compileInWebGL(evaluated.vertex, evaluated.fragment);
    if (compiled !== "no-webgl") {
      expect(compiled.ok, `vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog}`).to.be.true;
    }
  });

  it("blocks codegen for a non-complementary #ifndef/#elif declaration gap", () => {
    const source = shader(
      `#ifndef DISABLE_VALUE
float u_value;
#elif A
float u_value;
#endif`,
      "gl_FragColor = vec4(u_value);"
    );

    const analyzer = new ShaderAnalyzer();
    const result = analyzer.analyze(source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.deep.equal(["UseBeforeDeclaration"]);
    expect(result.passes).to.be.empty;

    const compiler = new ShaderCompiler();
    compiler._setAnalyzer(analyzer);
    expect(compiler._parseShaderPass(source, "vert", "frag", ShaderLanguage.GLSLES100, "")).to.be.undefined;
  });

  it.each([
    ["const", "const float branchValue = 0.0;", "float branchValue = 0.0;", "branchValue = 1.0;"],
    ["implicit uniform", "float branchValue;", "float branchValue = 0.0;", "branchValue = 1.0;"],
    ["sampler", "sampler2D branchValue;", "vec4 branchValue = vec4(0.0);", "branchValue = branchValue;"]
  ])(
    "reports a branch-local %s assignment as non-modifiable",
    (_name, restrictedDeclaration, fallbackDeclaration, assignment) => {
      const source = shader(
        `#ifdef WRITE_PROHIBITED
${restrictedDeclaration}
#else
${fallbackDeclaration}
#endif`,
        `#ifdef WRITE_PROHIBITED
${assignment}
#endif
gl_FragColor = vec4(branchValue);`
      );

      const result = new ShaderAnalyzer().analyze(source);
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("InvalidAssignmentTarget");
      expect(result.passes).to.be.empty;
    }
  );

  it("blocks compiler codegen when branch-local analysis fails", () => {
    const source = shader(
      `#ifdef WRITE_PROHIBITED
const float branchValue = 0.0;
#else
float branchValue = 0.0;
#endif`,
      `#ifdef WRITE_PROHIBITED
branchValue = 1.0;
#endif
gl_FragColor = vec4(branchValue);`
    );

    const analyzer = new ShaderAnalyzer();
    const result = analyzer.analyze(source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("InvalidAssignmentTarget");
    expect(result.passes).to.be.empty;

    const compiler = new ShaderCompiler();
    compiler._setAnalyzer(analyzer);
    expect(compiler._parseShaderPass(source, "vert", "frag", ShaderLanguage.GLSLES100, "")).to.be.undefined;
  });

  it("blocks compiler codegen when a macro declaration does not cover its reference", () => {
    const source = shader(
      `#ifdef DECLARED_ONLY_WITH_A
float branchValue;
#endif`,
      "gl_FragColor = vec4(branchValue);"
    );

    const analyzer = new ShaderAnalyzer();
    const result = analyzer.analyze(source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("UseBeforeDeclaration");
    expect(result.passes).to.be.empty;

    const compiler = new ShaderCompiler();
    compiler._setAnalyzer(analyzer);
    expect(compiler._parseShaderPass(source, "vert", "frag", ShaderLanguage.GLSLES100, "")).to.be.undefined;
  });
});
