import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { Preprocessor } from "@galacean/engine-shader-parser/internal";
import { afterAll, describe, expect, it } from "vitest";

type MacroValues = Record<string, string>;

const contexts = new Map<ShaderLanguage, WebGLRenderingContext | WebGL2RenderingContext>();

afterAll(() => {
  for (const gl of contexts.values()) gl.getExtension("WEBGL_lose_context")?.loseContext();
});

function expectRenderedValue(target: ShaderLanguage, vertex: string, fragment: string, value: number): void {
  let gl = contexts.get(target);
  if (!gl) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    gl = canvas.getContext(target === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl", {
      antialias: false,
      preserveDrawingBuffer: true
    }) as WebGLRenderingContext | WebGL2RenderingContext;
    expect(gl).not.toBeNull();
    contexts.set(target, gl);
  }
  const version = target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
  const program = gl.createProgram()!;
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment]
    ] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      gl.shaderSource(shader, `${version}precision mediump float;\n${source}`);
      gl.compileShader(shader);
      expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), gl.getShaderInfoLog(shader)).toBe(true);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program)).toBe(true);
    gl.useProgram(program);
    gl.viewport(0, 0, 1, 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, 1);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect(Array.from(pixel)).toEqual(Array(4).fill(Math.round(value * 255)));
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

function shader(passBodies: readonly string[], inherited = ""): string {
  return `Shader "cache-identity" {
${inherited}
SubShader "s" {
${passBodies
  .map(
    (body, index) => `Pass "p${index}" {
${body}
void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
VertexShader = vert; FragmentShader = frag;
}`
  )
  .join("\n")}
} }`;
}

function* programs(source: string, includeMap: Record<string, string>, variants: readonly MacroValues[]) {
  const analysis = ShaderAnalyzer.analyze(source, { includeMap });
  expect(analysis.diagnostics).toEqual([]);
  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    const compiler = new ShaderCompiler();
    compiler._setIncludeMap(includeMap);
    const precompiler = new ShaderPrecompiler();
    precompiler.setIncludeMap(includeMap);
    const offline = precompiler.precompile(source, target);
    const passes = compiler._parseShaderSource(source).subShaders[0].passes;
    for (const [passIndex, pass] of passes.entries()) {
      const generated = [
        ["analyzer", compiler.generate(analysis.passes[passIndex], target)],
        [
          "live",
          compiler._parseShaderPass(
            pass.contents,
            pass.vertexEntry,
            pass.fragmentEntry,
            target,
            undefined,
            pass.contentScopeStarts
          )
        ],
        ["offline", offline.subShaders[0].passes[passIndex]]
      ] as const;
      for (const [path, program] of generated) {
        expect(program, `${path}, target ${target}, pass ${passIndex}`).toBeDefined();
        if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected a generated pass");
        for (const macros of variants) {
          yield {
            target,
            pass: passIndex,
            macros,
            label: `${path}, target ${target}, pass ${passIndex}, macros ${JSON.stringify(macros)}`,
            vertex: ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map(Object.entries(macros))),
            fragment: ShaderMacroProcessor.evaluate(
              program.fragmentShaderInstructions!,
              new Map(Object.entries(macros))
            )
          };
        }
      }
    }
  }
}

describe("preprocessor include cache identity", () => {
  it.each(["MODE", "constructor", "toString", "hasOwnProperty"])(
    "preserves %s version identity through a nonempty include cache replay",
    (macro) => {
      const includeMap = { "normal.glsl": "float unrelatedHelper() { return 1.0; }\n" };
      const inherited = `#if defined(${macro})
vec4 color() { return vec4(0.25); }
#endif`;
      const body = `#include "normal.glsl"
#if defined(${macro})
vec4 color() { return vec4(0.5); }
#endif
void frag() {
#if defined(${macro})
  gl_FragColor = color();
#else
  gl_FragColor = vec4(0.0);
#endif
}`;
      // The first Pass expands cold; the identical second Pass must replay the same facts.
      for (const program of programs(shader([body, body], inherited), includeMap, [{}, { [macro]: "1" }])) {
        const enabled = Object.prototype.hasOwnProperty.call(program.macros, macro);
        expect(program.fragment.match(/vec4\s+color\s*\(/g) ?? [], program.label).toHaveLength(enabled ? 1 : 0);
        expect(program.fragment, program.label).not.toContain("0.25");
        expectRenderedValue(program.target, program.vertex, program.fragment, enabled ? 0.5 : 0);
      }
    }
  );

  it.each([false, true])("distinguishes unknown and empty replacements with reverse order %s", (reverse) => {
    const includeMap = {
      "shared.glsl": `#if M 1
vec4 color() { return vec4(0.5); }
#else
vec4 color() { return vec4(0.25); }
#endif`
    };
    const suffix = '#include "shared.glsl"\nvoid frag() { gl_FragColor = color(); }';
    const known = `#define M\n#define M\n${suffix}`;
    const unknown = `#if A
#define M
#else
#define M !
#endif
${suffix}`;
    const bodies = reverse ? [unknown, known] : [known, unknown];
    const variants = [{ A: "0" }, { A: "1" }];
    for (const program of programs(shader(bodies), includeMap, variants)) {
      const conditional = bodies[program.pass] === unknown;
      const value = conditional && program.macros.A === "0" ? 0.25 : 0.5;
      expect(program.fragment.match(/vec4\s+color\s*\(/g), program.label).toHaveLength(1);
      expect(program.fragment, program.label).toContain(String(value));
      expectRenderedValue(program.target, program.vertex, program.fragment, value);
    }
    for (const program of programs(shader([unknown]), includeMap, variants)) {
      expectRenderedValue(program.target, program.vertex, program.fragment, program.macros.A === "0" ? 0.25 : 0.5);
    }
  });

  it.each(["MODE", "constructor", "toString", "hasOwnProperty", "__proto__"])(
    "preserves source mutations of %s across cached snapshots",
    (macro) => {
      const includeMap = { "normal.glsl": "float unrelatedHelper() { return 1.0; }\n" };
      const source = `#include "normal.glsl"
#define ${macro} 1
#undef ${macro}
#define ${macro} 1
#if EXTERNAL
#undef ${macro}
#endif
#if defined(${macro})
float active;
#else
float inactive;
#endif`;
      const cache = new Map();
      const cold = Preprocessor.parseWithErrors(source, "", includeMap, cache);
      const warm = Preprocessor.parseWithErrors(source, "", includeMap, cache);
      expect(warm.errors).toEqual([]);
      expect(warm.content).toEqual(cold.content);
      expect(warm.content).toContain("float active;");
      expect(warm.content).toContain("float inactive;");
      expect(warm.conditionalArms).toEqual(cold.conditionalArms);
    }
  );
});
