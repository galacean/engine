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

function compile(compiler: ShaderCompiler, source: string, platformTarget: ShaderLanguage = ShaderLanguage.GLSLES100) {
  const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
  return compiler._parseShaderPass(pass.contents, pass.vertexEntry, pass.fragmentEntry, platformTarget, "");
}

interface DriverResult {
  ok: boolean;
  vertexLog: string;
  fragmentLog: string;
  programLog: string;
}

function compileInWebGL(
  vertex: string,
  fragment: string,
  platformTarget: ShaderLanguage = ShaderLanguage.GLSLES100
): DriverResult | "no-webgl" {
  const contextType = platformTarget === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl";
  const gl = document.createElement("canvas").getContext(contextType) as
    | WebGLRenderingContext
    | WebGL2RenderingContext
    | null;
  if (!gl) return "no-webgl";
  const version = platformTarget === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";

  const compile = (source: string, type: number): { shader: WebGLShader; ok: boolean; log: string } => {
    const shader = gl.createShader(type)!;
    const precision = type === gl.FRAGMENT_SHADER ? "precision mediump float;\n" : "";
    gl.shaderSource(shader, `${version}${precision}${source}`);
    gl.compileShader(shader);
    return {
      shader,
      ok: gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean,
      log: gl.getShaderInfoLog(shader) || ""
    };
  };

  const vertexResult = compile(vertex, gl.VERTEX_SHADER);
  const fragmentResult = compile(fragment, gl.FRAGMENT_SHADER);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexResult.shader);
  gl.attachShader(program, fragmentResult.shader);
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
  return {
    ok: vertexResult.ok && fragmentResult.ok && linked,
    vertexLog: vertexResult.log,
    fragmentLog: fragmentResult.log,
    programLog: gl.getProgramInfoLog(program) || ""
  };
}

