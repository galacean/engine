import { Logger, ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/src/ShaderPrecompiler";
import { Lexer, ShaderSourceParser, type MacroDefineList } from "@galacean/engine-shader-parser/internal";
import { describe, expect, it, vi } from "vitest";

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
  const result = ShaderAnalyzer.analyze(source);
  expect(result.diagnostics).to.be.empty;
  const generated = compile(new ShaderCompiler(), source);
  expect(generated).to.not.be.undefined;
  expect(generated.vertexShaderInstructions).to.not.be.undefined;
  expect(generated.fragmentShaderInstructions).to.not.be.undefined;

  return {
    diagnostics: result.diagnostics.map((diagnostic) => diagnostic.code),
    vertex: ShaderMacroProcessor.evaluate(generated.vertexShaderInstructions!, new Map(macros)),
    fragment: ShaderMacroProcessor.evaluate(generated.fragmentShaderInstructions!, new Map(macros))
  };
}

function compile(compiler: ShaderCompiler, source: string) {
  const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
  return compiler._parseShaderPass(pass.contents, pass.vertexEntry, pass.fragmentEntry, ShaderLanguage.GLSLES100, "");
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
  it("blocks an unconditional redefinition in analyzer and offline codegen", () => {
    const source = shader("float u_conflict;\nfloat u_conflict;", "gl_FragColor = vec4(u_conflict);");
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).to.include(
      "Redefinition"
    );
    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).to.throw("Redefinition");
  });

  it("allows a Pass declaration to override an inherited include declaration", () => {
    const source = `Shader "hierarchy-override" {
#include "Shared.glsl"
SubShader "Default" { Pass "p" {
vec3 u_value;
void vert() { gl_Position = vec4(u_value, 1.0); }
void frag() { gl_FragColor = vec4(u_value, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const includeMap = { "Shared.glsl": "float u_value;" };
    expect(ShaderAnalyzer.analyze(source, { includeMap }).diagnostics.map((diagnostic) => diagnostic.code)).not.to
      .include("Redefinition");

    const precompiler = new ShaderPrecompiler();
    precompiler.setIncludeMap(includeMap);
    expect(() => precompiler.precompile(source, ShaderLanguage.GLSLES100)).not.to.throw();
  });

  it("allows an unconditional Pass declaration to override an inherited conditional declaration", () => {
    const source = `Shader "conditional-hierarchy-override" {
#ifdef OUTER_VALUE
float u_value;
#endif
SubShader "Default" { Pass "p" {
vec3 u_value;
void vert() { gl_Position = vec4(u_value, 1.0); }
void frag() { gl_FragColor = vec4(u_value, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;

    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).not.to.include(
      "Redefinition"
    );
    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).not.to.throw();
  });

  it("allows a Pass declaration to override an inherited declaration under the same condition", () => {
    const source = `Shader "matched-conditional-hierarchy-override" {
#ifdef USE_VALUE
float u_value;
#endif
SubShader "Default" { Pass "p" {
#ifdef USE_VALUE
vec3 u_value;
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;

    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).not.to.include(
      "Redefinition"
    );
    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).not.to.throw();
  });

  it("blocks a conditional Pass declaration that cannot fully replace an inherited declaration", () => {
    const source = `Shader "partial-hierarchy-override" {
float u_value;
SubShader "Default" { Pass "p" {
#ifdef USE_VALUE
vec3 u_value;
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;

    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).to.include(
      "Redefinition"
    );
    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).to.throw("Redefinition");
  });

  it("blocks the same proven redefinition in analyzer and codegen", () => {
    const source = shader(
      `#ifdef FIRST_SOURCE
float u_conflict;
#endif
#ifdef SECOND_SOURCE
float u_conflict;
#endif`,
      "gl_FragColor = vec4(u_conflict);"
    );
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("Redefinition");

    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).to.throw("Redefinition");
  });

  it("blocks a proven compound-condition overlap in analyzer and codegen", () => {
    const source = shader(
      `#if MODE == 1 || MODE == 2
float u_conflict;
#endif
#if MODE == 2
float u_conflict;
#endif`,
      "gl_FragColor = vec4(u_conflict);"
    );
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("Redefinition");
    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).to.throw("Redefinition");
  });

  it("blocks a branch-divergent struct contract in analyzer and offline codegen", () => {
    const source = shader(
      `#ifdef HAS_VALUE
struct BranchData { float value; };
#else
struct BranchData { float other; };
#endif
BranchData data;`,
      "gl_FragColor = vec4(data.value);"
    );
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include(
      "AmbiguousMacroBranchResolution"
    );
    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).to.throw(
      "missing from at least one reachable declaration"
    );
  });

  it("reports a deterministic 32-bit overflow consistently in analyzer and offline codegen", () => {
    const source = shader(
      `#define VALUE 4294967296
#if VALUE
float u_value;
#endif`,
      "gl_FragColor = vec4(1.0);"
    );
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("PreprocessorError");
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).not.to.include("Redefinition");

    expect(() => new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100)).to.throw(
      "Integer literal exceeds 32 bits in preprocessor expression"
    );
  });

  it("does not register definitions after a statically matched conditional arm", () => {
    const macroDefineList: MacroDefineList = {};
    const tokens = new Lexer(
      `#if 1
#define LIVE_VALUE 1
#elif 1
#define DEAD_ELIF_VALUE 2
#else
#define DEAD_ELSE_VALUE 3
#endif`,
      macroDefineList
    ).tokenize();
    for (const _token of tokens) {
      // Exhausting the lexer performs directive registration.
    }
    expect(macroDefineList.LIVE_VALUE).to.be.ok;
    expect(macroDefineList.DEAD_ELIF_VALUE).to.be.undefined;
    expect(macroDefineList.DEAD_ELSE_VALUE).to.be.undefined;
  });

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

  it("selects exactly one declaration for complementary #ifdef/#elif !defined arms", () => {
    const source = shader(
      `#ifdef USE_VALUE
float u_value;
#elif !defined(USE_VALUE)
float u_value;
#endif`,
      "gl_FragColor = vec4(u_value);"
    );

    for (const macros of [[], [["USE_VALUE", "1"]]]) {
      const evaluated = evaluate(source, macros);
      expect(evaluated.fragment.match(/uniform\s+float\s+u_value\s*;/g)).to.have.lengthOf(1);
      const compiled = compileInWebGL(evaluated.vertex, evaluated.fragment);
      if (compiled !== "no-webgl") {
        expect(compiled.ok, `vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog}`).to.be.true;
      }
    }
  });

  it("selects exactly one declaration for #ifdef/#elif !macro-value arms", () => {
    const source = shader(
      `#ifdef USE_VALUE
float u_value;
#elif !USE_VALUE
float u_value;
#endif`,
      "gl_FragColor = vec4(u_value);"
    );

    for (const macros of [[], [["USE_VALUE", "0"]], [["USE_VALUE", "1"]]]) {
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

  it("ignores invalid macro replacement syntax after a statically true arm", () => {
    const source = shader(
      `#if 1
float u_value;
#elif 1
#define STRINGIFY(X) #X
#else
#define STRINGIFY_ELSE(X) #X
#endif`,
      "gl_FragColor = vec4(u_value);"
    );

    const evaluated = evaluate(source, []);
    expect(evaluated.fragment).to.include("uniform float u_value;");
    expect(evaluated.fragment).to.not.include("STRINGIFY");
  });

  it("reports a non-complementary #ifndef/#elif declaration gap without blocking codegen", () => {
    const source = shader(
      `#ifndef DISABLE_VALUE
float u_value;
#elif A
float u_value;
#endif`,
      "gl_FragColor = vec4(u_value);"
    );

    const result = ShaderAnalyzer.analyze(source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.deep.equal(["UseBeforeDeclaration"]);
    const compiler = new ShaderCompiler();
    expect(compile(compiler, source)).to.not.be.undefined;
  });

  it("reports a repeated #ifdef/#elif condition without blocking codegen", () => {
    const source = shader(
      `#ifdef USE_VALUE
float u_value;
#elif defined(USE_VALUE)
float u_value;
#endif`,
      "gl_FragColor = vec4(u_value);"
    );

    const result = ShaderAnalyzer.analyze(source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.deep.equal(["UseBeforeDeclaration"]);
    const compiler = new ShaderCompiler();
    expect(compile(compiler, source)).to.not.be.undefined;
  });

  it("reports malformed #elif syntax and blocks compiler output", () => {
    const source = shader(
      `#ifdef USE_VALUE
float u_value;
#elif 123 defined(USE_VALUE)
float u_value;
#endif`,
      "gl_FragColor = vec4(u_value);"
    );

    const result = ShaderAnalyzer.analyze(source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("PreprocessorError");

    const compiler = new ShaderCompiler();
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    try {
      expect(compile(compiler, source)).to.be.undefined;
    } finally {
      errorSpy.mockRestore();
    }
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

      const result = ShaderAnalyzer.analyze(source);
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("InvalidAssignmentTarget");
    }
  );

  it("does not gate compiler codegen when branch-local analysis fails", () => {
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

    const result = ShaderAnalyzer.analyze(source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("InvalidAssignmentTarget");
    const compiler = new ShaderCompiler();
    expect(compile(compiler, source)).to.not.be.undefined;
  });

  it("does not gate compiler codegen when a macro declaration may not cover its reference", () => {
    const source = shader(
      `#ifdef DECLARED_ONLY_WITH_A
float branchValue;
#endif`,
      "gl_FragColor = vec4(branchValue);"
    );

    const result = ShaderAnalyzer.analyze(source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("UseBeforeDeclaration");
    const compiler = new ShaderCompiler();
    expect(compile(compiler, source)).to.not.be.undefined;
  });

  it("retains a guarded global when analyzer coverage is unknown", () => {
    const source = shader(
      `#ifndef CHUNK_INCLUDED
#define CHUNK_INCLUDED
#if defined(EXTERNAL_VALUE)
#define INTERNAL_VALUE
#endif
#if defined(INTERNAL_VALUE) || defined(ALTERNATE_VALUE)
#define MODULE_ENABLED
#endif
#ifdef MODULE_ENABLED
#ifdef INTERNAL_VALUE
int u_space;
#endif
#endif
#endif`,
      `#ifdef INTERNAL_VALUE
gl_FragColor = vec4(float(u_space));
#else
gl_FragColor = vec4(1.0);
#endif`
    );

    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).to.be.empty;

    const generated = new ShaderCompiler().generate(analysis.passes[0], ShaderLanguage.GLSLES100);
    expect(generated).to.not.be.undefined;
    expect(generated!.fragment).to.match(/uniform\s+int\s+u_space\s*;/);

    const fragment = ShaderMacroProcessor.evaluate(
      generated!.fragmentShaderInstructions!,
      new Map([["EXTERNAL_VALUE", ""]])
    );
    expect(fragment).to.match(/uniform\s+int\s+u_space\s*;/);
    const compiled = compileInWebGL(
      ShaderMacroProcessor.evaluate(generated!.vertexShaderInstructions!, new Map([["EXTERNAL_VALUE", ""]])),
      fragment
    );
    if (compiled !== "no-webgl") {
      expect(compiled.ok, `vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog}`).to.be.true;
    }
  });
});
