import { Logger, ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { GLESVisitor } from "@galacean/engine-shader-compiler/src/codeGen/GLESVisitor";
import { GLESBackend } from "@galacean/engine-shader-compiler/src/GLESBackend";
import { getParsedShaderPassPayload, ShaderSourceParser } from "@galacean/engine-shader-parser/internal";
import { describe, expect, it, vi } from "vitest";

const cases = [
  {
    name: "inherited helper",
    inherited: "vec4 color() { return vec4(0.25); } vec4 getColor() { return color(); }",
    override: "vec4 color() { return vec4(0.5); }"
  },
  {
    name: "changed return type",
    inherited: "vec4 color() { return vec4(0.25); } vec4 getColor() { return vec4(color()); }",
    override: "float color() { return 0.5; }"
  },
  {
    name: "overloads",
    inherited: `float color(float value) { return value * 0.25; }
vec4 color(vec4 value) { return value * 0.25; }
vec4 getColor() { return color(vec4(1.0)) + vec4(color(1.0)); }`,
    override: "float color(float value) { return value * 0.5; } vec4 color(vec4 value) { return value * 0.5; }"
  },
  {
    name: "multiple overridden dependencies",
    inherited: `vec4 color() { return vec4(0.25); }
vec4 innerColor() { return color(); }
vec4 getColor() { return innerColor(); }`,
    override: "vec4 innerColor() { return color(); } vec4 color() { return vec4(0.5); }"
  },
  {
    name: "custom struct parameter",
    inherited: `struct ColorData { vec4 value; };
vec4 color(ColorData data) { return data.value * 0.25; }
vec4 getColor() { ColorData data; data.value = vec4(1.0); return color(data); }`,
    override: "vec4 color(ColorData data) { return data.value * 0.5; }"
  },
  {
    name: "new return struct with a nested type",
    inherited: `struct Old { vec4 value; };
Old color() { Old value; value.value = vec4(0.25); return value; }
vec4 getColor() { return color().value; }`,
    override: `struct Leaf { float weight; };
struct New { Leaf nested; vec4 value; };
New color() { New value; value.value = vec4(0.5); return value; }`
  },
  {
    name: "literal array parameter",
    inherited: `float color(float values[2]) { return values[0] * 0.25; }
vec4 getColor() { float values[2]; values[0] = 1.0; values[1] = 0.0; return vec4(color(values)); }`,
    override: "float color(float values[2]) { return values[0] * 0.5; }"
  },
  {
    name: "existing conditional signature type",
    inherited: `#ifdef USE_COLOR
struct ColorData { vec4 value; };
ColorData color() { ColorData value; value.value = vec4(0.25); return value; }
vec4 getColor() { return color().value; }
#else
vec4 getColor() { return vec4(1.0); }
#endif`,
    override: "#ifdef USE_COLOR\nColorData color() { ColorData value; value.value = vec4(0.5); return value; }\n#endif"
  },
  {
    name: "new return struct depending on an inherited type",
    inherited: `struct Payload { float data; };
struct Old { vec4 value; };
Old color() { Old value; value.value = vec4(0.25); return value; }
vec4 getColor() { return color().value; }`,
    override: `struct New { Payload payload; vec4 value; };
New color() { New value; value.value = vec4(0.5); return value; }`
  },
  {
    name: "flattened interface signature",
    inherited: "",
    override: "",
    source: `Shader "forward-interface" {
struct Attributes { vec4 POSITION; }; struct Varyings { vec2 uv; };
Varyings color(Attributes a) { Varyings v; gl_Position = a.POSITION; v.uv = vec2(0.25); return v; }
Varyings getColor(Attributes a) { return color(a); }
SubShader "s" { Pass "p" {
Varyings color(Attributes a) { Varyings v; gl_Position = a.POSITION; v.uv = vec2(0.5); return v; }
void frag(Varyings v) { gl_FragColor = vec4(v.uv, 0.0, 1.0); }
VertexShader = getColor; FragmentShader = frag;
} } }`
  },
  {
    name: "macro alias call",
    inherited: `vec4 color() { return vec4(0.25); }
#define CALL color
vec4 getColor() { return CALL(); }`,
    override: "vec4 color() { return vec4(0.5); }"
  },
  {
    name: "macro mutation between helper and override",
    inherited: `#define VALUE 0.25
vec4 color() { return vec4(VALUE); }
vec4 getColor() { return color() + vec4(VALUE); }`,
    override: "#undef VALUE\n#define VALUE 0.5\nvec4 color() { return vec4(VALUE); }"
  },
  {
    name: "conditional declarations",
    inherited: `#ifdef USE_COLOR
vec4 color() { return vec4(0.25); }
vec4 getColor() { return color(); }
#else
vec4 getColor() { return vec4(1.0); }
#endif`,
    override: "#ifdef USE_COLOR\nvec4 color() { return vec4(0.5); }\n#endif"
  }
];

function shader(inherited: string, override: string): string {
  return `Shader "forward-declarations" {
${inherited}
SubShader "s" { Pass "p" {
${override}
void vert() { gl_Position = getColor(); }
void frag() { gl_FragColor = getColor(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function programs(source: string) {
  const analysis = ShaderAnalyzer.analyze(source);
  expect(analysis.diagnostics).toEqual([]);
  const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
  const compiler = new ShaderCompiler();
  const results: { vertex: string; fragment: string; target: ShaderLanguage; enabled: boolean }[] = [];
  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    const generated = [
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
    for (const program of generated) {
      expect(program).toBeDefined();
      if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected a generated pass");
      for (const enabled of [false, true]) {
        const macros = enabled ? new Map([["USE_COLOR", "1"]]) : new Map<string, string>();
        results.push({
          vertex: ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map(macros)),
          fragment: ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map(macros)),
          target,
          enabled
        });
      }
    }
  }
  return results;
}

describe("forward declarations for inherited function overrides", () => {
  it.each(cases)("preserves declaration context for $name in all three compilation paths", (fixture) => {
    for (const program of programs(fixture.source ?? shader(fixture.inherited, fixture.override))) {
      for (const source of [program.vertex, program.fragment]) {
        if (fixture.name === "flattened interface signature" && source === program.fragment) continue;
        if (fixture.name.includes("conditional") && !program.enabled) {
          expect(source).not.toMatch(/\bcolor\s*\(/);
          continue;
        }
        const prototype = /(?:float|vec4|New|void|ColorData)\s+color\s*\([^;{}]*\)\s*;/.exec(source);
        expect(prototype, source).not.toBeNull();
        expect(prototype!.index).toBeLessThan(source.indexOf(fixture.source ? "void main" : "getColor"));
        if (fixture.name === "new return struct with a nested type") {
          expect(source.indexOf("struct Leaf")).toBeLessThan(source.indexOf("struct New"));
          expect(source.indexOf("struct New")).toBeLessThan(prototype!.index);
          expect(source.match(/struct New\s*\{/g)).toHaveLength(1);
        }
        if (fixture.name === "new return struct depending on an inherited type") {
          expect(source.indexOf("struct Payload")).toBeGreaterThanOrEqual(0);
          expect(source.indexOf("struct Payload")).toBeLessThan(source.indexOf("struct New"));
        }
        if (fixture.name === "flattened interface signature") {
          expect(source).toMatch(/color\s*\(\s*\)\s*;/);
          expect(source).not.toMatch(/\bcolor\s*\(\s*a\s*\)/);
        }
        if (fixture.name === "custom struct parameter") {
          expect(source.indexOf("struct ColorData")).toBeLessThan(prototype!.index);
        }
        if (fixture.name === "macro mutation between helper and override") {
          expect(source).toMatch(/getColor\s*\([^{}]*\)\s*\{[^{}]*0\.25/);
          expect(source).toMatch(/color\s*\([^{};]*\)\s*\{[^{}]*0\.5/);
        }
        if (fixture.name === "changed return type") expect(prototype![0]).toMatch(/^float/);
      }
    }
  });

  it("needs no prototype when calls occur after the override", () => {
    const source = shader(
      "vec4 color() { return vec4(0.25); }",
      "vec4 color() { return vec4(0.5); } vec4 getColor() { return color(); }"
    );
    for (const program of programs(source)) {
      expect(program.vertex + program.fragment).not.toMatch(/vec4\s+color\s*\(\s*\)\s*;/);
    }
  });

  it.each([
    "#define COUNT 2\nstruct New { vec4 value; float weights[COUNT]; };",
    "struct New {\n#ifdef USE_COLOR\nfloat extra;\n#endif\nvec4 value; };",
    "precision highp float;\nstruct New { vec4 value; };"
  ])("rejects context-dependent type relocation with include provenance and recovers: %s", (declaration) => {
    const includeMap = { "types/New.glsl": declaration };
    const source = shader(
      "struct Old { vec4 value; }; Old color() { Old v; v.value = vec4(0.25); return v; } vec4 getColor() { return color().value; }",
      '#include "types/New.glsl"\nNew color() { New v; v.value = vec4(0.5); return v; }'
    );
    const analysis = ShaderAnalyzer.analyze(source, { includeMap, sourceFile: "Root.shader" });
    expect(analysis.diagnostics).toEqual([]);
    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    const compiler = new ShaderCompiler();
    compiler._setIncludeMap(includeMap);
    const precompiler = new ShaderPrecompiler();
    precompiler.setIncludeMap(includeMap);
    const errors = vi.spyOn(Logger, "error").mockImplementation(() => undefined);
    const dispose = vi.spyOn(GLESVisitor.prototype, "dispose");
    try {
      for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
        expect(compiler.generate(analysis.passes[0], target)).toBeUndefined();
        expect(String(errors.mock.calls[errors.mock.calls.length - 1][0])).toMatch(
          /^(?:Root\.shader|types\/New\.glsl): UnsupportedForwardDeclaration:/
        );
        // The source-only backend gives this state assertion the same visitor class as the spy;
        // public compiler calls above and below also exercise the published bundle in browser runs.
        const payload = getParsedShaderPassPayload(analysis.passes[0]);
        expect(GLESBackend.generate(payload.data.ir!, payload.coreInfo!, target)).toBeUndefined();
        const idle = dispose.mock.contexts[dispose.mock.contexts.length - 1] as any;
        expect(idle.context._passSymbolTable).toBeUndefined();
        expect(idle.context.codeCache.size).toBe(0);
        expect(idle._forwardFunctionDeclarations.size).toBe(0);
        expect(idle._forwardStructIndices.size).toBe(0);
        expect(idle._structCodeSegments.size).toBe(0);
        expect(idle._sourceIR).toBeUndefined();
        expect(
          compiler._parseShaderPass(
            pass.contents,
            pass.vertexEntry,
            pass.fragmentEntry,
            target,
            "",
            pass.contentScopeStarts
          )
        ).toBeUndefined();
        expect(() => precompiler.precompile(source, target)).toThrow("precompile failed");
        const valid = shader(cases[0].inherited, cases[0].override);
        const validAnalysis = ShaderAnalyzer.analyze(valid);
        expect(compiler.generate(validAnalysis.passes[0], target)).toBeDefined();
      }
      const messages = errors.mock.calls.map(([message]) => String(message)).join("\n");
      expect(messages).toContain("UnsupportedForwardDeclaration");
      expect(messages).toContain("^");
    } finally {
      dispose.mockRestore();
      errors.mockRestore();
    }
  });
});

describe.skipIf(typeof document === "undefined")("inherited function overrides on WebGL drivers", () => {
  it.each(cases)("compiles and links $name for both targets and macro variants", (fixture) => {
    const contexts = new Map<ShaderLanguage, WebGLRenderingContext | WebGL2RenderingContext>();
    try {
      for (const program of programs(fixture.source ?? shader(fixture.inherited, fixture.override))) {
        let gl = contexts.get(program.target);
        if (!gl) {
          const contextType = program.target === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl";
          gl = document.createElement("canvas").getContext(contextType) as
            | WebGLRenderingContext
            | WebGL2RenderingContext;
          expect(gl, contextType).not.toBeNull();
          contexts.set(program.target, gl);
        }
        const version = program.target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
        const compiled: WebGLShader[] = [];
        const linked = gl.createProgram()!;
        try {
          for (const [source, type] of [
            [program.vertex, gl.VERTEX_SHADER],
            [program.fragment, gl.FRAGMENT_SHADER]
          ] as const) {
            const stage = gl.createShader(type)!;
            compiled.push(stage);
            gl.shaderSource(stage, `${version}precision mediump float;\n${source}`);
            gl.compileShader(stage);
            expect(gl.getShaderParameter(stage, gl.COMPILE_STATUS), gl.getShaderInfoLog(stage) + "\n" + source).toBe(
              true
            );
            gl.attachShader(linked, stage);
          }
          gl.linkProgram(linked);
          expect(gl.getProgramParameter(linked, gl.LINK_STATUS), gl.getProgramInfoLog(linked)).toBe(true);
        } finally {
          gl.deleteProgram(linked);
          for (const stage of compiled) gl.deleteShader(stage);
        }
      }
    } finally {
      for (const gl of contexts.values()) gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  });
});