describe("macro branch runtime", () => {
  it("blocks an unconditional redefinition in analyzer and offline codegen", () => {
    const source = shader("float u_conflict;\nfloat u_conflict;", "gl_FragColor = vec4(u_conflict);");
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).to.include("Redefinition");
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
    expect(
      ShaderAnalyzer.analyze(source, { includeMap }).diagnostics.map((diagnostic) => diagnostic.code)
    ).not.to.include("Redefinition");

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

    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).to.include("Redefinition");
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
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("AmbiguousMacroBranchResolution");
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

  it("retains an outer global when conditional local shadowing can disappear at runtime", () => {
    const source = shader(
      "float branchValue;",
      `#if defined(A) && VALUE * VALUE > 1
float branchValue = 2.0;
#endif
#ifdef A
gl_FragColor = vec4(branchValue);
#else
gl_FragColor = vec4(1.0);
#endif`
    );

    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).to.be.empty;

    const compiler = new ShaderCompiler();
    const generated = compiler.generate(analysis.passes[0], ShaderLanguage.GLSLES100);
    expect(generated).to.not.be.undefined;

    const live = compile(compiler, source);
    expect(live).to.not.be.undefined;

    const precompiledPass = new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100).subShaders[0]
      .passes[0];
    expect(precompiledPass.isUsePass).to.be.false;
    if (precompiledPass.isUsePass) throw new Error("Expected a compiled shader pass.");

    for (const [pipeline, program] of [
      ["analyzer handoff", generated!],
      ["live compiler", live!],
      ["offline precompiler", precompiledPass]
    ] as const) {
      for (const value of ["0", "2"]) {
        const macros = new Map([
          ["A", ""],
          ["VALUE", value]
        ]);
        const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, macros);
        const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, macros);

        expect(fragment, `${pipeline} VALUE=${value}`).to.match(/uniform\s+float\s+branchValue\s*;/);
        if (value === "0") {
          expect(fragment, `${pipeline} VALUE=${value}`).not.to.match(/float\s+branchValue\s*=\s*2\.0/);
        } else {
          expect(fragment, `${pipeline} VALUE=${value}`).to.match(/float\s+branchValue\s*=\s*2\.0/);
        }

        const compiled = compileInWebGL(vertex, fragment);
        if (compiled !== "no-webgl") {
          expect(
            compiled.ok,
            `${pipeline} VALUE=${value} vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog}`
          ).to.be.true;
        }
      }
    }
  });

  it("resolves a struct IO global when an opposite macro arm declares a same-named local", () => {
    const fragmentBodies = [
      `#ifdef LOCAL_SHADOW
float v = 1.0;
gl_FragColor = vec4(v);
#else
gl_FragColor = vec4(v.uv, 0.0, 1.0);
#endif`,
      `#ifdef LOCAL_SHADOW
gl_FragColor = vec4(v.uv, 0.0, 1.0);
#else
float v = 1.0;
gl_FragColor = vec4(v);
#endif`
    ];

    for (const [caseIndex, fragmentBody] of fragmentBodies.entries()) {
      const source = `Shader "runtime-struct-shadow-${caseIndex}" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
Varyings v;
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() {
${fragmentBody}
}
VertexShader = vert;
FragmentShader = frag;
} } }`;
      const analysis = ShaderAnalyzer.analyze(source);
      expect(analysis.diagnostics, `case=${caseIndex}`).to.be.empty;

      for (const platformTarget of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
        const compiler = new ShaderCompiler();
        const generated = compiler.generate(analysis.passes[0], platformTarget)!;
        const live = compile(compiler, source, platformTarget)!;
        const offline = new ShaderPrecompiler().precompile(source, platformTarget).subShaders[0].passes[0];
        expect(offline.isUsePass).to.be.false;
        if (offline.isUsePass) throw new Error("Expected a compiled shader pass.");

        for (const [pipeline, program] of [
          ["analyzer handoff", generated],
          ["live compiler", live],
          ["offline precompiler", offline]
        ] as const) {
          for (const localShadow of [false, true]) {
            const macros = new Map<string, string>();
            if (localShadow) macros.set("LOCAL_SHADOW", "");
            const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, macros);
            const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, macros);
            const usesGlobal = caseIndex === Number(localShadow);
            const label = `${pipeline} case=${caseIndex} platform=${platformTarget} LOCAL_SHADOW=${localShadow}`;

            expect(fragment, label).to.match(
              platformTarget === ShaderLanguage.GLSLES100 ? /varying\s+vec2\s+uv\s*;/ : /in\s+vec2\s+uv\s*;/
            );
            if (usesGlobal) {
              expect(fragment, label).to.match(/vec4\s*\(\s*uv\s*,\s*0\.0\s*,\s*1\.0\s*\)/);
              expect(fragment, label).not.to.match(/v\s*\.\s*uv/);
            } else {
              expect(fragment, label).to.match(/float\s+v\s*=\s*1\.0/);
              expect(fragment, label).to.match(/vec4\s*\(\s*v\s*\)/);
            }

            const compiled = compileInWebGL(vertex, fragment, platformTarget);
            if (compiled !== "no-webgl") {
              expect(
                compiled.ok,
                `${label} vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog} program=${compiled.programLog}`
              ).to.be.true;
            }
          }
        }
      }
    }
  });

  it("reuses analyzer ownership proof across independent guards separated by undef", () => {
    const source = `Shader "runtime-struct-mutation" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
struct LocalVaryings { vec2 uv; };
Varyings v;
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() {
#define LOCAL_SHADOW
#ifdef LOCAL_SHADOW
  LocalVaryings v;
  v.uv = vec2(0.25);
#endif
#undef LOCAL_SHADOW
#ifndef LOCAL_SHADOW
  gl_FragColor = vec4(v.uv, 0.0, 1.0);
#endif
}
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).to.be.empty;

    for (const platformTarget of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      const generated = compiler.generate(analysis.passes[0], platformTarget);
      const live = compile(compiler, source, platformTarget);
      const offline = new ShaderPrecompiler().precompile(source, platformTarget).subShaders[0].passes[0];
      expect(generated, `analyzer handoff platform=${platformTarget}`).to.not.be.undefined;
      expect(live, `lean runtime compiler platform=${platformTarget}`).to.be.undefined;
      expect(offline.isUsePass).to.be.false;
      if (offline.isUsePass) throw new Error("Expected a compiled shader pass.");

      for (const [pipeline, program] of [
        ["analyzer handoff", generated!],
        ["offline precompiler", offline]
      ] as const) {
        const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map());
        const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map());
        const label = `${pipeline} platform=${platformTarget}`;
        expect(fragment, label).to.match(/v\s*\.\s*uv\s*=\s*vec2\s*\(\s*0\.25\s*\)/);
        expect(fragment, label).to.match(/vec4\s*\(\s*v\s*\.\s*uv\s*,\s*0\.0\s*,\s*1\.0\s*\)/);
        expect(fragment, label).not.to.match(/vec4\s*\(\s*uv\s*,\s*0\.0\s*,\s*1\.0\s*\)/);

        const compiled = compileInWebGL(vertex, fragment, platformTarget);
        if (compiled !== "no-webgl") {
          expect(
            compiled.ok,
            `${label} vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog} program=${compiled.programLog}`
          ).to.be.true;
        }
      }
    }
  });

  it("keeps unresolved merged macro ownership silent in analysis and blocking in codegen", () => {
    const source = `Shader "runtime-merged-macro-state" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
struct LocalVaryings { vec2 uv; };
Varyings v;
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() {
#ifdef CONFIG
#define LOCAL_SHADOW
#else
#define LOCAL_SHADOW
#endif
#ifdef LOCAL_SHADOW
  LocalVaryings v;
  v.uv = vec2(0.25);
#endif
#undef LOCAL_SHADOW
#ifndef LOCAL_SHADOW
  gl_FragColor = vec4(v.uv, 0.0, 1.0);
#endif
}
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics, analysis.diagnostics.map((diagnostic) => diagnostic.code).join(", ")).to.be.empty;

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).to.equal(undefined);
      expect(compile(compiler, source, target)).to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).to.throw(/precompile failed/);
    }
  });

  it("keeps repeated external guards in the same macro generation", () => {
    const source = `Shader "runtime-repeated-guard" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
struct LocalVaryings { vec2 uv; };
Varyings v;
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() {
#ifdef LOCAL_SHADOW
  LocalVaryings v;
  v.uv = vec2(0.25);
#endif
#ifdef LOCAL_SHADOW
  gl_FragColor = vec4(v.uv, 0.0, 1.0);
#endif
}
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).to.be.empty;

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).not.to.equal(undefined);
      expect(compile(compiler, source, target)).to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).not.to.throw();
    }
  });

  it("rejects repeated guards separated by a definite macro generation", () => {
    const source = `Shader "runtime-versioned-guard" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
struct LocalVaryings { vec2 uv; };
Varyings v;
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() {
#ifdef LOCAL_SHADOW
  LocalVaryings v;
  v.uv = vec2(0.25);
#endif
#undef LOCAL_SHADOW
#define LOCAL_SHADOW
#ifdef LOCAL_SHADOW
  gl_FragColor = vec4(v.uv, 0.0, 1.0);
#endif
}
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("AmbiguousMacroBranchResolution");

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).to.equal(undefined);
      expect(compile(compiler, source, target)).to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).to.throw(/precompile failed/);
    }
  });

  it("combines a conditional local with its outer runtime fallback after undef", () => {
    const source = `Shader "runtime-scope-fallback" { SubShader "s" { Pass "p" {
struct GlobalValue { vec2 uv; };
struct LocalValue { vec2 uv; };
GlobalValue v;
void vert() { gl_Position = vec4(0.0); }
void frag() {
#ifdef LOCAL_SHADOW
  LocalValue v;
  v.uv = vec2(0.25);
#endif
#undef LOCAL_SHADOW
#ifndef LOCAL_SHADOW
  gl_FragColor = vec4(v.uv, 0.0, 1.0);
#endif
}
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).to.be.empty;

    for (const platformTarget of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      const offline = new ShaderPrecompiler().precompile(source, platformTarget).subShaders[0].passes[0];
      expect(offline.isUsePass).to.be.false;
      if (offline.isUsePass) throw new Error("Expected a compiled shader pass.");

      for (const [pipeline, program] of [
        ["analyzer handoff", compiler.generate(analysis.passes[0], platformTarget)!],
        ["live compiler", compile(compiler, source, platformTarget)!],
        ["offline precompiler", offline]
      ] as const) {
        for (const localShadow of [false, true]) {
          const macros = new Map<string, string>();
          if (localShadow) macros.set("LOCAL_SHADOW", "");
          const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, macros);
          const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, macros);
          const label = `${pipeline} platform=${platformTarget} LOCAL_SHADOW=${localShadow}`;
          expect(fragment, label).to.match(/vec4\s*\(\s*v\s*\.\s*uv\s*,\s*0\.0\s*,\s*1\.0\s*\)/);
          if (localShadow) expect(fragment, label).to.match(/v\s*\.\s*uv\s*=\s*vec2\s*\(\s*0\.25\s*\)/);

          const compiled = compileInWebGL(vertex, fragment, platformTarget);
          if (compiled !== "no-webgl") {
            expect(
              compiled.ok,
              `${label} vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog} program=${compiled.programLog}`
            ).to.be.true;
          }
        }
      }
    }
  });

  it("rejects an IO/local owner ambiguity that cannot be lowered across macro mutation", () => {
    const source = `Shader "runtime-io-owner-ambiguity" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
struct LocalValue { vec2 uv; };
Varyings v;
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() {
#ifdef LOCAL_SHADOW
  LocalValue v;
  v.uv = vec2(0.25);
#endif
#undef LOCAL_SHADOW
#ifndef LOCAL_SHADOW
  gl_FragColor = vec4(v.uv, 0.0, 1.0);
#endif
}
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("AmbiguousMacroBranchResolution");

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).to.equal(undefined);
      expect(compile(compiler, source, target)).to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).to.throw(/precompile failed/);
    }
  });

  it("rejects the same IO/local ambiguity through an expression macro owner", () => {
    const source = `Shader "runtime-macro-io-owner-ambiguity" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
struct LocalValue { vec2 uv; };
Varyings v;
#define OWNER v
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() {
#ifdef LOCAL_SHADOW
  LocalValue v;
  v.uv = vec2(0.25);
#endif
#undef LOCAL_SHADOW
#ifndef LOCAL_SHADOW
  gl_FragColor = vec4(OWNER.uv, 0.0, 1.0);
#endif
}
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("AmbiguousMacroBranchResolution");

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).to.equal(undefined);
      expect(compile(compiler, source, target)).to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).to.throw(/precompile failed/);
    }
  });

  it("rejects same-scope macro arms with incompatible member owner roles", () => {
    const source = `Shader "same-scope-owner-roles" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
struct Ordinary { vec2 uv; };
#ifdef USE_IO
Varyings v;
#else
Ordinary v;
#endif
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() { gl_FragColor = vec4(v.uv, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("AmbiguousMacroBranchResolution");

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).to.equal(undefined);
      expect(compile(compiler, source, target)).to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).to.throw(/precompile failed/);
    }
  });

  it("keeps same-scope macro arms with the same member owner role", () => {
    const source = `Shader "same-scope-compatible-owner-roles" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
#ifdef FIRST_LAYOUT
Varyings v;
#else
Varyings v;
#endif
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() { gl_FragColor = vec4(v.uv, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).to.be.empty;

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).not.to.equal(undefined);
      expect(compile(compiler, source, target)).not.to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).not.to.throw();
    }
  });

  it("rejects a member owner projected inside an expression macro", () => {
    const source = `Shader "replacement-member-owner" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
struct Ordinary { vec2 uv; };
Varyings v;
#define OWNER_UV v.uv
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() {
#ifdef LOCAL_SHADOW
  Ordinary v;
  v.uv = vec2(0.25);
#endif
  gl_FragColor = vec4(OWNER_UV, 0.0, 1.0);
}
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("AmbiguousMacroBranchResolution");

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).to.equal(undefined);
      expect(compile(compiler, source, target)).to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).to.throw(/precompile failed/);
    }
  });

  it("rejects an IO member owner substituted through a function-like macro", () => {
    const source = `Shader "function-like-member-owner" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
Varyings v;
#define GET_UV(x) x.uv
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() { gl_FragColor = vec4(GET_UV(v), 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("AmbiguousMacroBranchResolution");

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).to.equal(undefined);
      expect(compile(compiler, source, target)).to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).to.throw(/precompile failed/);
    }
  });

  it("rejects an IO member owner substituted through nested expression macros", () => {
    const source = `Shader "nested-member-owner" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
Varyings v;
#define OWNER v
#define OWNER_UV OWNER.uv
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() { gl_FragColor = vec4(OWNER_UV, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("AmbiguousMacroBranchResolution");

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).to.equal(undefined);
      expect(compile(compiler, source, target)).to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).to.throw(/precompile failed/);
    }
  });

  it("rejects an IO member owner propagated through nested function-like macros", () => {
    const source = `Shader "nested-function-member-owner" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
Varyings v;
#define GET_UV(x) x.uv
#define FORWARD_UV(x) GET_UV(x)
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() { gl_FragColor = vec4(FORWARD_UV(v), 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("AmbiguousMacroBranchResolution");

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).to.equal(undefined);
      expect(compile(compiler, source, target)).to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).to.throw(/precompile failed/);
    }
  });

  it("lowers an IO member selected from an identity macro result", () => {
    const cases = [
      ["function", "#define OWNER(x) x", "OWNER(v).uv"],
      ["parenthesized", "#define OWNER(x) (x)", "OWNER(v).uv"],
      ["object", "#define OWNER v", "OWNER.uv"],
      ["nested-function", "#define OWNER(x) x\n#define WRAP(x) OWNER(x)", "WRAP(v).uv"],
      ["nested-object", "#define OWNER v\n#define WRAP OWNER", "WRAP.uv"]
    ] as const;

    for (const [caseName, definitions, memberExpression] of cases) {
      const source = `Shader "identity-member-owner-${caseName}" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
Varyings v;
${definitions}
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() { gl_FragColor = vec4(${memberExpression}, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
      const analysis = ShaderAnalyzer.analyze(source);
      expect(analysis.diagnostics, caseName).to.be.empty;

      for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
        const compiler = new ShaderCompiler();
        const generated = compiler.generate(analysis.passes[0], target);
        const live = compile(compiler, source, target);
        const offline = new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0];
        expect(generated, `handoff ${caseName} target=${target}`).not.to.equal(undefined);
        expect(live, `live ${caseName} target=${target}`).not.to.equal(undefined);
        expect(offline.isUsePass, `offline ${caseName} target=${target}`).to.be.false;
        if (!generated || !live || offline.isUsePass) throw new Error("Expected three compiled shader passes.");

        for (const [pipeline, program] of [
          ["analyzer handoff", generated],
          ["live compiler", live],
          ["offline precompiler", offline]
        ] as const) {
          const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map());
          const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map());
          const label = `${pipeline} ${caseName} target=${target}`;
          expect(fragment, label).to.match(/vec4\s*\(\s*uv\s*,\s*0\.0\s*,\s*1\.0\s*\)/);
          expect(fragment, label).not.to.match(/\bv\s*\.\s*uv\b|\(\s*v\s*\)\s*\.\s*uv\b/);
          expect(fragment, label).not.to.match(/\bVaryings\s+v\b/);

          const compiled = compileInWebGL(vertex, fragment, target);
          if (compiled !== "no-webgl") {
            expect(
              compiled.ok,
              `${label} vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog} program=${compiled.programLog}`
            ).to.be.true;
          }
        }
      }
    }
  });

  it("keeps an ordinary member selected from an identity macro result", () => {
    const source = `Shader "ordinary-identity-member-owner" { SubShader "s" { Pass "p" {
struct Ordinary { vec2 uv; };
Ordinary ordinary;
#define OWNER(x) x
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(OWNER(ordinary).uv, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).to.be.empty;

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      const generated = compiler.generate(analysis.passes[0], target);
      const live = compile(compiler, source, target);
      const offline = new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0];
      expect(generated).not.to.equal(undefined);
      expect(live).not.to.equal(undefined);
      expect(offline.isUsePass).to.be.false;
      if (!generated || !live || offline.isUsePass) throw new Error("Expected three compiled shader passes.");

      for (const [pipeline, program] of [
        ["analyzer handoff", generated],
        ["live compiler", live],
        ["offline precompiler", offline]
      ] as const) {
        const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map());
        const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map());
        const label = `${pipeline} target=${target}`;
        expect(fragment, label).to.match(/\bOrdinary\s+ordinary\b/);
        expect(fragment, label).to.match(/\bordinary\s*\.\s*uv\b/);

        const compiled = compileInWebGL(vertex, fragment, target);
        if (compiled !== "no-webgl") {
          expect(
            compiled.ok,
            `${label} vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog} program=${compiled.programLog}`
          ).to.be.true;
        }
      }
    }
  });

  it("rejects identity macro results with mixed IO and ordinary owners", () => {
    const source = `Shader "mixed-identity-member-owner" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
struct Ordinary { vec2 uv; };
Varyings v;
Ordinary ordinary;
#ifdef USE_IO
#define OWNER v
#else
#define OWNER ordinary
#endif
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() { gl_FragColor = vec4(OWNER.uv, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("AmbiguousMacroBranchResolution");

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      expect(compiler.generate(analysis.passes[0], target)).to.equal(undefined);
      expect(compile(compiler, source, target)).to.equal(undefined);
      expect(() => new ShaderPrecompiler().precompile(source, target)).to.throw(/precompile failed/);
    }
  });

  it("rejects identity macro IO owners that do not share the selected member", () => {
    const cases = [
      `Shader "incompatible-identity-member-layout" { SubShader "s" { Pass "p" {
#ifdef USE_UV
struct VaryingsUV { vec2 uv; };
VaryingsUV ownerUV;
#define OWNER ownerUV
VaryingsUV vert() {
  VaryingsUV output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
#else
struct VaryingsOther { vec2 other; };
VaryingsOther ownerOther;
#define OWNER ownerOther
VaryingsOther vert() {
  VaryingsOther output;
  output.other = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
#endif
void frag() { gl_FragColor = vec4(OWNER.uv, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`,
      `Shader "incompatible-shared-type-name" { SubShader "s" { Pass "p" {
#ifdef USE_UV
struct Varyings { vec2 uv; };
#else
struct Varyings { vec2 other; };
#endif
Varyings owner;
#define OWNER owner
#ifdef USE_UV
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
#else
Varyings vert() {
  Varyings output;
  output.other = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
#endif
void frag() { gl_FragColor = vec4(OWNER.uv, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`,
      `Shader "incompatible-conditional-member" { SubShader "s" { Pass "p" {
struct Varyings {
#ifdef USE_UV
  vec2 uv;
#else
  vec2 other;
#endif
};
Varyings owner;
#define OWNER owner
Varyings vert() {
  Varyings output;
#ifdef USE_UV
  output.uv = vec2(0.5);
#else
  output.other = vec2(0.5);
#endif
  gl_Position = vec4(0.0);
  return output;
}
void frag() { gl_FragColor = vec4(OWNER.uv, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`
    ] as const;

    for (const source of cases) {
      const analysis = ShaderAnalyzer.analyze(source);
      const diagnosticCodes = analysis.diagnostics.map((diagnostic) => diagnostic.code);
      expect(diagnosticCodes).to.include("AmbiguousMacroBranchResolution");

      for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
        const compiler = new ShaderCompiler();
        expect(compiler.generate(analysis.passes[0], target)).to.equal(undefined);
        expect(compile(compiler, source, target)).to.equal(undefined);
        expect(() => new ShaderPrecompiler().precompile(source, target)).to.throw(/precompile failed/);
      }
    }
  });

  it("keeps unresolved replacement owners silent in analysis and blocking in codegen", () => {
    const sources = [
      `Shader "unknown-function-like-member-owner" { SubShader "s" { Pass "p" {
#define GET_UV(x) x.uv
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(GET_UV(RUNTIME_OWNER), 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`,
      `Shader "unknown-direct-member-owner" { SubShader "s" { Pass "p" {
#define OWNER_UV RUNTIME_OWNER.uv
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(OWNER_UV, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`,
      `Shader "opaque-nested-member-owner" { SubShader "s" { Pass "p" {
#define OPAQUE_OWNER
#define OWNER_UV OPAQUE_OWNER.uv
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(OWNER_UV, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`,
      `Shader "unknown-identity-member-owner" { SubShader "s" { Pass "p" {
#define OWNER(x) x
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(OWNER(RUNTIME_OWNER).uv, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`,
      `Shader "partly-opaque-identity-member-owner" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
Varyings v;
#ifdef USE_IO
#define OWNER v
#else
#define OWNER
#endif
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() { gl_FragColor = vec4(OWNER.uv, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`
    ];

    for (const [caseIndex, source] of sources.entries()) {
      const analysis = ShaderAnalyzer.analyze(source);
      expect(analysis.diagnostics, `case=${caseIndex}`).to.be.empty;

      for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
        const compiler = new ShaderCompiler();
        expect(compiler.generate(analysis.passes[0], target), `handoff case=${caseIndex}`).to.equal(undefined);
        expect(compile(compiler, source, target), `live case=${caseIndex}`).to.equal(undefined);
        expect(() => new ShaderPrecompiler().precompile(source, target), `offline case=${caseIndex}`).to.throw(
          /precompile failed/
        );
      }
    }
  });

  it("keeps a function-like member owner when the actual is an ordinary struct", () => {
    const source = `Shader "ordinary-function-like-member-owner" { SubShader "s" { Pass "p" {
struct Ordinary { vec2 uv; };
Ordinary ordinary;
#define GET_UV(x) x.uv
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(GET_UV(ordinary), 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).to.be.empty;

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      const offline = new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0];
      expect(offline.isUsePass).to.be.false;
      if (offline.isUsePass) throw new Error("Expected a compiled shader pass.");

      for (const [pipeline, program] of [
        ["analyzer handoff", compiler.generate(analysis.passes[0], target)!],
        ["live compiler", compile(compiler, source, target)!],
        ["offline precompiler", offline]
      ] as const) {
        const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map());
        const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map());
        const label = `${pipeline} platform=${target}`;
        expect(fragment, label).to.match(/ordinary\s*\.\s*uv/);

        const compiled = compileInWebGL(vertex, fragment, target);
        if (compiled !== "no-webgl") {
          expect(
            compiled.ok,
            `${label} vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog} program=${compiled.programLog}`
          ).to.be.true;
        }
      }
    }
  });

  it("lowers mutually exclusive expression-macro definitions independently", () => {
    const source = `Shader "exclusive-replacement-member-owners" { SubShader "s" { Pass "p" {
struct Varyings { vec2 uv; };
struct Ordinary { vec2 uv; };
Varyings io;
Ordinary ordinary;
#ifdef USE_IO
#define OWNER_UV io.uv
#else
#define OWNER_UV ordinary.uv
#endif
Varyings vert() {
  Varyings output;
  output.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return output;
}
void frag() { gl_FragColor = vec4(OWNER_UV, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).to.be.empty;

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const compiler = new ShaderCompiler();
      const offline = new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0];
      expect(offline.isUsePass).to.be.false;
      if (offline.isUsePass) throw new Error("Expected a compiled shader pass.");

      for (const [pipeline, program] of [
        ["analyzer handoff", compiler.generate(analysis.passes[0], target)!],
        ["live compiler", compile(compiler, source, target)!],
        ["offline precompiler", offline]
      ] as const) {
        for (const useIO of [false, true]) {
          const macros = new Map<string, string>();
          if (useIO) macros.set("USE_IO", "");
          const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, macros);
          const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, macros);
          const label = `${pipeline} platform=${target} USE_IO=${useIO}`;
          if (useIO) {
            expect(fragment, label).to.match(/vec4\s*\(\s*uv\s*,\s*0\.0\s*,\s*1\.0\s*\)/);
            expect(fragment, label).not.to.match(/io\s*\.\s*uv/);
          } else {
            expect(fragment, label).to.match(/vec4\s*\(\s*ordinary\s*\.\s*uv\s*,\s*0\.0\s*,\s*1\.0\s*\)/);
          }

          const compiled = compileInWebGL(vertex, fragment, target);
          if (compiled !== "no-webgl") {
            expect(
              compiled.ok,
              `${label} vertex=${compiled.vertexLog} fragment=${compiled.fragmentLog} program=${compiled.programLog}`
            ).to.be.true;
          }
        }
      }
    }
  });
});
